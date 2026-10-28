import * as ProfileRepo from "../repositories/profile.repository";
import * as AuthRepo from "../repositories/auth.repository";
import * as ProviderService from "./provider.service";
import bcrypt from "bcrypt";
import * as AuthTypes from "../types/auth.types";
import * as SessionService from "./session.service";
import { registerUserToDB, userFromDB } from "../helpers/mapper.helper";
import { ConflictError, ServerError } from "../helpers/errors.helper";
import { processTransaction } from "../utils/query";

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
        provider_user_email: a.provider_user_email,
        scopes: a.scopes,
        state: a.state 
      }
    });
    if (!formatedAccounts || formatedAccounts.length === 0) {
      return { result: true, statusCode: 200, message: "El usuario no tiene cuentas externas vinculadas aun", data: [] };
    }
    return { result: true, statusCode: 200, message: "Informacion de cuentas vinculadas obtenida correctamente", data: formatedAccounts };
  } catch (err) {
    return { result: false, statusCode: 500, message: `Error en el servicio: ${(err as Error).message}` };
  }
}

export async function revokeAccessAccount(userId: string, provider: string) {
  try {
    return await processTransaction(async client => {
      // Serializar desvinculaciones del mismo titular: dos peticiones no deben
      // poder eliminar a la vez sus dos únicas formas de acceso.
      const user = await client.query(`SELECT id FROM public."user" WHERE id = $1 AND deleted_at IS NULL AND status = 'active' FOR UPDATE`, [userId]);
      if (!user.rowCount) return { result: false, statusCode: 404, message: "El usuario no existe" };
      const { rows: accounts } = await client.query(`SELECT * FROM public.external_account WHERE user_id = $1 AND provider IN ('google', 'github')`, [userId]);
      const account = accounts.find(account => account.provider === provider);
      if (!account) return { result: false, statusCode: 404, message: "Esa cuenta no está vinculada." };
      if (!accounts.some(account => account.provider !== provider && ['active', 'expired'].includes(account.state))) {
        return { result: false, statusCode: 409, message: "Vincula Google o GitHub antes de quitar tu última cuenta de acceso." };
      }
      const revoked = await ProviderService.revokeAccessAtProvider(account);
      if (!revoked.result) return { result: false, statusCode: 502, message: "El proveedor no pudo completar la desvinculación. Intenta nuevamente." };
      await client.query(`DELETE FROM public.external_account WHERE id = $1 AND user_id = $2`, [account.id, userId]);
      return { result: true, statusCode: 200, message: "Acceso revocado correctamente" };
    });
  } catch {
    return { result: false, statusCode: 500, message: "No se pudo desvincular la cuenta." };
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
