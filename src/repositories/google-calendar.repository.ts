import type { PoolClient } from "pg";
import { processReturnQuery, processTransaction } from "../utils/query";
import type { SelectedGoogleCalendar } from "../types/google-calendar.types";

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
