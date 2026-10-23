import { env } from "../config/env.config";
import * as AuthTypes from "../types/auth.types";
import { decryptToken } from "../utils/token";

export async function revokeAccessAtProvider(externalAccount: AuthTypes.ExternalAccountDB) {
  try {
    let response, decryptedToken;
    if (externalAccount.provider === AuthTypes.ExternalProvider.GOOGLE) {
      decryptedToken = decryptToken(externalAccount.refresh_token ?? externalAccount.access_token);
      response = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ decryptedToken })
      });
      if (!response.ok) 
        return { result: false, statusCode: response.status, message: "Error al revocar acceso a Google" };
    }
    if (externalAccount.provider === AuthTypes.ExternalProvider.GITHUB) {
      decryptedToken = decryptToken(externalAccount.access_token);
      const clientId = env.GITHUB_CLIENT_ID;
      const secretId = env.GITHUB_CLIENT_SECRET;
      const basic = Buffer.from(`${clientId}:${secretId}`).toString("base64");
      response = await fetch(`https://api.github.com/${basic}/grant`, {
        method: "DELETE",
        headers: {
          Authorization: `Basic ${basic}`,
          Accept: "application/vnd.github+json",
          "Content-type": "application/json",
          "User-agent": "tu-app"
        },
        body: JSON.stringify({ access_token: decryptedToken })
      });
      if (response.status !== 204)
        return { result: false, statusCode: response.status, message: "Error al revocar acceso a GitHub" }
    }

    return { result: true, statusCode: 200, message: `Acceso revocado desde el proveedor: ${externalAccount.provider}` };
  } catch (err) {
    return { result: false, statusCode: 500, message: `Error de servicio: ${(err as Error).message}` }
  }
}