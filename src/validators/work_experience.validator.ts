import * as WorkExpTypes from "../types/work_experience.types";
import * as GeneralValidations from "./general.validator";
import { ValidationError } from "../helpers/errors.helper";
import { collapseSpaces } from "../utils/normalize";

function validateDescription(description: unknown) {
  if (typeof description !== "string") throw new ValidationError("Tipo de dato invalido en la descripcion");
  const formatedDescription = collapseSpaces(description.trim());
  if (formatedDescription.length < 1 || formatedDescription.length > 200) {
    throw new ValidationError("Descripcion con cantidad de caracteres invalida");
  }
  return formatedDescription;
}

function validateCompanyName(companyName: unknown) {
  if (typeof companyName !== "string") throw new ValidationError("Tipo de dato invalido en el nombre de institucion");
  const formatedCompanyName = collapseSpaces(companyName);
  if (formatedCompanyName.length < 1 || formatedCompanyName.length > 200) {
    throw new ValidationError("Nombre de institucion con cantidad de caracteres invalida");
  } 
  return formatedCompanyName;
}

function validateEndDate(endDate: unknown) {
  let formatedEndDate = null;
  if (endDate !== null) formatedEndDate = GeneralValidations.validateDate(endDate, "Fecha de Fin");
  return formatedEndDate;
}

export function validateEditableWorkExperience(payload: unknown) {
  const p = payload as WorkExpTypes.EditableWorkExperience;
  const proccessedInfo: WorkExpTypes.EditableWorkExperience = {};
  if (p.title !== undefined) proccessedInfo.title = GeneralValidations.validateProperNoun(p.title, "Experiencia Profesional");
  if (p.description !== undefined) proccessedInfo.description = validateDescription(p.description);
  if (p.companyName !== undefined) proccessedInfo.companyName = validateCompanyName(p.companyName);
  if (p.visibility !== undefined) proccessedInfo.visibility = GeneralValidations.validateVisibility(p.visibility);
  if (p.startDate !== undefined) proccessedInfo.startDate = GeneralValidations.validateDate(p.startDate, "Fecha de Inicio");
  if (p.endDate !== undefined) proccessedInfo.endDate = validateEndDate(p.endDate);
  return proccessedInfo;
}