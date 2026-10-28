import * as ProfileRepo from "../repositories/profile.repository";
import * as ExternalAccountRepo from "../repositories/external-account.repository";
import * as AuthTypes from "../types/auth.types";
import { decryptToken } from "../utils/token";
import * as ExternalAccountTypes from "../types/external-account.types";
import * as GithubAPIService from "./github-api.service";
import { Octokit } from "octokit";

export async function requestGithubActivity(userId: string, type: "activity" | "grid") {
  try {
    const userFound = await ProfileRepo.existsUser(userId);
    if (!userFound) return { result: false, statusCode: 404, message: "El usuario no existe" };

    const githubAccount = await ExternalAccountRepo.findExternalAccountByProvider(userId, AuthTypes.ExternalProvider.GITHUB);
    if (!githubAccount || githubAccount.length !== 1) {
      return { result: false, statusCode: 409, message: "El usuario no tiene cuenta de GitHub vinculada aun" };
    }
    const accountState = githubAccount[0].state;
    if (accountState === ExternalAccountTypes.ExternalAccountState.NEEDS_RECONECT) {
      return { result: false, statusCode: 401, message: "Error de token de acceso" };
    }

    const accessToken = decryptToken(githubAccount[0].access_token);
    const username = githubAccount[0].provider_username;
    const octokit = new Octokit({ auth: accessToken });
    const ans = (type === "activity")
      ? await GithubAPIService.getGithubActivity(octokit, username)
      : await GithubAPIService.getGithubActivityGrid(octokit, username);
    const { result, statusCode, message, data } = ans;
    if (!data && type === "activity")
      return { result: true, statusCode: 200, message: "El usuario no tiene actividad reciente en GitHub", data: [] };
    if (!data && type === "grid")
      return { result: false, statusCode: 404, message: "Error al obtener grilla de actividad de GitHub" };
    if (!result) return { result: result, statusCode: statusCode, message: message };
    return { result: result, statudCode: 200, message: message, data: data };
    
  } catch (err) {
    return { result: false, statusCode: 500, message: `Error en el servicio: ${(err as Error).message}` };
  }
}