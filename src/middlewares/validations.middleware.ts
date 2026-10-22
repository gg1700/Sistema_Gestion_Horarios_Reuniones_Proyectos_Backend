import { Request, Response, NextFunction } from "express";
import * as AuthValidations from "../validators/auth.validator";
import { ServerError } from "../helpers/errors.helper";

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
