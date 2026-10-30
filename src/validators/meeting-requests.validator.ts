import * as MeetingReqTypes from "../types/meeting-requests.types";
import { ValidationError } from "../helpers/errors.helper";
import { collapseSpaces } from "../utils/normalize";
import * as GeneralValidations from "../validators/general.validator";

function validateHandlename(handlename: unknown) {
  if (!handlename || (typeof handlename !== "string")) {
    throw new ValidationError("Tipo de dato invalido en handlename");
  }
  const formatedHandlename = handlename.trim().toLowerCase();
  if ((formatedHandlename.length < 3 || formatedHandlename.length > 50)) {
    throw new ValidationError("Formato de handlename invalido");
  }
  return formatedHandlename;
}

function validateMessage(message: unknown) {
  if (typeof message !== "string") {
    throw new ValidationError("Tipo de dato invalido en el mensaje");
  }
  const formatedMessage = collapseSpaces(message);
  if (formatedMessage.length < 10 || formatedMessage.length > 2000) {
    throw new ValidationError("Formato de mensaje invalido");
  }
  return formatedMessage;
}

function validateTimezone(timezone: unknown) {
  if (!timezone || (typeof timezone !== "string")) {
    throw new ValidationError("Tipo de dato invalido en la zona horaria");
  }
  const formatedTimezone = timezone.trim();
  return formatedTimezone;
}

export function validateMeetingReqInfo(payload: unknown) {
  const p = payload as MeetingReqTypes.MeetingRequest;
  const proccessedInfo: MeetingReqTypes.MeetingRequest = {
    recipientHandle: validateHandlename(p.recipientHandle),
    title: GeneralValidations.validateProperNoun(p.title, "Experiencia Profesional"),
    startsAt: GeneralValidations.validateDate(p.startsAt, "Hora de Inicio"),
    endsAt: GeneralValidations.validateDate(p.endsAt, "Hora de Inicio"),
    timeZone: validateTimezone(p.timeZone)
  }
  if (p.message !== undefined) proccessedInfo.message = validateMessage(p.message);
  return proccessedInfo;
}