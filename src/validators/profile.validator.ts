import { ValidationError } from "../helpers/errors.helper";
import * as ProfileTypes from "../types/profile.types";
import * as RegexConstants from "../utils/constants/regex.constants";
import * as GeneralValidations from "../validators/general.validator";
import { capitalize, collapseSpaces } from "../utils/normalize";

function validateSurname(lastname: unknown) {
  const { surname, visibility } = lastname as ProfileTypes.Surname;
  const formatedSurname = GeneralValidations.validateProperNoun(surname, "Segundo Apellido");
  return { surname: formatedSurname, visibility: GeneralValidations.validateVisibility(visibility) };
}

function validatePhone(phone: unknown) {
  const { id, phoneNumber, countryCode, visibility } = phone as ProfileTypes.Phone;
  const formatedId = GeneralValidations.validateId(id);
  if ((typeof phoneNumber !== "string") || (typeof countryCode !== "string")) {
    throw new ValidationError("Tipo de dato invalido en el numero de telefono");
  }
  const formatedPhoneNumber = phoneNumber.trim();
  if ((formatedPhoneNumber.length < 6 || formatedPhoneNumber.length > 15) ||
    (!RegexConstants.regexPhone.test(formatedPhoneNumber))) {
    throw new ValidationError("Formato de numero de telefono invalido");
  }
  const formatedCountryCode = countryCode.trim();
  if ((formatedCountryCode.length < 1 || formatedCountryCode.length > 3) || 
    !RegexConstants.regexCountryCode.test(formatedCountryCode)) {
    throw new ValidationError("Codigo de pais invalido");
  } 
  return { id: formatedId, phoneNumber: formatedPhoneNumber, countryCode: formatedCountryCode, visibility: GeneralValidations.validateVisibility(visibility) }; 
}

function validateContactEmail(contactEmail: unknown) {
  const { id, email, visibility } = contactEmail as ProfileTypes.ContactEmail;
  const formatedId = GeneralValidations.validateId(id);
  if ((typeof email !== "string")) {
    throw new ValidationError("Tipo de dato invalido en correo de contacto");
  }
  const formatedEmail = email.trim().replace(/\s+/g, '').toLowerCase();
  if ((formatedEmail.length < 0 || formatedEmail.length > 200) || !RegexConstants.regexEmail.test(formatedEmail)) {
    throw new ValidationError("Formato de correo electronico invalido");
  }
  return { id: formatedId, email: formatedEmail,  visibility: GeneralValidations.validateVisibility(visibility) };
}

function validateAdress(add: unknown) {
  const { id, address, visibility } = add as ProfileTypes.Address;
  const formatedId = GeneralValidations.validateId(id);
  if (typeof address !== "string") {
    throw new ValidationError("Tipo de dato valido en direccion");
  }
  const formatedAddress = capitalize(collapseSpaces(address));
  if (formatedAddress.length < 0 || formatedAddress.length > 300) {
    throw new ValidationError("Direccion con cantidad de caracteres invalida");
  }
  return { id: formatedId, address: formatedAddress, visibility: GeneralValidations.validateVisibility(visibility) };
}

function validateLink(link: unknown) {
  const { id, text, url, visibility } = link as ProfileTypes.Link;
  const formatedId = GeneralValidations.validateId(id);
  if ((typeof text !== "string") || (typeof url !== "string")) {
    throw new ValidationError("Tipo de dato invalido en el enlace");
  }
  const formatedText = capitalize(collapseSpaces(text));
  const rawURL = url.trim();
  if ((rawURL.length < 0 || rawURL.length > 2048) || (!RegexConstants.regexURL.test(rawURL))) {
    throw new ValidationError("Formato de URL invalido");
  }
  const formatedURL = RegexConstants.regexURLScheme.test(rawURL) ? rawURL : `https://${rawURL}`;
  if (!URL.canParse(formatedURL)) {
    throw new ValidationError("URL invalida");
  }
  const newURL = new URL(formatedURL);
  if (newURL.protocol !== "http:" && newURL.protocol !== "https:") {
    throw new ValidationError("URL invalida, protocolo invalido");
  }
  return { id: formatedId, text: formatedText, url: newURL.toString(), visibility: GeneralValidations.validateVisibility(visibility) }
}

function validateCountry(country: unknown) {
  const { id, countryName, visibility } = country as ProfileTypes.Country;
  const formatedId = GeneralValidations.validateId(id);
  const formatedCountryName = GeneralValidations.validateProperNoun(countryName, "Pais");
  return { id: formatedId, countryName: formatedCountryName, visibility: GeneralValidations.validateVisibility(visibility) }
}

export function validateEditablePersonalInfo(payload: unknown) {
  const p = payload as ProfileTypes.EditablePersonalInfo;
  const proccessedInfo: ProfileTypes.EditablePersonalInfo = {};
  if (p.name) proccessedInfo.name = GeneralValidations.validateProperNoun(p.name, "Nombre");
  if (p.firstSurname) proccessedInfo.firstSurname = GeneralValidations.validateProperNoun(p.firstSurname, "Primer Apellido");
  if (p.surname) proccessedInfo.surname = validateSurname(p.surname) as ProfileTypes.Surname;
  if (p.phones) proccessedInfo.phones = GeneralValidations.validateList(p.phones, validatePhone, "Telefonos");
  if (p.contactEmails) proccessedInfo.contactEmails = GeneralValidations.validateList(p.contactEmails, validateContactEmail, "Correos de Contacto")
  if (p.addresses) proccessedInfo.addresses = GeneralValidations.validateList(p.addresses, validateAdress, "Direcciones");
  if (p.links) proccessedInfo.links = GeneralValidations.validateList(p.links, validateLink, "Enlaces");
  if (p.countries) proccessedInfo.countries = GeneralValidations.validateList(p.countries, validateCountry, "Paises")
  return proccessedInfo;
}