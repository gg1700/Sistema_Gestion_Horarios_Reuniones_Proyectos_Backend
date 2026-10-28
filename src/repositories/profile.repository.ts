import { processReturnQuery } from "../utils/query";
import { PoolClient } from "pg";
import * as ProfileTypes from "../types/profile.types";
import * as WorkExpTypes from "../types/work_experience.types";

export async function existsUser(userId: string) {
  const query = `
    SELECT * FROM "user"
    WHERE id = $1 AND deleted_at IS NULL`;
  const values = [userId];
  const userFound = await processReturnQuery(query, values);
  return userFound.length !== 0;
}

export async function lockActiveUser(userId: string, client: PoolClient) {
  const { rows } = await client.query(
    `SELECT id FROM public."user" WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
    [userId]
  );
  return rows.length !== 0;
}

export async function updatePersonalInfo(userId: string, userInfo: Record<string, any>, client: PoolClient) {
  const setStatement: string[] = [];
  const values = Object.values(userInfo);
  values.push(userId);
  Object.keys(userInfo).forEach((key, i) => {
    setStatement.push(`${key} = $${i + 1}`);
  });
  const query = `UPDATE "user"
    SET ${setStatement.join(", ")}
    WHERE id = $${values.length} AND deleted_at IS NULL`;
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

export async function insertUnregisteredNumber(phones: Pick<ProfileTypes.PhoneDB, "number">[], client: PoolClient) {
  const query = `INSERT INTO "phone" (number)
    SELECT UNNEST($1::text[])
    ON CONFLICT (number) DO NOTHING`;
  const values = [phones.map((p) => p.number)];
  const phoneNumbers = await client.query(query, values);
  return phoneNumbers.rows;
}

export async function findCountriesByCodes(phones: Pick<ProfileTypes.PhoneDB, "code">[]) {
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

export async function insertUnregisteredEmail(emails: Pick<ProfileTypes.ContactEmailDB, "address">[], client: PoolClient) {
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

export async function findCountriesByName(countries: Pick<ProfileTypes.CountryDB, "name">[]) {
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
    WHERE id = $1 AND deleted_at IS NULL`;
  const values = [userId, url];
  await client.query(query, values);
}

export async function confirmProfileUpdate(userId: string, client: PoolClient) {
  const query = `UPDATE "user"
    SET updated_at = now()
    WHERE id = $1 AND deleted_at IS NULL`;
  const values = [userId];
  await client.query(query, values);
}

export async function existsWorkExperience(id: string, userId: string) {
  const query = `SELECT * FROM "workexperience"
    WHERE id = $1 AND user_id = $2
    AND EXISTS (SELECT 1 FROM "user" WHERE id = $2 AND deleted_at IS NULL)`;
  const values = [id, userId];
  const workExpFound = await processReturnQuery(query, values);
  return workExpFound.length !== 0;
}

export async function findWorkExperience(id: string, userId: string) {
  const query = `SELECT * FROM "workexperience"
    WHERE id = $1 AND user_id = $2
    AND EXISTS (SELECT 1 FROM "user" WHERE id = $2 AND deleted_at IS NULL)`;
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
    WHERE id = $${values.length - 1} AND user_id = $${values.length}
    AND EXISTS (SELECT 1 FROM "user" WHERE id = $${values.length} AND deleted_at IS NULL)`;
  await processReturnQuery(query, values);
}

export interface PublicProfileRow {
  id: string;
  handle_name: string;
  name: string;
  first_surname: string;
  profile_picture: string | null;
}

export async function findPublicProfileByHandle(handle: string): Promise<PublicProfileRow | null> {
  const query = `
    SELECT id, handle_name, name, first_surname, profile_picture
    FROM public."user"
    WHERE LOWER(handle_name) = LOWER($1)
      AND public_link_active = TRUE
      AND status = 'active'
      AND deleted_at IS NULL
    LIMIT 1
  `;

  const rows = (await processReturnQuery(query, [handle])) as PublicProfileRow[];

  return rows[0] ?? null;
}

export async function hasAdditionalInfo(userId: string) {
  const query = `SELECT EXISTS (SELECT 1 FROM "user" WHERE id = $1 AND deleted_at IS NULL) AND (
    EXISTS (SELECT 1 FROM "user_surname" WHERE user_id = $1)
    OR EXISTS (SELECT 1 FROM "user_phone" WHERE user_id = $1)
    OR EXISTS (SELECT 1 FROM "user_email" WHERE user_id = $1)
    OR EXISTS (SELECT 1 FROM "address" WHERE user_id = $1)
    OR EXISTS (SELECT 1 FROM "link" WHERE user_id = $1)
    OR EXISTS (SELECT 1 FROM "user_country" WHERE user_id = $1)
    OR EXISTS (SELECT 1 FROM "workexperience" WHERE user_id = $1)) AS registered`;
  const values = [userId];
  const result = await processReturnQuery(query, values);
  return result[0].registered as boolean;
}

export async function insertUserPhones(userId: string, phones: ProfileTypes.NewPhoneDB[], client: PoolClient) {
  const query = `INSERT INTO "user_phone" (user_id, phone_id, country_id, visible)
    SELECT $1::uuid, p.id, c.id, t.visible
    FROM UNNEST($2::text[], $3::text[], $4::bool[]) AS t(number, code, visible)
    JOIN "phone" p ON p.number = t.number
    JOIN "country" c ON c.code = t.code`;
  const values = [userId, phones.map(phone => phone.number), phones.map(phone => phone.code), phones.map(phone => phone.visible)];
  await client.query(query, values);
}

export async function insertUserEmails(userId: string, emails: ProfileTypes.NewContactEmailDB[], client: PoolClient) {
  const query = `INSERT INTO "user_email" (user_id, email_id, visible)
    SELECT $1::uuid, e.id, t.visible
    FROM UNNEST($2::text[], $3::bool[]) AS t(address, visible)
    JOIN "email" e ON e.address = t.address`;
  const values = [userId, emails.map(email => email.address), emails.map(email => email.visible)];
  await client.query(query, values);
}

export async function insertAddresses(userId: string, addresses: ProfileTypes.NewAddressDB[], client: PoolClient) {
  const query = `INSERT INTO "address" (user_id, address, visible)
    SELECT $1::uuid, t.address, t.visible
    FROM UNNEST($2::text[], $3::bool[]) AS t(address, visible)`;
  const values = [userId, addresses.map(address => address.address), addresses.map(address => address.visible)];
  await client.query(query, values);
}

export async function insertLinks(userId: string, links: ProfileTypes.NewLinkDB[], client: PoolClient) {
  const query = `INSERT INTO "link" (user_id, text, url, visible)
    SELECT $1::uuid, t.text, t.url, t.visible
    FROM UNNEST($2::text[], $3::text[], $4::bool[]) AS t(text, url, visible)`;
  const values = [userId, links.map(link => link.text), links.map(link => link.url), links.map(link => link.visible)];
  await client.query(query, values);
}

export async function insertUserCountries(userId: string, countries: ProfileTypes.NewCountryDB[], client: PoolClient) {
  const query = `INSERT INTO "user_country" (user_id, country_id, visible)
    SELECT $1::uuid, c.id, t.visible
    FROM UNNEST($2::text[], $3::bool[]) AS t(name, visible)
    JOIN "country" c ON c.name = t.name`;
  const values = [userId, countries.map(country => country.name), countries.map(country => country.visible)];
  await client.query(query, values);
}

export async function insertWorkExperiences(userId: string, workExperiences: ProfileTypes.NewWorkExperienceDB[], client: PoolClient) {
  const query = `INSERT INTO "workexperience" (user_id, title, description, company_name, start_date, end_date, visible)
    SELECT $1::uuid, t.title, t.description, t.company_name, t.start_date, t.end_date, t.visible
    FROM UNNEST($2::text[], $3::text[], $4::text[], $5::date[], $6::date[], $7::bool[])
    AS t(title, description, company_name, start_date, end_date, visible)`;
  const values = [
    userId,
    workExperiences.map(workExperience => workExperience.title),
    workExperiences.map(workExperience => workExperience.description),
    workExperiences.map(workExperience => workExperience.company_name),
    workExperiences.map(workExperience => workExperience.start_date),
    workExperiences.map(workExperience => workExperience.end_date),
    workExperiences.map(workExperience => workExperience.visible)
  ];
  await client.query(query, values);
}