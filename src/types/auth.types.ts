export interface RegisterUser {
  handleName: string;
  name: string;
  firstSurname: string;
}

export interface RegisterUserDB {
  handle_name: string;
  name: string;
  first_surname: string;
  email: string;
}

export interface UserDB {
  id: string;
  handle_name: string;
  name: string;
  first_surname: string;
  email: string;
}

export interface User {
  id: string;
  handleName: string;
  name: string;
  firstSurname: string;
  email: string;
}

export interface Session {
  token: string;
  expiresIn: string;
}
