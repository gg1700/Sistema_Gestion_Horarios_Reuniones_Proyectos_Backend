import * as ProfileRepo from "../repositories/profile.repository";
import * as AuthRepo from "../repositories/auth.repository";

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
    return { result: false, statusCode: 500, message: `Error en el servicio: ${(err as Error).message}` }
  }
}