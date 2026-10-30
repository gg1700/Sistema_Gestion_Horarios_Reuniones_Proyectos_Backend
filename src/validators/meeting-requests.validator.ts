import * as MeetingReqTypes from "../types/meeting-requests.types";
import { ValidationError } from "../helpers/errors.helper";
import { collapseSpaces } from "../utils/normalize";
import * as GeneralValidations from "../validators/general.validator";
import * as RegexConstants from "../utils/constants/regex.constants";

function validateHandlename(handlename: unknown) {
  if (!handlename || (typeof handlename !== "string")) {
    throw new ValidationError("Tipo de dato invalido en handlename");
  }
  const formatedHandlename = handlename.trim().toLowerCase();
  if ((formatedHandlename.length < 3 || formatedHandlename.length > 50)) {
    throw new ValidationError("Handlename con cantidad de caracteres invalida");
  }
  if (!RegexConstants.regexHandleName.test(formatedHandlename)) {
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
  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: formatedTimezone
    });
  } catch {
    throw new ValidationError("Zona horaria invalida");
  }
  return formatedTimezone;
}

export function validateMeetingReqInfo(payload: unknown) {
  const p = GeneralValidations.validateObject(payload, "Body") as unknown as MeetingReqTypes.MeetingRequest;
  const proccessedInfo: MeetingReqTypes.MeetingRequest = {
    recipientHandle: validateHandlename(p.recipientHandle),
    title: GeneralValidations.validateProperNoun(p.title, "Titulo de la Reunion"),
    startsAt: GeneralValidations.validateDate(p.startsAt, "Hora de Inicio"),
    endsAt: GeneralValidations.validateDate(p.endsAt, "Hora de Finalizacion"),
    timeZone: validateTimezone(p.timeZone)
  }
  if (p.message !== undefined) proccessedInfo.message = validateMessage(p.message);
  return proccessedInfo;
}

export function validateUpdateMeetingRequest(payload: unknown) {
  const p = GeneralValidations.validateObject(payload, "Body");
  const allowedFields = ["title", "message", "startsAt", "endsAt", "timeZone"];
  Object.keys(p).forEach((field) => {
    if (!allowedFields.includes(field))
      throw new ValidationError(`Campo no permitido: ${field}`);
  });
  if (Object.keys(p).length === 0)
    throw new ValidationError("Informacion a modificar no especificada");
  const processedInfo: MeetingReqTypes.UpdateMeetingRequest = {};
  if (p.title !== undefined) processedInfo.title = GeneralValidations.validateProperNoun(p.title, "Titulo de la reunion");
  if (p.message !== undefined) processedInfo.message = validateMessage(p.message);
  if ((p.startsAt !== undefined) !== (p.endsAt !== undefined))
    throw new ValidationError("Debe especificar tanto la fecha de inicio como la de finalizacion");
  if (p.startsAt !== undefined && p.endsAt !== undefined) {
    processedInfo.startsAt = GeneralValidations.validateDate(p.startsAt, "Hora de inicio");
    processedInfo.endsAt = GeneralValidations.validateDate(p.endsAt, "Hora de finalizacion");

    if (processedInfo.startsAt.getTime() <= Date.now())
      throw new ValidationError("La fecha de inicio debe ser futura");
    if (processedInfo.endsAt <= processedInfo.startsAt)
      throw new ValidationError("La fecha de finalizacion debe ser posterior al inicio");
  }
  if (p.timeZone !== undefined) processedInfo.timeZone = validateTimezone(p.timeZone);

  return processedInfo;
}

export function validateMeetingRequestId(requestId: unknown) {
  if (typeof requestId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new ValidationError("Id de solicitud de reunion invalido");
  }
  return requestId;
}