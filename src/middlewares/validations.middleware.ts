import { Request, Response, NextFunction } from "express";
import * as ProfileValidations from "../validators/profile.validator";
import * as WorkExperienceValidations from "../validators/work_experience.validator";

export function modifyPersonalInfo(req: Request, res: Response, next: NextFunction) {
  req.body = ProfileValidations.validateEditablePersonalInfo(req.body);
  next();
}

export function modifyWorkExperience(req: Request, res: Response, next: NextFunction) {
  req.body = WorkExperienceValidations.validateEditableWorkExperience(req.body);
  next();
}