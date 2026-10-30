import { Request, Response, NextFunction } from "express";
import * as ProfileValidations from "../validators/profile.validator";
import * as WorkExperienceValidations from "../validators/work_experience.validator";
import * as AuthValidations from "../validators/auth.validator";
import { ServerError } from "../helpers/errors.helper";
import * as MeetingReqValidations from "../validators/meeting-requests.validator";

export function modifyPersonalInfo(req: Request, res: Response, next: NextFunction) {
  req.body = ProfileValidations.validateEditablePersonalInfo(req.body);
  next();
}

export function modifyWorkExperience(req: Request, res: Response, next: NextFunction) {
  req.body = WorkExperienceValidations.validateEditableWorkExperience(req.body);
  next();
}

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

export const registerUser = validateRequestBody(AuthValidations.validateRegisterUser);

export const createAdditionalInfo = validateRequestBody(ProfileValidations.validateAdditionalInfo);

export function createMeetingRequest(req: Request, res: Response, next: NextFunction) {
  try {
    req.body = MeetingReqValidations.validateMeetingReqInfo(req.body);
    next();
  } catch (err) {
    const statusCode = (err instanceof ServerError) ? err.statusCode : 400;
    return res.status(statusCode).json({
      success: false,
      message: (err as Error).message
    });
  }
}