import type { PoolClient } from "pg";
import { processReturnQuery, processTransaction } from "../utils/query";
import type { SelectedGoogleCalendar } from "../types/google-calendar.types";
import { decryptToken } from "../utils/token";
interface GoogleAccountRow {
  id: string;
  state: string;
}

interface CalendarConnectionRow {
  google_calendar_id: string;
  name: string;
  timezone: string;
  status: "connected" | "reconnection_required";
}

export async function findSelectedCalendar(
  userId: string
): Promise<CalendarConnectionRow | null> {
  const rows = await processReturnQuery(
    `SELECT
       cc.google_calendar_id,
       cc.name,
       cc.timezone,
       cc.status
     FROM public.calendar_connection cc
     JOIN public.external_account ea
       ON ea.id = cc.external_account_id
     WHERE ea.user_id = $1
       AND ea.provider = 'google'`,
    [userId]
  );

  return (rows[0] as CalendarConnectionRow) ?? null;
}

export async function saveSelectedCalendar(
  userId: string,
  calendar: SelectedGoogleCalendar
): Promise<SelectedGoogleCalendar> {
  return processTransaction(async (client: PoolClient) => {
    const { rows } = await client.query<GoogleAccountRow>(
      `SELECT id, state
       FROM public.external_account
       WHERE user_id = $1
         AND provider = 'google'
       FOR UPDATE`,
      [userId]
    );

    const account = rows[0];

    if (!account || account.state !== "active") {
      throw new Error("reconnection_required");
    }

    await client.query(
      `INSERT INTO public.calendar_connection (
         external_account_id,
         google_calendar_id,
         name,
         timezone,
         status
       )
       VALUES ($1, $2, $3, $4, 'connected')
       ON CONFLICT (external_account_id)
       DO UPDATE SET
         google_calendar_id = EXCLUDED.google_calendar_id,
         name = EXCLUDED.name,
         timezone = EXCLUDED.timezone,
         status = 'connected',
         updated_at = NOW()`,
      [
        account.id,
        calendar.calendarId,
        calendar.calendarName,
        calendar.timezone
      ]
    );

    return calendar;
  });
}

export interface GoogleCalendarConnectionRow {
  state: string;
  scopes: string | null;
  has_refresh_token: boolean;
  google_calendar_id: string | null;
  calendar_name: string | null;
  calendar_status: string | null;
}

export async function findGoogleCalendarConnection(userId: string): Promise<GoogleCalendarConnectionRow | null> {
  const rows = await processReturnQuery(
    `SELECT ea.state, ea.scopes,
            (ea.refresh_token IS NOT NULL) AS has_refresh_token,
            cc.google_calendar_id, cc.name AS calendar_name,
            cc.status AS calendar_status
     FROM public.external_account ea
     LEFT JOIN public.calendar_connection cc ON cc.external_account_id = ea.id
     WHERE ea.user_id = $1 AND ea.provider = 'google'`,
    [userId]
  );

  return (rows[0] as GoogleCalendarConnectionRow) ?? null;
}

export async function disconnectGoogleCalendar(
  userId: string,
  revokeToken: (token: string) => Promise<void>
): Promise<void> {
  await processTransaction(async (client: PoolClient) => {
    const { rows } = await client.query<{
      id: string;
      access_token: string;
      refresh_token: string | null;
      scopes: string | null;
    }>(
      `SELECT id, access_token, refresh_token, scopes
       FROM public.external_account
       WHERE user_id = $1 AND provider = 'google'
       FOR UPDATE`,
      [userId]
    );

    const account = rows[0];
    if (!account) return;

    const scopes = account.scopes?.split(/\s+/).filter(Boolean) ?? [];
    const hasCalendarScopes = scopes.some(scope =>
      scope === "https://www.googleapis.com/auth/calendar.events" ||
      scope === "https://www.googleapis.com/auth/calendar.calendarlist.readonly"
    );

    if (hasCalendarScopes) {
      const token = account.refresh_token ?? account.access_token;
      await revokeToken(decryptToken(token));
    }

    await client.query(
      `DELETE FROM public.calendar_connection
       WHERE external_account_id = $1`,
      [account.id]
    );

    if (hasCalendarScopes) {
      await client.query(
        `UPDATE public.external_account
         SET refresh_token = NULL,
             access_expires_at = NULL,
             scopes = NULL,
             state = 'active',
             updated_at = NOW()
         WHERE id = $1`,
        [account.id]
      );
    }
  });
}

