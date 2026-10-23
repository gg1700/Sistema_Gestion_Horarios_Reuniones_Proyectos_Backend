import * as ProfileTypes from "../types/profile.types";
import * as ProfileRepo from "../repositories/profile.repository";
import * as ProfileReadRepo from "../repositories/profile-read.repository";
import type { Profile } from "../types/profile-response.types";
import * as Mapper from "../helpers/mapper.helper";
import { processTransaction } from "../utils/query";
import { PoolClient } from "pg";
import { AuthenticationError, ConflictError, NotFoundError, ServerError, ValidationError } from "../helpers/errors.helper";
import * as ImageService from "./image.service";
import * as WorkExpTypes from "../types/work_experience.types";
import { today, tody60YearsAgo } from "../utils/constants/date.constants";

export async function getOwnProfile(userId: string): Promise<Profile> {
  const profile = await ProfileReadRepo.findOwnProfile(userId);
  if (!profile) throw new AuthenticationError("Sesion invalida o usuario no disponible");

  return {
    id: profile.id,
    handleName: profile.handle_name,
    name: profile.name,
    firstSurname: profile.first_surname,
    email: profile.email,
    profilePicture: profile.profile_picture,
    surname: profile.surname,
    phones: profile.phones,
    contactEmails: profile.contact_emails,
    addresses: profile.addresses,
    countries: profile.countries,
    workExperiences: profile.work_experiences,
    links: profile.links,
  };
}

export async function modifyPersonalInfo(
  userId: string,
  editablePersonalInfo: ProfileTypes.EditablePersonalInfo,
  profilePicture: Express.Multer.File | undefined) {
  try {
    const userFound = await ProfileRepo.existsUser(userId);
    if (!userFound) return { result: false, statusCode: 404, message: "El usuario no existe" };

    const formatedInfo = Mapper.editablePersonalInfoToDB(editablePersonalInfo);

    await processTransaction<unknown>(async function (client: PoolClient) {
      const userInfo: Record<string, any> = {};
      if (formatedInfo.name) userInfo.name = formatedInfo.name;
      if (formatedInfo.first_surname) userInfo.first_surname = formatedInfo.first_surname;
      if (Object.keys(userInfo).length > 0) await ProfileRepo.updatePersonalInfo(userId, userInfo, client);
      
      if (formatedInfo.surname) await ProfileRepo.updateSurname(userId, formatedInfo.surname, client);
      
      if (profilePicture) {
        const profilePictureURL = await ImageService.updateProfilePicture(userId, profilePicture.buffer, profilePicture.mimetype);
        await ProfileRepo.updateProfilePicture(userId, profilePictureURL, client);
      }
      if (formatedInfo.phones) {
        const phones = formatedInfo.phones;

        const countries = await ProfileRepo.findCountriesByCodes(formatedInfo.phones);
        if (countries.length !== formatedInfo.phones.length) throw new ValidationError("Error de codigos de pais");

        await ProfileRepo.insertUnregisteredNumber(phones, client);
        await ProfileRepo.updatePhoneInfo(userId, phones, client);
      }
      if (formatedInfo.contact_emails) {
        const emails = formatedInfo.contact_emails;
        await ProfileRepo.insertUnregisteredEmail(emails, client);
        await ProfileRepo.updateEmailInfo(userId, emails, client); 
      }
      if (formatedInfo.addresses) await ProfileRepo.updateAddressInfo(userId, formatedInfo.addresses, client); 
      if (formatedInfo.links) await ProfileRepo.updateLinkInfo(userId, formatedInfo.links, client);
      
      if (formatedInfo.countries) {
        const countries = await ProfileRepo.findCountriesByName(formatedInfo.countries);
        if (countries.length !== formatedInfo.countries.length) throw new ValidationError("Pais o paises no encontrados"); 

        await ProfileRepo.updateCountryInfo(userId, formatedInfo.countries, client); 
      }

      await ProfileRepo.confirmProfileUpdate(userId, client);
    });

    return { result: true, statusCode: 200, message: "Infomacion personal modificada correctamente" };
  } catch (err) {
    return { result: false, statusCode: 500, message: (err as Error).message };
  }
}

