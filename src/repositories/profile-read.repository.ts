import { processReturnQuery } from "../utils/query";
import type {
  ProfileSurname,
  ProfilePhone,
  ProfileEmail,
  ProfileAddress,
  ProfileCountry,
  ProfileWorkExperience,
  ProfileLink,
} from "../types/profile-response.types";

export interface OwnProfileDB {
  id: string;
  handle_name: string;
  name: string;
  first_surname: string;
  email: string;
  profile_picture: string | null;
  surname: ProfileSurname | null;
  phones: ProfilePhone[];
  contact_emails: ProfileEmail[];
  addresses: ProfileAddress[];
  countries: ProfileCountry[];
  work_experiences: ProfileWorkExperience[];
  links: ProfileLink[];
}

export async function isActiveProfileUser(userId: string): Promise<boolean> {
  const rows = await processReturnQuery(
    `SELECT id FROM public."user" WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  return rows.length > 0;
}

export async function findOwnProfile(userId: string): Promise<OwnProfileDB | null> {
  const query = `
    SELECT u.id, u.handle_name, u.name, u.first_surname, u.email, u.profile_picture,
      CASE WHEN s.user_id IS NULL THEN NULL ELSE
        jsonb_build_object('surname', s.surname, 'visible', s.visible)
      END AS surname,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', up.id, 'phoneNumber', p.number,
          'countryCode', c.code, 'countryName', c.name, 'visible', up.visible
        ) ORDER BY up.id)
        FROM public.user_phone up
        JOIN public.phone p ON p.id = up.phone_id
        JOIN public.country c ON c.id = up.country_id
        WHERE up.user_id = u.id
      ), '[]'::jsonb) AS phones,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', ue.id, 'email', e.address, 'visible', ue.visible
        ) ORDER BY ue.id)
        FROM public.user_email ue
        JOIN public.email e ON e.id = ue.email_id
        WHERE ue.user_id = u.id
      ), '[]'::jsonb) AS contact_emails,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', a.id, 'address', a.address, 'visible', a.visible
        ) ORDER BY a.id)
        FROM public.address a WHERE a.user_id = u.id
      ), '[]'::jsonb) AS addresses,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', uc.id, 'countryName', c.name, 'countryCode', c.code, 'visible', uc.visible
        ) ORDER BY uc.id)
        FROM public.user_country uc
        JOIN public.country c ON c.id = uc.country_id
        WHERE uc.user_id = u.id
      ), '[]'::jsonb) AS countries,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', w.id, 'title', w.title, 'description', w.description,
          'companyName', w.company_name, 'visible', w.visible,
          'startDate', to_char(w.start_date, 'YYYY-MM-DD'),
          'endDate', to_char(w.end_date, 'YYYY-MM-DD')
        ) ORDER BY w.start_date DESC, w.id)
        FROM public.workexperience w WHERE w.user_id = u.id
      ), '[]'::jsonb) AS work_experiences,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', l.id, 'text', l.text, 'url', l.url, 'visible', l.visible
        ) ORDER BY l.id)
        FROM public.link l WHERE l.user_id = u.id
      ), '[]'::jsonb) AS links
    FROM public."user" u
    LEFT JOIN public.user_surname s ON s.user_id = u.id
    WHERE u.id = $1 AND u.deleted_at IS NULL
  `;
  const rows = await processReturnQuery(query, [userId]);
  return (rows[0] as OwnProfileDB | undefined) ?? null;
}
