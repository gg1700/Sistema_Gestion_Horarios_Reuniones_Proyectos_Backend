import * as ProfileTypes from "../types/profile.types";
import * as ProfileRepo from "../repositories/profile.repository";
import { editablePersonalInfoToDB } from "../helpers/mapper.helper";
import { processTransaction } from "../utils/query";
import { PoolClient } from "pg";
import { ValidationError } from "../helpers/errors.helper";
import * as ImageService from "./image.service";

export async function modifyPersonalInfo(
  userId: string,
  editablePersonalInfo: ProfileTypes.EditablePersonalInfo,
  profilePicture: Express.Multer.File | undefined) {
  try {
    const userFound = await ProfileRepo.existsUser(userId);
    if (!userFound) return { result: false, statusCode: 404, message: "El usuario no existe" };

    const formatedInfo = editablePersonalInfoToDB(editablePersonalInfo);

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