export async function modifyWorkExperience(
  id: string,
  userId: string,
  editableWorkExperienceInfo: WorkExpTypes.EditableWorkExperience) {
  try {
    const userFound = await ProfileRepo.existsUser(userId);
    if (!userFound) return { result: false, statusCode: 404, message: "El usuario no existe" }
    
    const workExpFound = await ProfileRepo.existsWorkExperience(id, userId);
    if (!workExpFound) return { result: false, statusCode: 404, message: "La experiencia profesional a modificar no existe" };

    const formatedInfo = Mapper.editableWorkExperienceToDB(editableWorkExperienceInfo);
    const workExp = await ProfileRepo.findWorkExperience(id, userId);

    if (formatedInfo.start_date){
      if (formatedInfo.start_date > today) throw new ValidationError("La fecha de inicio no puede ser futura");
      if (formatedInfo.start_date < tody60YearsAgo) throw new ValidationError("La fecha de inicio no puede ser tan antigua");
    }
    if (formatedInfo.end_date) {
      if (formatedInfo.end_date > today) throw new ValidationError("La fecha de fin no puede ser futura");

      const currentStartDate = (!formatedInfo.start_date) ? workExp[0].start_date : formatedInfo.start_date;
      if (currentStartDate >= formatedInfo.end_date) {
        throw new ValidationError("La fecha de inicio no puede ser posterior fecha de fin"); 
      }
      if (formatedInfo.end_date < tody60YearsAgo) throw new ValidationError("La fecha de fin no puede ser tan antigua");
    }

    await ProfileRepo.updateWorkExperience(id, userId, formatedInfo);
    return { result: true, statusCode: 200, message: "Informacion de experiencia profesional modificada correctamente" };
  } catch (err) {
    return { result: false, statusCode: 500, message: (err as Error).message };
  }
}

async function verifyPhoneCountryCodes(phones: Pick<ProfileTypes.PhoneDB, "code">[]) {
  const countries = await ProfileRepo.findCountriesByCodes(phones);
  if (countries.length !== phones.length) throw new ValidationError("Error de codigos de pais");
}

async function verifyCountryNames(countries: Pick<ProfileTypes.CountryDB, "name">[]) {
  const foundCountries = await ProfileRepo.findCountriesByName(countries);
  if (foundCountries.length !== countries.length) throw new ValidationError("Pais o paises no encontrados");
}

function hasAnyAdditionalInfo(additionalInfo: ProfileTypes.AdditionalInfoDB, profilePicture: Express.Multer.File | undefined) {
  return Object.keys(additionalInfo).length > 0 || profilePicture !== undefined;
}

export async function createAdditionalInfo(
  userId: string,
  additionalInfo: ProfileTypes.AdditionalInfo,
  profilePicture: Express.Multer.File | undefined) {
  try {
    const formatedInfo = Mapper.additionalInfoToDB(additionalInfo);
    if (!hasAnyAdditionalInfo(formatedInfo, profilePicture)) {
      throw new ValidationError("No se envio informacion adicional para registrar");
    }

    const userFound = await ProfileRepo.existsUser(userId);
    if (!userFound) throw new NotFoundError("El usuario no existe");

    const alreadyRegistered = await ProfileRepo.hasAdditionalInfo(userId);
    if (alreadyRegistered) throw new ConflictError("El usuario ya tiene informacion adicional registrada");

    if (formatedInfo.phones) await verifyPhoneCountryCodes(formatedInfo.phones);
    if (formatedInfo.countries) await verifyCountryNames(formatedInfo.countries);

    await processTransaction<unknown>(async function (client: PoolClient) {
      if (formatedInfo.surname) await ProfileRepo.updateSurname(userId, formatedInfo.surname, client);
      if (formatedInfo.phones) {
        await ProfileRepo.insertUnregisteredNumber(formatedInfo.phones, client);
        await ProfileRepo.insertUserPhones(userId, formatedInfo.phones, client);
      }
      if (formatedInfo.contact_emails) {
        await ProfileRepo.insertUnregisteredEmail(formatedInfo.contact_emails, client);
        await ProfileRepo.insertUserEmails(userId, formatedInfo.contact_emails, client);
      }
      if (formatedInfo.addresses) await ProfileRepo.insertAddresses(userId, formatedInfo.addresses, client);
      if (formatedInfo.links) await ProfileRepo.insertLinks(userId, formatedInfo.links, client);
      if (formatedInfo.countries) await ProfileRepo.insertUserCountries(userId, formatedInfo.countries, client);
      if (formatedInfo.work_experiences) await ProfileRepo.insertWorkExperiences(userId, formatedInfo.work_experiences, client);

      if (profilePicture) {
        const profilePictureURL = await ImageService.updateProfilePicture(userId, profilePicture.buffer, profilePicture.mimetype);
        await ProfileRepo.updateProfilePicture(userId, profilePictureURL, client);
      }

      await ProfileRepo.confirmProfileUpdate(userId, client);
    });

    return { result: true, statusCode: 201, message: "Informacion adicional registrada correctamente" };
  } catch (error) {
    const statusCode = error instanceof ServerError ? error.statusCode : 500;
    return { result: false, statusCode: statusCode, message: (error as Error).message };
  }
}
