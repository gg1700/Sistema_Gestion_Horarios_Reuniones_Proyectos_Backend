import { Request, Response } from "express";
import * as AuthService from "../services/auth.service";

export async function registerUser(req: Request, res: Response) {
  try {
    const { result, statusCode, message, data } = await AuthService.registerUser(req.body);
    if (!result) {
      return res.status(statusCode).json({ success: result, message: message });
    }
    return res.status(201).json({
      success: true,
      message: message,
      data: data
    });
  } 
  catch (error) {
    return res.status(500).json({
      success: false,
      message: `Error interno del servidor ${(error as Error).message}`
    });
  }
}
