import { processReturnQuery } from "../utils/query";

export async function getExternalAccounts(userId: string) {
  const query = `SELECT provider, provider_user_id, provider_username, provider_user_email,
    scopes, state FROM "external_account"
    WHERE user_id = $1`;
  const values = [userId];
  const accounts = await processReturnQuery(query, values);
  return accounts;
}