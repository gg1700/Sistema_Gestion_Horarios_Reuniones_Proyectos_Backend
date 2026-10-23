import { processReturnQuery } from "../utils/query";

export async function getExternalAccounts(userId: string) {
  const query = `SELECT provider, provider_user_id, provider_username, provider_user_email,
    scopes, state FROM "external_account"
    WHERE user_id = $1`;
  const values = [userId];
  const accounts = await processReturnQuery(query, values);
  return accounts;
}

export async function deleteExternalAccount(id: string, userId: string) {
  const query = `DELETE FROM "external_account"
    WHERE id = $1 AND user_id = $2
    RETURNING provider`;
  const values = [id, userId];
  const deletedAccount = await processReturnQuery(query, values);
  return deletedAccount;
}