import * as ProfileTypes from "../types/profile.types";
import * as ProfileRepo from "../repositories/profile.repository";
import * as Mapper from "../helpers/mapper.helper";
import { processTransaction } from "../utils/query";
import { PoolClient } from "pg";
import { ValidationError } from "../helpers/errors.helper";
import * as ImageService from "./image.service";
import * as WorkExpTypes from "../types/work_experience.types";
import { today, tody60YearsAgo } from "../utils/constants/date.constants";

export async function modifyPersonalInfo(
  userId: string,
  editablePersonalInfo: ProfileTypes.EditablePersonalInfo,
  profilePicture: Express.Multer.File | undefined
) {
  try {
    const userFound = await ProfileRepo.existsUser(userId);
    if (!userFound) return { result: false, statusCode: 404, message: "El usuario no existe" };

    const formatedInfo = Mapper.editablePersonalInfoToDB(editablePersonalInfo);

    await processTransaction<unknown>(async function (client: PoolClient) {
      const userInfo: Record<string, any> = {};
      if (formatedInfo.name) userInfo.name = formatedInfo.name;
      if (formatedInfo.first_surname) userInfo.first_surname = formatedInfo.first_surname;
      if (Object.keys(userInfo).length > 0)
        await ProfileRepo.updatePersonalInfo(userId, userInfo, client);

      if (formatedInfo.surname)
        await ProfileRepo.updateSurname(userId, formatedInfo.surname, client);

      if (profilePicture) {
        const profilePictureURL = await ImageService.updateProfilePicture(
          userId,
          profilePicture.buffer,
          profilePicture.mimetype
        );
        await ProfileRepo.updateProfilePicture(userId, profilePictureURL, client);
      }
      if (formatedInfo.phones) {
        const phones = formatedInfo.phones;

        const countries = await ProfileRepo.findCountriesByCodes(formatedInfo.phones);
        if (countries.length !== formatedInfo.phones.length)
          throw new ValidationError("Error de codigos de pais");

        await ProfileRepo.insertUnregisteredNumber(phones, client);
        await ProfileRepo.updatePhoneInfo(userId, phones, client);
      }
      if (formatedInfo.contact_emails) {
        const emails = formatedInfo.contact_emails;
        await ProfileRepo.insertUnregisteredEmail(emails, client);
        await ProfileRepo.updateEmailInfo(userId, emails, client);
      }
      if (formatedInfo.addresses)
        await ProfileRepo.updateAddressInfo(userId, formatedInfo.addresses, client);
      if (formatedInfo.links) await ProfileRepo.updateLinkInfo(userId, formatedInfo.links, client);

      if (formatedInfo.countries) {
        const countries = await ProfileRepo.findCountriesByName(formatedInfo.countries);
        if (countries.length !== formatedInfo.countries.length)
          throw new ValidationError("Pais o paises no encontrados");

        await ProfileRepo.updateCountryInfo(userId, formatedInfo.countries, client);
      }

      await ProfileRepo.confirmProfileUpdate(userId, client);
    });

    return {
      result: true,
      statusCode: 200,
      message: "Infomacion personal modificada correctamente",
    };
  } catch (err) {
    return { result: false, statusCode: 500, message: (err as Error).message };
  }
}

export async function modifyWorkExperience(
  id: string,
  userId: string,
  editableWorkExperienceInfo: WorkExpTypes.EditableWorkExperience
) {
  try {
    const userFound = await ProfileRepo.existsUser(userId);
    if (!userFound) return { result: false, statusCode: 404, message: "El usuario no existe" };

    const workExpFound = await ProfileRepo.existsWorkExperience(id, userId);
    if (!workExpFound)
      return {
        result: false,
        statusCode: 404,
        message: "La experiencia profesional a modificar no existe",
      };

    const formatedInfo = Mapper.editableWorkExperienceToDB(editableWorkExperienceInfo);
    const workExp = await ProfileRepo.findWorkExperience(id, userId);

    if (formatedInfo.start_date) {
      if (formatedInfo.start_date > today)
        throw new ValidationError("La fecha de inicio no puede ser futura");
      if (formatedInfo.start_date < tody60YearsAgo)
        throw new ValidationError("La fecha de inicio no puede ser tan antigua");
    }
    if (formatedInfo.end_date) {
      if (formatedInfo.end_date > today)
        throw new ValidationError("La fecha de fin no puede ser futura");

      const currentStartDate = !formatedInfo.start_date
        ? workExp[0].start_date
        : formatedInfo.start_date;
      if (currentStartDate >= formatedInfo.end_date) {
        throw new ValidationError("La fecha de inicio no puede ser posterior fecha de fin");
      }
      if (formatedInfo.end_date < tody60YearsAgo)
        throw new ValidationError("La fecha de fin no puede ser tan antigua");
    }

    await ProfileRepo.updateWorkExperience(id, userId, formatedInfo);
    return {
      result: true,
      statusCode: 200,
      message: "Informacion de experiencia profesional modificada correctamente",
    };
  } catch (err) {
    return { result: false, statusCode: 500, message: (err as Error).message };
  }
}

export async function getPublicProfile(handle: string) {
  const user = await ProfileRepo.findPublicProfileByHandle(handle);

  if (!user) {
    return null;
  }

  return {
    handleName: user.handle_name,
    name: user.name,
    firstLastName: user.first_surname,
    profilePicture: user.profile_picture,
  };
}
