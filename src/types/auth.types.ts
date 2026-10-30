export enum ExternalProvider {
  GOOGLE = "google",
  GITHUB = "github"
}

export interface ExternalAccountDB {
  id: string;
  provider: string;
  provider_user_id: string;
  provider_username?: string;
  provider_user_email?: string;
  access_token: string;
  refresh_token?: string;
  scopes?: string;
  state?: string;
}

export interface RegisterUser {
  handleName: string;
  name: string;
  firstSurname: string;
}

export interface RegisterUserDB {
  handle_name: string;
  name: string;
  first_surname: string;
}

export interface UserDB {
  id: string;
  handle_name: string;
  name: string;
  first_surname: string;
  email: string;
  registration_completed: boolean;
}

export interface User {
  id: string;
  handleName: string;
  name: string;
  firstSurname: string;
  email: string;
  registrationCompleted: boolean;
}

export interface Session {
  token: string;
  expiresIn: string;
}