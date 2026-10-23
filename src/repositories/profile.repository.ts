import { processReturnQuery } from "../utils/query";
import { PoolClient } from "pg";
import * as ProfileTypes from "../types/profile.types";
import * as WorkExpTypes from "../types/work_experience.types";

export async function existsUser(userId: string) {
  const query = `
    SELECT * FROM "user"
    WHERE id = $1`;
  const values = [userId];
  const userFound = await processReturnQuery(query, values);
  return userFound.length !== 0;
}

export async function updatePersonalInfo(
  userId: string,
  userInfo: Record<string, any>,
  client: PoolClient
) {
  const setStatement: string[] = [];
  const values = Object.values(userInfo);
  values.push(userId);
  Object.keys(userInfo).forEach((key, i) => {
    setStatement.push(`${key} = $${i + 1}`);
  });
  const query = `UPDATE "user"
    SET ${setStatement.join(", ")}
    WHERE id = $${values.length}`;
  await client.query(query, values);
}

export async function updateSurname(
  userId: string,
  surname: ProfileTypes.SurnameDB,
  client: PoolClient
) {
  const query = `INSERT INTO "user_surname" (user_id, surname, visible)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id)
    DO UPDATE SET
      surname = EXCLUDED.surname,
      visible = EXCLUDED.visible`;
  const values = [userId, surname.surname, surname.visible];
  await client.query(query, values);
}

export async function insertUnregisteredNumber(phones: ProfileTypes.PhoneDB[], client: PoolClient) {
  const query = `INSERT INTO "phone" (number)
    SELECT UNNEST($1::text[])
    ON CONFLICT (number) DO NOTHING`;
  const values = [phones.map((p) => p.number)];
  const phoneNumbers = await client.query(query, values);
  return phoneNumbers.rows;
}

export async function findCountriesByCodes(phones: ProfileTypes.PhoneDB[]) {
  const query = `SELECT c.name FROM "country" c
    JOIN UNNEST($1::text[]) AS t(code) ON c.code = t.code`;
  const values = [phones.map((p) => p.code)];
  const countries = await processReturnQuery(query, values);
  return countries;
}

export async function updatePhoneInfo(
  userId: string,
  phones: ProfileTypes.PhoneDB[],
  client: PoolClient
) {
  const query = `UPDATE "user_phone" up SET
    phone_id = p.id,
    country_id = c.id,
    visible = t.visible
    FROM UNNEST($2::uuid[], $3::text[], $4::text[], $5::bool[]) AS t(id, number, code, visible)
    JOIN "phone" p ON p.number = t.number
    JOIN "country" c ON c.code = t.code
    WHERE up.id = t.id AND up.user_id = $1::uuid`;
  const values = [
    userId,
    phones.map((p) => p.id),
    phones.map((p) => p.number),
    phones.map((p) => p.code),
    phones.map((p) => p.visible),
  ];
  await client.query(query, values);
}

export async function insertUnregisteredEmail(
  emails: ProfileTypes.ContactEmailDB[],
  client: PoolClient
) {
  const query = `INSERT INTO "email" (address)
    SELECT UNNEST($1::text[])
    ON CONFLICT (address) DO NOTHING`;
  const values = [emails.map((e) => e.address)];
  const emailAddresses = await client.query(query, values);
  return emailAddresses.rows;
}

export async function updateEmailInfo(
  userId: string,
  emails: ProfileTypes.ContactEmailDB[],
  client: PoolClient
) {
  const query = `UPDATE "user_email" ue SET
    email_id = e.id,
    visible = t.visible
    FROM UNNEST($2::uuid[], $3::text[], $4::bool[]) AS t(id, address, visible)
    JOIN "email" e ON e.address = t.address
    WHERE ue.id = t.id AND ue.user_id = $1::uuid`;
  const values = [
    userId,
    emails.map((e) => e.id),
    emails.map((e) => e.address),
    emails.map((e) => e.visible),
  ];
  await client.query(query, values);
}

