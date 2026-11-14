import { Request, Response, NextFunction } from "express";
import * as ProfileValidations from "../validators/profile.validator";
import * as WorkExperienceValidations from "../validators/work_experience.validator";
import * as AuthValidations from "../validators/auth.validator";
import { ServerError } from "../helpers/errors.helper";
import * as MeetingReqValidations from "../validators/meeting-requests.validator";


function validateRequestBody(validator: (payload: unknown) => unknown) {
  return function (req: Request, res: Response, next: NextFunction) {
    try {
      req.body = validator(req.body ?? {});
      next();
    } catch (error) {
      const statusCode = error instanceof ServerError ? error.statusCode : 400;
      return res.status(statusCode).json({
        success: false,
        message: (error as Error).message
      });
    }
  };
}

// Los errores de validacion se responden como 400 en JSON (antes llegaban como una
// pagina HTML 500 con la traza del servidor).
export const modifyPersonalInfo = validateRequestBody(ProfileValidations.validateEditablePersonalInfo);

export const modifyWorkExperience = validateRequestBody(WorkExperienceValidations.validateEditableWorkExperience);

export const completeRegistration = validateRequestBody(AuthValidations.validateRegisterUser);

export const createAdditionalInfo = validateRequestBody(ProfileValidations.validateAdditionalInfo);

export function createMeetingRequest(req: Request, res: Response, next: NextFunction) {
  try {
    req.body = MeetingReqValidations.validateMeetingReqInfo(req.body, !req.user);
    next();
  } catch (err) {
    const statusCode = (err instanceof ServerError) ? err.statusCode : 400;
    return res.status(statusCode).json({
      success: false,
      message: (err as Error).message
    });
  }
}

export const updateMeetingRequest = validateRequestBody(
  MeetingReqValidations.validateUpdateMeetingRequest
);

export const decideMeetingRequest = validateRequestBody(
  MeetingReqValidations.validateDecisionBody
);

export const rescheduleMeetingRequest = validateRequestBody(
  MeetingReqValidations.validateRescheduleBody
);

export const respondToMeetingProposal = validateRequestBody(
  MeetingReqValidations.validateProposalResponseBody
);

export const cancelMeetingRequest = validateRequestBody(
  MeetingReqValidations.validateCancelBody
);

export const createWorkExperience = validateRequestBody(
  ProfileValidations.validateCreateWorkExperience
);