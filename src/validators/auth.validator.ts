import { ValidationError } from "../helpers/errors.helper";
import * as AuthTypes from "../types/auth.types";
import * as RegexConstants from "../utils/constants/regex.constants";
import * as GeneralValidations from "../validators/general.validator";

function validateHandleName(handleName: unknown) {
  if (typeof handleName !== "string") {
    throw new ValidationError("Nombre de usuario: tipo de dato invalido");
  }
  const formatedHandleName = handleName.trim().toLowerCase();
  if (!RegexConstants.regexHandleName.test(formatedHandleName)) {
    throw new ValidationError("Nombre de usuario: solo se permiten de 3 a 50 letras minusculas, numeros y guiones");
  }
  return formatedHandleName;
}

export function validateRegisterUser(payload: unknown): AuthTypes.RegisterUser {
  const newUser = GeneralValidations.validateObject(payload, "Registro");
  return {
    handleName: validateHandleName(newUser.handleName),
    name: GeneralValidations.validateProperNoun(newUser.name, "Nombre"),
    firstSurname: GeneralValidations.validateProperNoun(newUser.firstSurname, "Primer Apellido")
  };
}
