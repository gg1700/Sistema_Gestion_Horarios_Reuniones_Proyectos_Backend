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

/**
 * Titulo de la reunion: se respeta lo que escribe el usuario (numeros, siglas y signos
 * comunes como "Sprint 3: revision de API"); solo se normalizan espacios y se quitan
 * caracteres de control y < >.
 */
function validateMeetingTitle(title: unknown, field: string) {
  if (typeof title !== "string")
    throw new ValidationError(`${field}: tipo de dato invalido`);
  const formattedTitle = collapseSpaces(title.replace(/[\u0000-\u001F\u007F<>]/g, " "));
  if (formattedTitle.length < 1 || formattedTitle.length > 150)
    throw new ValidationError(`${field}: cantidad de caracteres invalido`);
  return formattedTitle.charAt(0).toUpperCase() + formattedTitle.slice(1);
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

export function validateMeetingReqInfo(payload: unknown, guestRequest = false) {
  const p = GeneralValidations.validateObject(payload, "Body");
  const allowedFields = ["recipientHandle", "title", "message", "startsAt", "endsAt", "timeZone"];

  if (guestRequest) allowedFields.push("guestName", "guestEmail");
  Object.keys(p).forEach((field) => {
    if (!allowedFields.includes(field)) {
      throw new ValidationError(`Campo no permitido: ${field}`);
    }
  });

  const processedInfo: MeetingReqTypes.MeetingRequest = {
    recipientHandle: validateHandlename(p.recipientHandle),
    title: validateMeetingTitle(p.title, "Titulo de la Reunion"),
    startsAt: GeneralValidations.validateDate(p.startsAt, "Hora de Inicio"),
    endsAt: GeneralValidations.validateDate(p.endsAt, "Hora de Finalizacion"),
    timeZone: validateTimezone(p.timeZone)
  };
  if (guestRequest) {
    processedInfo.guestName = GeneralValidations.validateProperNoun(p.guestName, "Nombre del solicitante");
    processedInfo.guestEmail = GeneralValidations.validateEmail(p.guestEmail, "Correo del solicitante");
  }
  if (p.message !== undefined) processedInfo.message = validateMessage(p.message);

  return processedInfo;
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
  if (p.title !== undefined) processedInfo.title = validateMeetingTitle(p.title, "Titulo de la reunion");
  if (p.message !== undefined) {
    if (typeof p.message !== "string")
      throw new ValidationError("Tipo de dato invalido en el mensaje");
    const formattedMessage = collapseSpaces(p.message);

    if (formattedMessage.length > 2000 || (formattedMessage.length > 0 && formattedMessage.length < 10))
      throw new ValidationError("El mensaje debe tener al menos 10 caracteres o quedar vacio");
    processedInfo.message = formattedMessage;
  }
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

export function validateDecisionBody(payload: unknown) {
  const p = GeneralValidations.validateObject(payload, "Body");
  const allowedFields = ["decision", "responseMessage"];
  Object.keys(p).forEach((field) => {
    if (!allowedFields.includes(field)) throw new ValidationError(`Campo no permitido: ${field}`);
  });
  if (p.decision !== MeetingReqTypes.MeetingRequestStatus.ACCEPTED &&
    p.decision !== MeetingReqTypes.MeetingRequestStatus.REJECTED)
    throw new ValidationError("La decision debe ser accepted o rejected");

  const processedInfo: MeetingReqTypes.MeetingRequestDecision = {
    decision: p.decision
  };

  if (p.decision === MeetingReqTypes.MeetingRequestStatus.REJECTED) {
    processedInfo.responseMessage = validateReason(p.responseMessage, "El motivo del rechazo");
    return processedInfo;
  }

  if (p.responseMessage !== undefined) {
    if (typeof p.responseMessage !== "string")
      throw new ValidationError("Tipo de dato invalido en el mensaje de respuesta");

    const formattedMessage = collapseSpaces(p.responseMessage);
    if (formattedMessage.length < 1 || formattedMessage.length > 2000)
      throw new ValidationError("El mensaje de respuesta debe tener entre 1 y 2000 caracteres");

    processedInfo.responseMessage = formattedMessage;
  }

  return processedInfo;
}

const minimumReasonLength = 5;
const maximumReasonLength = 2000;

function validateReason(reason: unknown, field: string) {
  if (reason === undefined || reason === null)
    throw new ValidationError(`${field} es obligatorio`);
  if (typeof reason !== "string")
    throw new ValidationError(`Tipo de dato invalido en ${field.toLowerCase()}`);

  const formattedReason = collapseSpaces(reason);
  if (formattedReason.length < minimumReasonLength || formattedReason.length > maximumReasonLength)
    throw new ValidationError(`${field} debe tener entre ${minimumReasonLength} y ${maximumReasonLength} caracteres`);

  return formattedReason;
}

export function validateCancelBody(payload: unknown) {
  const p = GeneralValidations.validateObject(payload, "Body");
  Object.keys(p).forEach((field) => {
    if (field !== "reason") throw new ValidationError(`Campo no permitido: ${field}`);
  });

  const processedInfo: MeetingReqTypes.CancelMeetingRequest = {
    reason: validateReason(p.reason, "El motivo de la cancelacion")
  };
  return processedInfo;
}
function validateFutureInterval(startsAtValue: unknown, endsAtValue: unknown) {
  const startsAt = GeneralValidations.validateDate(startsAtValue, "Hora de inicio");
  const endsAt = GeneralValidations.validateDate(endsAtValue, "Hora de finalizacion");
  if (startsAt.getTime() <= Date.now())
    throw new ValidationError("La fecha de inicio debe ser futura");
  if (endsAt <= startsAt)
    throw new ValidationError("La fecha de finalizacion debe ser posterior al inicio");
  return { startsAt, endsAt };
}

function validateOptionalNote(message: unknown) {
  if (message === undefined || message === null) return undefined;
  if (typeof message !== "string")
    throw new ValidationError("Tipo de dato invalido en el mensaje");
  const formattedMessage = collapseSpaces(message);
  if (formattedMessage.length === 0) return undefined;
  if (formattedMessage.length > 2000)
    throw new ValidationError("El mensaje no puede superar los 2000 caracteres");
  return formattedMessage;
}

export function validateRescheduleBody(payload: unknown) {
  const p = GeneralValidations.validateObject(payload, "Body");
  const allowedFields = ["startsAt", "endsAt", "message"];
  Object.keys(p).forEach((field) => {
    if (!allowedFields.includes(field)) throw new ValidationError(`Campo no permitido: ${field}`);
  });
  const processedInfo: MeetingReqTypes.RescheduleProposal = validateFutureInterval(p.startsAt, p.endsAt);
  const message = validateOptionalNote(p.message);
  if (message !== undefined) processedInfo.message = message;
  return processedInfo;
}

export function validateProposalResponseBody(payload: unknown) {
  const p = GeneralValidations.validateObject(payload, "Body");
  const allowedFields = ["decision", "startsAt", "endsAt", "timeZone", "message"];
  Object.keys(p).forEach((field) => {
    if (!allowedFields.includes(field)) throw new ValidationError(`Campo no permitido: ${field}`);
  });
  if (p.decision !== MeetingReqTypes.ProposalAnswer.ACCEPTED && p.decision !== MeetingReqTypes.ProposalAnswer.COUNTER)
    throw new ValidationError("La respuesta debe ser accepted o counter");

  if (p.decision === MeetingReqTypes.ProposalAnswer.ACCEPTED) {
    if (p.startsAt !== undefined || p.endsAt !== undefined || p.timeZone !== undefined)
      throw new ValidationError("Para aceptar la propuesta no se debe enviar otro horario");
    const processedInfo: MeetingReqTypes.ProposalResponse = { decision: MeetingReqTypes.ProposalAnswer.ACCEPTED };
    const message = validateOptionalNote(p.message);
    if (message !== undefined) processedInfo.message = message;
    return processedInfo;
  }

  const processedInfo: MeetingReqTypes.ProposalResponse = {
    decision: MeetingReqTypes.ProposalAnswer.COUNTER,
    ...validateFutureInterval(p.startsAt, p.endsAt)
  };
  if (p.timeZone !== undefined) processedInfo.timeZone = validateTimezone(p.timeZone);
  const message = validateOptionalNote(p.message);
  if (message !== undefined) processedInfo.message = message;
  return processedInfo;
}
