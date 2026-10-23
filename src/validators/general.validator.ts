import { ValidationError } from "../helpers/errors.helper";
import { capitalize, collapseSpaces } from "../utils/normalize";
import * as AuthTypes from "../types/auth.types";

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
  if (!id || typeof id !== "string") throw new ValidationError("Id invalido");
  return id;
}

export function validateDate(value: unknown, field: string) {
  const formatedValue = new Date(value as string);
  if (isNaN(formatedValue.getTime()) || !(formatedValue instanceof Date)) {
    throw new ValidationError(`${field}: fecha invalida`);
  }
  return formatedValue;
}

export function validateExternalProvider(value: unknown) {
  if (!value || typeof value !== "string") throw new ValidationError("Valor de proveedor invalido");
  if (Object.values(AuthTypes.ExternalProvider).includes(value as AuthTypes.ExternalProvider)) {
    throw new ValidationError("Proveedor invalido");
  }
  return value;
}