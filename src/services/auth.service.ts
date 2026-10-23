import * as ProfileRepo from "../repositories/profile.repository";
import * as AuthRepo from "../repositories/auth.repository";
import * as ProviderService from "./provider.service";

export async function viewAccountVinculation(userId: string) {
  try {
    const userFound = await ProfileRepo.existsUser(userId);
    if (!userFound) return { result: false, statusCode: 404, message: "El usuario no existe" };

    const accounts = await AuthRepo.getExternalAccounts(userId);
    if (!accounts || accounts.length === 0) {
      return { result: true, statusCode: 200, message: "El usuario no tiene cuentas externas vinculadas aun" };
    }
    return { result: true, statusCode: 200, message: "Informacion de cuentas vinculadas obtenida correctamente", data: accounts };
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

    const deletedAccount = await AuthRepo.deleteExternalAccount(userId, providerAccount.id);
    if (!deletedAccount || deletedAccount.length === 0) 
      return { result: false, statusCode: 400, message: "Error al eliminar registro de cuenta revocada" };
    
    return { result: true, statusCode: 200, message: "Acceso revocado correctamente" };
  } catch (err) {
    return { result: false, statusCode: 500, message: `Error en el servicio: ${(err as Error).message}` };
  }
}