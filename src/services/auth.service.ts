import bcrypt from "bcrypt";
import * as AuthTypes from "../types/auth.types";
import * as AuthRepo from "../repositories/auth.repository";
import * as SessionService from "./session.service";
import { registerUserToDB, userFromDB } from "../helpers/mapper.helper";
import { ConflictError, ServerError } from "../helpers/errors.helper";

async function verifyUserAvailability(email: string, handleName: string) {
  const emailTaken = await AuthRepo.existsEmail(email);
  if (emailTaken) throw new ConflictError("El correo electronico ya esta registrado");
  const handleNameTaken = await AuthRepo.existsHandleName(handleName);
  if (handleNameTaken) throw new ConflictError("El nombre de usuario ya esta registrado");
}

export async function registerUser(newUser: AuthTypes.RegisterUser) {
  try {
    await verifyUserAvailability(newUser.email, newUser.handleName);
    const passwordHash = await bcrypt.hash(newUser.password, 10);
    const insertedUser = await AuthRepo.insertUser(registerUserToDB(newUser, passwordHash));
    const user = userFromDB(insertedUser);
    const session = SessionService.createSession(user.id, user.handleName);
    return { result: true, statusCode: 201, message: "Usuario registrado correctamente", data: { user: user, session: session } };
  } 
  catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return { result: false, statusCode: 409, message: "El correo electronico o el nombre de usuario ya estan registrados" };
    }
    const statusCode = error instanceof ServerError ? error.statusCode : 500;
    return { result: false, statusCode: statusCode, message: (error as Error).message };
  }
}
