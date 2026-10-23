import { ValidationError } from "../helpers/errors.helper";
import { capitalize, collapseSpaces } from "../utils/normalize";
import * as RegexConstants from "../utils/constants/regex.constants";

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
