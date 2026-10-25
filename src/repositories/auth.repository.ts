import { processReturnQuery } from "../utils/query";
import * as AuthTypes from "../types/auth.types";

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
  const query = `INSERT INTO "user" (handle_name, name, first_surname, email)
    VALUES ($1, $2, $3, $4)
    RETURNING id, handle_name, name, first_surname, email`;
  const values = [user.handle_name, user.name, user.first_surname, user.email];
  const insertedUsers = await processReturnQuery(query, values);
  return insertedUsers[0] as AuthTypes.UserDB;
}
