import * as ProfileRepo from "../repositories/profile.repository";
import * as ExternalAccountRepo from "../repositories/external-account.repository";
import * as AuthTypes from "../types/auth.types";
import { decryptToken } from "../utils/token";
import * as ExternalAccountTypes from "../types/external-account.types";
import * as GithubAPIService from "./github-api.service";
import * as GithubRepo from "../repositories/github.repository";
import { createGithubClient } from "./github-client.service";

export async function requestGithubActivity(userId: string, type: "list" | "grid") {
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
    const octokit = await createGithubClient(accessToken);
    const ans = (type === "list")
      ? await GithubAPIService.getGithubActivityList(octokit, username)
      : await GithubAPIService.getGithubActivityGrid(octokit, username);
    const { result, statusCode, message, data } = ans;

    if (!result) {
      if (statusCode === 401) {
        const accountId = githubAccount[0].id;
        await ExternalAccountRepo.updateExternalAccountState(ExternalAccountTypes.ExternalAccountState.EXPIRED, accountId, userId);
        return {
          result: false,
          statusCode: statusCode,
          message: "Token de GitHub expirado, se requiere reconectar la cuenta",
          data: []
        };
      }

      const cachedActivity = await GithubRepo.getGithubActivity(userId, type);
      if (cachedActivity && cachedActivity[0].activity)
        return {
          result: true,
          statusCode: 200,
          message: "GitHub no esta disponible, ultima actividad guardada devuelta",
          data: JSON.parse(cachedActivity[0].activity)
        };

      return { result: result, statusCode: statusCode, message: message };
    }

    await GithubRepo.upsertGithubActivity(userId, type, JSON.stringify(data)); 
    if (type === "list" && Array.isArray(data) && data.length === 0)
      return { result: true, statusCode: 200, message: "El usuario no tiene actividad reciente en GitHub", data: [] };

    return { result: result, statusCode: 200, message: message, data: data };
  } catch (err) {
    return { result: false, statusCode: 500, message: `Error en el servicio: ${(err as Error).message}` };
  }
}