export async function updateAddressInfo(
  userId: string,
  addresses: ProfileTypes.AddressDB[],
  client: PoolClient
) {
  const query = `UPDATE "address" a SET
    address = t.address,
    visible = t.visible
    FROM UNNEST($2::uuid[], $3::text[], $4::bool[]) AS t(id, address, visible)
    WHERE a.id = t.id AND a.user_id = $1::uuid`;
  const values = [
    userId,
    addresses.map((a) => a.id),
    addresses.map((a) => a.address),
    addresses.map((a) => a.visible),
  ];
  await client.query(query, values);
}

export async function updateLinkInfo(
  userId: string,
  links: ProfileTypes.LinkDB[],
  client: PoolClient
) {
  const query = `UPDATE "link" l SET
    text = t.text,
    url = t.url,
    visible = t.visible
    FROM UNNEST($2::uuid[], $3::text[], $4::text[], $5::bool[]) AS t(id, text, url, visible)
    WHERE l.id = t.id AND l.user_id = $1::uuid`;
  const values = [
    userId,
    links.map((l) => l.id),
    links.map((l) => l.text),
    links.map((l) => l.url),
    links.map((l) => l.visible),
  ];
  await client.query(query, values);
}

export async function findCountriesByName(countries: ProfileTypes.CountryDB[]) {
  const query = `SELECT * FROM "country" c
    JOIN UNNEST($1::text[]) AS t(name) ON c.name = t.name`;
  const values = [countries.map((c) => c.name)];
  const foundCountries = await processReturnQuery(query, values);
  return foundCountries;
}

export async function updateCountryInfo(
  userId: string,
  countries: ProfileTypes.CountryDB[],
  client: PoolClient
) {
  const query = `UPDATE "user_country" uc SET
    country_id = c.id,
    visible = t.visible
    FROM UNNEST($2::uuid[], $3::text[], $4::bool[]) AS t(id, name, visible)
    JOIN "country" c ON c.name = t.name
    WHERE uc.id = t.id AND uc.user_id = $1::uuid`;
  const values = [
    userId,
    countries.map((c) => c.id),
    countries.map((c) => c.name),
    countries.map((c) => c.visible),
  ];
  await client.query(query, values);
}

export async function updateProfilePicture(userId: string, url: string, client: PoolClient) {
  const query = `UPDATE "user"
    SET profile_picture = $2, updated_at = now()
    WHERE id = $1`;
  const values = [userId, url];
  await client.query(query, values);
}

export async function confirmProfileUpdate(userId: string, client: PoolClient) {
  const query = `UPDATE "user"
    SET updated_at = now()
    WHERE id = $1`;
  const values = [userId];
  await client.query(query, values);
}

export async function existsWorkExperience(id: string, userId: string) {
  const query = `SELECT * FROM "workexperience"
    WHERE id = $1 AND user_id = $2`;
  const values = [id, userId];
  const workExpFound = await processReturnQuery(query, values);
  return workExpFound.length !== 0;
}

export async function findWorkExperience(id: string, userId: string) {
  const query = `SELECT * FROM "workexperience"
    WHERE id = $1 AND user_id = $2`;
  const values = [id, userId];
  const workExp = await processReturnQuery(query, values);
  return workExp;
}

export async function updateWorkExperience(
  id: string,
  userId: string,
  workExpInfo: WorkExpTypes.EditableWorkExperienceDB
) {
  const setStatement: string[] = [];
  const values = Object.values(workExpInfo);
  values.push(id, userId);
  Object.keys(workExpInfo).forEach((key, i) => {
    setStatement.push(`${key} = $${i + 1}`);
  });
  const query = `UPDATE "workexperience"
    SET ${setStatement.join(", ")},
    updated_at = now()
    WHERE id = $${values.length - 1} AND user_id = $${values.length}`;
  await processReturnQuery(query, values);
}

export interface PublicProfileRow {
  handle_name: string;
  name: string;
  first_surname: string;
  profile_picture: string | null;
}

export async function findPublicProfileByHandle(handle: string): Promise<PublicProfileRow | null> {
  const query = `
    SELECT handle_name, name, first_surname, profile_picture
    FROM public."user"
    WHERE LOWER(handle_name) = LOWER($1)
      AND public_link_active = TRUE
      AND deleted_at IS NULL
    LIMIT 1
  `;

  const rows = (await processReturnQuery(query, [handle])) as PublicProfileRow[];

  return rows[0] ?? null;
}
