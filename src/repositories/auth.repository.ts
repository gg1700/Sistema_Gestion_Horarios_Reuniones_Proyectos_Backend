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

export async function existsEmail(email: string) {
  const query = `
    SELECT id FROM "user"
    WHERE email = $1 AND deleted_at IS NULL`;
  const values = [email];
  const userFound = await processReturnQuery(query, values);
  return (userFound.length !== 0);
}

export async function existsHandleName(handleName: string) {
  const query = `
    SELECT id FROM "user"
    WHERE LOWER(handle_name) = LOWER($1) AND deleted_at IS NULL`;
  const values = [handleName];
  const userFound = await processReturnQuery(query, values);
  return (userFound.length !== 0);
}

export async function insertUser(user: AuthTypes.RegisterUserDB) {
  const query = `INSERT INTO "user" (handle_name, name, first_surname, email, password_hash)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, handle_name, name, first_surname, email`;
  const values = [user.handle_name, user.name, user.first_surname, user.email, user.password_hash];
  const insertedUsers = await processReturnQuery(query, values);
  return insertedUsers[0] as AuthTypes.UserDB;
}