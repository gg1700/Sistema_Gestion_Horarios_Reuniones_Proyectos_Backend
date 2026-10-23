import * as ProfileTypes from "../types/profile.types";
import * as WorkExpTypes from "../types/work_experience.types";
import * as AuthTypes from "../types/auth.types";

function surnameToDB(surname: ProfileTypes.Surname) {
  const result = {
    surname: surname.surname,
    visible: surname.visibility
  } as ProfileTypes.SurnameDB;
  return result;
}

function phoneToDB(phone: ProfileTypes.Phone) {
  const result = {
    id: phone.id,
    number: phone.phoneNumber,
    code: phone.countryCode,
    visible: phone.visibility
  } as ProfileTypes.PhoneDB;
  return result;
}

function contactEmailToDB(email: ProfileTypes.ContactEmail) {
  const result = {
    id: email.id,
    address: email.email,
    visible: email.visibility
  } as ProfileTypes.ContactEmailDB;
  return result;
}

function addressToDB(address: ProfileTypes.Address) {
  const result = {
    id: address.id,
    address: address.address,
    visible: address.visibility
  } as ProfileTypes.AddressDB;
  return result;
}

function linkToDB(link: ProfileTypes.Link) {
  const result = {
    id: link.id,
    text: link.text,
    url: link.url,
    visible: link.visibility
  } as ProfileTypes.LinkDB;
  return result;
}

function countryToDB(country: ProfileTypes.Country) {
  const result = {
    id: country.id,
    name: country.countryName,
    visible: country.visibility
  } as ProfileTypes.CountryDB;
  return result;
}

export function editablePersonalInfoToDB(payload: ProfileTypes.EditablePersonalInfo) {
  const result: ProfileTypes.EditablePersonalInfoDB = {};
  if (payload.name !== undefined) result.name = payload.name;
  if (payload.firstSurname !== undefined) result.first_surname = payload.firstSurname;
  if (payload.surname !== undefined) result.surname = surnameToDB(payload.surname);
  if (payload.phones !== undefined) result.phones = payload.phones.map(phone => phoneToDB(phone));
  if (payload.contactEmails !== undefined) result.contact_emails = payload.contactEmails.map(email => contactEmailToDB(email));
  if (payload.addresses !== undefined) result.addresses = payload.addresses.map(address => addressToDB(address));
  if (payload.links !== undefined) result.links = payload.links.map(link => linkToDB(link));
  if (payload.countries !== undefined) result.countries = payload.countries.map(country => countryToDB(country)); 
  return result;
}

export function editableWorkExperienceToDB(payload: WorkExpTypes.EditableWorkExperience) {
  const result: WorkExpTypes.EditableWorkExperienceDB = {};
  if (payload.title !== undefined) result.title = payload.title;
  if (payload.description !== undefined) result.description = payload.description;
  if (payload.companyName !== undefined) result.company_name = payload.companyName;
  if (payload.visibility !== undefined) result.visible = payload.visibility;
  if (payload.startDate !== undefined) result.start_date = payload.startDate;
  if (payload.endDate !== undefined) result.end_date = payload.endDate;
  return result;
}

export function registerUserToDB(payload: AuthTypes.RegisterUser, passwordHash: string) {
  const result: AuthTypes.RegisterUserDB = {
    handle_name: payload.handleName,
    name: payload.name,
    first_surname: payload.firstSurname,
    email: payload.email,
    password_hash: passwordHash
  };
  return result;
}

export function userFromDB(user: AuthTypes.UserDB) {
  const result: AuthTypes.User = {
    id: user.id,
    handleName: user.handle_name,
    name: user.name,
    firstSurname: user.first_surname,
    email: user.email
  };
  return result;
}
