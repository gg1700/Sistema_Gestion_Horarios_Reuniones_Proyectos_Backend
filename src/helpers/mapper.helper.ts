import * as AuthTypes from "../types/auth.types";

export function registerUserToDB(payload: AuthTypes.RegisterUser, passwordHash: string) {
  const result: AuthTypes.RegisterUserDB = {
    handle_name: payload.handleName,
    name: payload.name,
    first_surname: payload.firstSurname,
    email: payload.email,
    password_hash: passwordHash
  };
  return result;
}

export function userFromDB(user: AuthTypes.UserDB) {
  const result: AuthTypes.User = {
    id: user.id,
    handleName: user.handle_name,
    name: user.name,
    firstSurname: user.first_surname,
    email: user.email
  };
  return result;
}
