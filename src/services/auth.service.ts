import * as ProfileRepo from "../repositories/profile.repository";
import * as AuthRepo from "../repositories/auth.repository";
import * as ProviderService from "./provider.service";
import bcrypt from "bcrypt";
import * as AuthTypes from "../types/auth.types";
import * as SessionService from "./session.service";
import { registerUserToDB, userFromDB } from "../helpers/mapper.helper";
import { ConflictError, ServerError } from "../helpers/errors.helper";

export async function viewAccountVinculation(userId: string) {
  try {
    const userFound = await ProfileRepo.existsUser(userId);
    if (!userFound) return { result: false, statusCode: 404, message: "El usuario no existe" };

    const accounts = await AuthRepo.getExternalAccounts(userId);
    const formatedAccounts = accounts.map(a => { 
      return { 
        provider: a.provider,
        provider_user_id: a.provider_user_id,
        provider_username: a.provider_username,
        provider_user_email: a.provoder_user_email,
        scopes: a.scopes,
        state: a.state 
      }
    });
    if (!formatedAccounts || formatedAccounts.length === 0) {
      return { result: true, statusCode: 200, message: "El usuario no tiene cuentas externas vinculadas aun" };
    }
    return { result: true, statusCode: 200, message: "Informacion de cuentas vinculadas obtenida correctamente", data: formatedAccounts };
  } catch (err) {
    return { result: false, statusCode: 500, message: `Error en el servicio: ${(err as Error).message}` };
  }
}

export async function revokeAccessAccount(userId: string, provider: string) {
  try {
    const userFound = await ProfileRepo.existsUser(userId);
    if (!userFound) return { result: false, statusCode: 404, message: "El usuario no existe" };

    const currentAccounts = await AuthRepo.getExternalAccounts(userId);
    if (!currentAccounts || currentAccounts.length <= 1) {
      return { result: false, statusCode: 409, message: "No es posible revocar el acceso, usuario con 1 o 0 cuentas" };
    }

    const providerAccount = currentAccounts.find(account => (account.provider === provider));
    const { result, statusCode, message } = await ProviderService.revokeAccessAtProvider(providerAccount);
    if (!result) return { result: result, statusCode: statusCode, message: message };

    const deletedAccount = await AuthRepo.deleteExternalAccount(providerAccount.id, userId);
    if (!deletedAccount || deletedAccount.length === 0) 
      return { result: false, statusCode: 400, message: "Error al eliminar registro de cuenta revocada" };
    
    return { result: true, statusCode: 200, message: "Acceso revocado correctamente" };
  } catch (err) {
    return { result: false, statusCode: 500, message: `Error en el servicio: ${(err as Error).message}` };
  }
}

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