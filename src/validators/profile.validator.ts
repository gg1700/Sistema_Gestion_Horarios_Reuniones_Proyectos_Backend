import { ValidationError } from "../helpers/errors.helper";
import * as ProfileTypes from "../types/profile.types";
import * as RegexConstants from "../utils/constants/regex.constants";
import * as GeneralValidations from "../validators/general.validator";
import { capitalize, collapseSpaces } from "../utils/normalize";
import * as ProfileConstants from "../utils/constants/profile.constants";

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
  if ((formatedEmail.length < 1 || formatedEmail.length > 200) || !RegexConstants.regexEmail.test(formatedEmail)) {
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
  if (formatedAddress.length < 1 || formatedAddress.length > 300) {
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
  if ((rawURL.length < 1 || rawURL.length > 2048) || (!RegexConstants.regexURL.test(rawURL))) {
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
  if (p.name !== undefined) proccessedInfo.name = GeneralValidations.validateProperNoun(p.name, "Nombre");
  if (p.firstSurname !== undefined) proccessedInfo.firstSurname = GeneralValidations.validateProperNoun(p.firstSurname, "Primer Apellido");
  if (p.surname !== undefined) proccessedInfo.surname = validateSurname(p.surname) as ProfileTypes.Surname;
  if (p.phones !== undefined) proccessedInfo.phones = GeneralValidations.validateList(p.phones, validatePhone, "Telefonos");
  if (p.contactEmails !== undefined) proccessedInfo.contactEmails = GeneralValidations.validateList(p.contactEmails, validateContactEmail, "Correos de Contacto")
  if (p.addresses !== undefined) proccessedInfo.addresses = GeneralValidations.validateList(p.addresses, validateAdress, "Direcciones");
  if (p.links !== undefined) proccessedInfo.links = GeneralValidations.validateList(p.links, validateLink, "Enlaces");
  if (p.countries !== undefined) proccessedInfo.countries = GeneralValidations.validateList(p.countries, validateCountry, "Paises")
  return proccessedInfo;
}

function validateNewSurname(value: unknown) {
  const lastname = GeneralValidations.validateObject(value, "Segundo Apellido");
  return {
    surname: GeneralValidations.validateProperNoun(lastname.surname, "Segundo Apellido"),
    visibility: GeneralValidations.validateOptionalVisibility(lastname.visibility)
  };
}

function validateNewPhone(value: unknown): ProfileTypes.NewPhone {
  const phone = GeneralValidations.validateObject(value, "Telefono");
  if ((typeof phone.phoneNumber !== "string") || (typeof phone.countryCode !== "string")) {
    throw new ValidationError("Tipo de dato invalido en el numero de telefono");
  }
  const formatedPhoneNumber = phone.phoneNumber.trim();
  if (!RegexConstants.regexPhone.test(formatedPhoneNumber)) {
    throw new ValidationError("Formato de numero de telefono invalido");
  }
  const formatedCountryCode = phone.countryCode.trim().replace(/^\+/, "");
  if (!RegexConstants.regexCountryCode.test(formatedCountryCode)) {
    throw new ValidationError("Codigo de pais invalido");
  }
  GeneralValidations.validatePhoneDigits(formatedPhoneNumber, formatedCountryCode, "Telefono");
  return {
    phoneNumber: formatedPhoneNumber,
    countryCode: formatedCountryCode,
    visibility: GeneralValidations.validateOptionalVisibility(phone.visibility)
  };
}

function validateNewContactEmail(value: unknown): ProfileTypes.NewContactEmail {
  const contactEmail = GeneralValidations.validateObject(value, "Correo de contacto");
  return {
    email: GeneralValidations.validateEmail(contactEmail.email, "Correo de contacto"),
    visibility: GeneralValidations.validateOptionalVisibility(contactEmail.visibility)
  };
}

function validateNewAddress(value: unknown): ProfileTypes.NewAddress {
  const newAddress = GeneralValidations.validateObject(value, "Direccion");
  if (typeof newAddress.address !== "string") {
    throw new ValidationError("Tipo de dato invalido en direccion");
  }
  const formatedAddress = capitalize(collapseSpaces(newAddress.address));
  if (formatedAddress.length < 1 || formatedAddress.length > 300) {
    throw new ValidationError("Direccion con cantidad de caracteres invalida");
  }
  return { address: formatedAddress, visibility: GeneralValidations.validateOptionalVisibility(newAddress.visibility) };
}

function validateNewLink(value: unknown): ProfileTypes.NewLink {
  const link = GeneralValidations.validateObject(value, "Enlace");
  if ((typeof link.text !== "string") || (typeof link.url !== "string")) {
    throw new ValidationError("Tipo de dato invalido en el enlace");
  }
  const formatedText = capitalize(collapseSpaces(link.text));
  if (formatedText.length < 1 || formatedText.length > 150) {
    throw new ValidationError("Texto del enlace con cantidad de caracteres invalida");
  }
  const rawURL = link.url.trim();
  if ((rawURL.length < 1 || rawURL.length > 300) || RegexConstants.regexForbiddenUrlCharacters.test(rawURL)) {
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
  if (!newURL.hostname.includes(".")) {
    throw new ValidationError("URL invalida, dominio incompleto");
  }
  return {
    text: formatedText,
    url: newURL.toString(),
    visibility: GeneralValidations.validateOptionalVisibility(link.visibility)
  };
}

function validateNewCountry(value: unknown): ProfileTypes.NewCountry {
  const country = GeneralValidations.validateObject(value, "Pais");
  return {
    countryName: GeneralValidations.validateProperNoun(country.countryName, "Pais"),
    visibility: GeneralValidations.validateOptionalVisibility(country.visibility)
  };
}

function validateNewWorkExperience(value: unknown): ProfileTypes.NewWorkExperience {
  const workExperience = GeneralValidations.validateObject(value, "Experiencia laboral");
  const startDate = GeneralValidations.validateCalendarDate(workExperience.startDate, "Fecha de inicio");
  const endDate = GeneralValidations.isEmptyValue(workExperience.endDate)
    ? null
    : GeneralValidations.validateCalendarDate(workExperience.endDate, "Fecha de fin");
  if (endDate && endDate < startDate) {
    throw new ValidationError("Experiencia laboral: la fecha de fin no puede ser anterior a la fecha de inicio");
  }
  return {
    title: GeneralValidations.validateText(workExperience.title, "Cargo", 150),
    description: GeneralValidations.validateOptionalText(workExperience.description, "Descripcion", 200),
    companyName: GeneralValidations.validateOptionalText(workExperience.companyName, "Empresa", 200),
    startDate: startDate,
    endDate: endDate,
    visibility: GeneralValidations.validateOptionalVisibility(workExperience.visibility)
  };
}

function validateMaximumItems<T>(items: T[], maximum: number, field: string) {
  if (items.length > maximum) {
    throw new ValidationError(`${field}: se permite un maximo de ${maximum}`);
  }
  return items;
}

export function validateAdditionalInfo(payload: unknown) {
  const additionalInfo = GeneralValidations.validateObject(payload, "Informacion adicional");
  const surname = GeneralValidations.parseJsonText(additionalInfo.surname, "Segundo Apellido");
  const phones = GeneralValidations.parseJsonText(additionalInfo.phones, "Telefonos");
  const contactEmails = GeneralValidations.parseJsonText(additionalInfo.contactEmails, "Correos de Contacto");
  const addresses = GeneralValidations.parseJsonText(additionalInfo.addresses, "Direcciones");
  const links = GeneralValidations.parseJsonText(additionalInfo.links, "Enlaces");
  const countries = GeneralValidations.parseJsonText(additionalInfo.countries, "Paises");
  const workExperiences = GeneralValidations.parseJsonText(additionalInfo.workExperiences, "Experiencias laborales");

  const proccessedInfo: ProfileTypes.AdditionalInfo = {};
  if (!GeneralValidations.isEmptyValue(surname)) proccessedInfo.surname = validateNewSurname(surname);
  if (!GeneralValidations.isEmptyValue(phones)) {
    const validatedPhones: ProfileTypes.NewPhone[] = GeneralValidations.validateList(phones, validateNewPhone, "Telefonos");
    proccessedInfo.phones = validateMaximumItems(validatedPhones, ProfileConstants.maximumPhones, "Telefonos");
  }
  if (!GeneralValidations.isEmptyValue(contactEmails)) {
    const validatedContactEmails: ProfileTypes.NewContactEmail[] = GeneralValidations.validateList(contactEmails, validateNewContactEmail, "Correos de Contacto");
    proccessedInfo.contactEmails = validateMaximumItems(validatedContactEmails, ProfileConstants.maximumContactEmails, "Correos de Contacto");
  }
  if (!GeneralValidations.isEmptyValue(addresses)) proccessedInfo.addresses = GeneralValidations.validateList(addresses, validateNewAddress, "Direcciones");
  if (!GeneralValidations.isEmptyValue(links)) {
    const validatedLinks: ProfileTypes.NewLink[] = GeneralValidations.validateList(links, validateNewLink, "Enlaces");
    proccessedInfo.links = validateMaximumItems(validatedLinks, ProfileConstants.maximumLinks, "Enlaces");
  }
  if (!GeneralValidations.isEmptyValue(countries)) proccessedInfo.countries = GeneralValidations.validateList(countries, validateNewCountry, "Paises");
  if (!GeneralValidations.isEmptyValue(workExperiences)) {
    const validatedWorkExperiences: ProfileTypes.NewWorkExperience[] = GeneralValidations.validateList(workExperiences, validateNewWorkExperience, "Experiencias laborales");
    proccessedInfo.workExperiences = validateMaximumItems(validatedWorkExperiences, ProfileConstants.maximumWorkExperiences, "Experiencias laborales");
  }
  return proccessedInfo;
}
