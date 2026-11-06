import { processReturnQuery } from "../utils/query";
import * as AuthTypes from "../types/auth.types";

export async function getExternalAccounts(userId: string) {
  const query = `SELECT id, provider, provider_user_id, provider_username, provider_user_email,
    scopes, state, access_token, refresh_token FROM "external_account"
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

export async function findRegistrationUser(userId: string) {
  const query = `SELECT id, handle_name, name, first_surname, email, registration_completed
    FROM "user"
    WHERE id = $1 AND deleted_at IS NULL`;
  const values = [userId];
  const usersFound = await processReturnQuery(query, values);
  return usersFound[0] as AuthTypes.UserDB | undefined;
}

export async function existsHandleNameForOtherUser(handleName: string, userId: string) {
  const query = `
    SELECT id FROM "user"
    WHERE LOWER(handle_name) = LOWER($1) AND id <> $2`;
  const values = [handleName, userId];
  const usersFound = await processReturnQuery(query, values);
  return (usersFound.length !== 0);
}

export async function completeRegistration(userId: string, user: AuthTypes.RegisterUserDB) {
  const query = `UPDATE "user"
    SET handle_name = $2, name = $3, first_surname = $4, registration_completed = true, updated_at = now()
    WHERE id = $1 AND registration_completed = false AND deleted_at IS NULL
    RETURNING id, handle_name, name, first_surname, email, registration_completed`;
  const values = [userId, user.handle_name, user.name, user.first_surname];
  const updatedUsers = await processReturnQuery(query, values);
  return updatedUsers[0] as AuthTypes.UserDB | undefined;
}
