import { ValidationError } from "../helpers/errors.helper";
import { capitalize, collapseSpaces } from "../utils/normalize";
import * as RegexConstants from "../utils/constants/regex.constants";
import { phoneDigitsByCountryCode } from "../utils/constants/phone.constants";

export function validateProperNoun(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw new ValidationError(`${field}: tipo de dato invalido`);
  }
  const formatedValue = capitalize(collapseSpaces(value).replace(/[^\p{L}\p{M}\s'-]/gu, ''));
  if (formatedValue.length < 1 || formatedValue.length > 100) {
    throw new ValidationError(`${field}: cantidad de caracteres invalido`);
  }
  return formatedValue;
}

export function validateList(value: unknown, itemValidator: any ,field: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError(`${field}: lista invalida o vacia`)
  }
  return value.map(v => itemValidator(v));
}

export function validateVisibility(value: unknown) {
  if (typeof value !== "boolean") {
    throw new ValidationError("Valor de visibilidad invalido");
  }
  return value;
}

export function validateId(id: unknown) {
  if (!id || typeof id !== "string") {
    throw new ValidationError("Id invalido");
  }
  return id;
}

export function validateDate(value: unknown, field: string) {
  const formatedValue = new Date(value as string);
  if (isNaN(formatedValue.getTime()) || !(formatedValue instanceof Date)) {
    throw new ValidationError(`${field}: fecha invalida`);
  }
  return formatedValue;
}

export function validateObject(value: unknown, field: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError(`${field}: formato invalido`);
  }
  return value as Record<string, unknown>;
}

export function validateEmail(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw new ValidationError(`${field}: tipo de dato invalido`);
  }
  const formatedEmail = value.trim().replace(/\s+/g, '').toLowerCase();
  if ((formatedEmail.length < 1 || formatedEmail.length > 200) || !RegexConstants.regexEmail.test(formatedEmail)) {
    throw new ValidationError(`${field}: formato de correo electronico invalido`);
  }
  return formatedEmail;
}

export function isEmptyValue(value: unknown) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim().length === 0) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

export function parseJsonText(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new ValidationError(`${field}: formato JSON invalido`);
  }
}

export function validateOptionalVisibility(value: unknown) {
  if (value === undefined) return true;
  return validateVisibility(value);
}

export function validateText(value: unknown, field: string, maximumLength: number) {
  if (typeof value !== "string") {
    throw new ValidationError(`${field}: tipo de dato invalido`);
  }
  const formatedText = collapseSpaces(value);
  if (formatedText.length < 1 || formatedText.length > maximumLength) {
    throw new ValidationError(`${field}: debe tener entre 1 y ${maximumLength} caracteres`);
  }
  return formatedText;
}

export function validateOptionalText(value: unknown, field: string, maximumLength: number) {
  if (isEmptyValue(value)) return null;
  return validateText(value, field, maximumLength);
}

export function validateCalendarDate(value: unknown, field: string) {
  if (typeof value !== "string" || !RegexConstants.regexDate.test(value.trim())) {
    throw new ValidationError(`${field}: formato de fecha invalido, use AAAA-MM-DD`);
  }
  const formatedDate = value.trim();
  const date = new Date(`${formatedDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== formatedDate) {
    throw new ValidationError(`${field}: fecha inexistente`);
  }
  if (date.getTime() > Date.now()) {
    throw new ValidationError(`${field}: la fecha no puede ser futura`);
  }
  return formatedDate;
}

function describeDigitsRange(minimum: number, maximum: number) {
  return minimum === maximum ? `${minimum} digitos` : `entre ${minimum} y ${maximum} digitos`;
}

export function validatePhoneDigits(phoneNumber: string, countryCode: string, field: string) {
  const digitsRange = phoneDigitsByCountryCode[countryCode];
  if (!digitsRange) {
    throw new ValidationError(`${field}: codigo de pais +${countryCode} no soportado`);
  }
  if (phoneNumber.length < digitsRange.minimum || phoneNumber.length > digitsRange.maximum) {
    throw new ValidationError(`${field}: el codigo +${countryCode} requiere ${describeDigitsRange(digitsRange.minimum, digitsRange.maximum)}`);
  }
  return phoneNumber;
}
