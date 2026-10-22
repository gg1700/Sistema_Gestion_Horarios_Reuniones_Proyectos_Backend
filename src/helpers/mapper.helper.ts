import * as ProfileTypes from "../types/profile.types";

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

export function editablePersonalInfoToDB(payload: ProfileTypes.EditablePersonalInfo) {
  const result: ProfileTypes.EditablePersonalInfoDB = {};
  if (payload.name) result.name = payload.name;
  if (payload.firstSurname) result.first_surname = payload.firstSurname;
  if (payload.surname) result.surname = surnameToDB(payload.surname);
  if (payload.phones) result.phones = payload.phones.map(phone => phoneToDB(phone));
  if (payload.contactEmails) result.contact_emails = payload.contactEmails.map(email => contactEmailToDB(email));
  if (payload.addresses) result.addresses = payload.addresses.map(address => addressToDB(address));
  if (payload.links) result.links = payload.links.map(link => linkToDB(link));
  return result;
}