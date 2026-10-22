import { Request, Response, NextFunction } from "express";
import * as ProfileValidations from "../validators/profile.validator";

export function modifyPersonalInfo(req: Request, res: Response, next: NextFunction) {
  req.body = ProfileValidations.validateEditablePersonalInfo(req.body);
  next();
} 