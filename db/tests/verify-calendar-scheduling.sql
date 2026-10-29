BEGIN;

CREATE FUNCTION pg_temp.expect_error(label TEXT, stmt TEXT, expected TEXT)
RETURNS VOID AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected THEN
      RAISE NOTICE 'OK: %', label;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL: % (se obtuvo %)', label, SQLSTATE;
  END;
  RAISE EXCEPTION 'FAIL: % (no se lanzó error)', label;
END;
$$ LANGUAGE plpgsql;

INSERT INTO public."user" (id, handle_name, name, first_surname, email)
VALUES ('00000000-0000-0000-0000-00000000000a', 'test-cal-user', 'Test', 'User', 'test-cal-user@example.com');

INSERT INTO public.external_account (id, user_id, provider, provider_user_id, access_token)
VALUES ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 'google', 'g-test-1', 'enc-token');

INSERT INTO public.calendar_connection (id, external_account_id, google_calendar_id, name, timezone)
VALUES ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000b', 'primary', 'Test', 'UTC');

INSERT INTO public.calendar_settings (user_id)
VALUES ('00000000-0000-0000-0000-00000000000a');

INSERT INTO public.availability_rule (user_id, day_of_week, start_time, end_time)
VALUES ('00000000-0000-0000-0000-00000000000a', 1, '09:00', '12:00');

INSERT INTO public.calendar_event (user_id, calendar_connection_id, google_event_id, title, starts_at, ends_at, timezone)
VALUES ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'ev-1', 'Evento', '2030-01-01 10:00+00', '2030-01-01 11:00+00', 'UTC');

DO $$
BEGIN
  IF (SELECT timezone FROM public.calendar_settings
      WHERE user_id = '00000000-0000-0000-0000-00000000000a') IS DISTINCT FROM 'UTC' THEN
    RAISE EXCEPTION 'FAIL: default de calendar_settings.timezone';
  END IF;
  IF (SELECT active FROM public.availability_rule
      WHERE user_id = '00000000-0000-0000-0000-00000000000a'
        AND day_of_week = 1 AND start_time = '09:00') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FAIL: default de availability_rule.active';
  END IF;
  IF (SELECT is_public FROM public.calendar_event
      WHERE calendar_connection_id = '00000000-0000-0000-0000-00000000000c'
        AND google_event_id = 'ev-1') IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'FAIL: default de calendar_event.is_public';
  END IF;
  IF (SELECT event_status FROM public.calendar_event
      WHERE calendar_connection_id = '00000000-0000-0000-0000-00000000000c'
        AND google_event_id = 'ev-1') IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION 'FAIL: default de event_status';
  END IF;
  IF (SELECT sync_status FROM public.calendar_event
      WHERE calendar_connection_id = '00000000-0000-0000-0000-00000000000c'
        AND google_event_id = 'ev-1') IS DISTINCT FROM 'synced' THEN
    RAISE EXCEPTION 'FAIL: default de sync_status';
  END IF;
  RAISE NOTICE 'OK: defaults';
END $$;

SELECT pg_temp.expect_error('day_of_week = 7',
  $q$INSERT INTO public.availability_rule (user_id, day_of_week, start_time, end_time)
     VALUES ('00000000-0000-0000-0000-00000000000a', 7, '09:00', '10:00')$q$, '23514');
SELECT pg_temp.expect_error('day_of_week = -1',
  $q$INSERT INTO public.availability_rule (user_id, day_of_week, start_time, end_time)
     VALUES ('00000000-0000-0000-0000-00000000000a', -1, '09:00', '10:00')$q$, '23514');
SELECT pg_temp.expect_error('start_time = end_time',
  $q$INSERT INTO public.availability_rule (user_id, day_of_week, start_time, end_time)
     VALUES ('00000000-0000-0000-0000-00000000000a', 2, '10:00', '10:00')$q$, '23514');
SELECT pg_temp.expect_error('start_time > end_time (medianoche cruzada)',
  $q$INSERT INTO public.availability_rule (user_id, day_of_week, start_time, end_time)
     VALUES ('00000000-0000-0000-0000-00000000000a', 2, '22:00', '02:00')$q$, '23514');
SELECT pg_temp.expect_error('regla duplicada',
  $q$INSERT INTO public.availability_rule (user_id, day_of_week, start_time, end_time)
     VALUES ('00000000-0000-0000-0000-00000000000a', 1, '09:00', '12:00')$q$, '23505');
SELECT pg_temp.expect_error('availability_rule con user inexistente',
  $q$INSERT INTO public.availability_rule (user_id, day_of_week, start_time, end_time)
     VALUES ('00000000-0000-0000-0000-0000000000ff', 3, '09:00', '10:00')$q$, '23503');

SELECT pg_temp.expect_error('calendar_settings duplicado',
  $q$INSERT INTO public.calendar_settings (user_id)
     VALUES ('00000000-0000-0000-0000-00000000000a')$q$, '23505');
SELECT pg_temp.expect_error('calendar_settings con user inexistente',
  $q$INSERT INTO public.calendar_settings (user_id)
     VALUES ('00000000-0000-0000-0000-0000000000ff')$q$, '23503');

SELECT pg_temp.expect_error('starts_at = ends_at',
  $q$INSERT INTO public.calendar_event (user_id, calendar_connection_id, google_event_id, title, starts_at, ends_at, timezone)
     VALUES ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'ev-2', 'X', '2030-01-01 10:00+00', '2030-01-01 10:00+00', 'UTC')$q$, '23514');
SELECT pg_temp.expect_error('starts_at > ends_at',
  $q$INSERT INTO public.calendar_event (user_id, calendar_connection_id, google_event_id, title, starts_at, ends_at, timezone)
     VALUES ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'ev-3', 'X', '2030-01-01 12:00+00', '2030-01-01 11:00+00', 'UTC')$q$, '23514');
SELECT pg_temp.expect_error('event_status inválido',
  $q$INSERT INTO public.calendar_event (user_id, calendar_connection_id, google_event_id, title, starts_at, ends_at, timezone, event_status)
     VALUES ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'ev-4', 'X', '2030-01-01 10:00+00', '2030-01-01 11:00+00', 'UTC', 'deleted')$q$, '23514');
SELECT pg_temp.expect_error('sync_status inválido',
  $q$INSERT INTO public.calendar_event (user_id, calendar_connection_id, google_event_id, title, starts_at, ends_at, timezone, sync_status)
     VALUES ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'ev-5', 'X', '2030-01-01 10:00+00', '2030-01-01 11:00+00', 'UTC', 'broken')$q$, '23514');
SELECT pg_temp.expect_error('google_event_id vacío',
  $q$INSERT INTO public.calendar_event (user_id, calendar_connection_id, google_event_id, title, starts_at, ends_at, timezone)
     VALUES ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '  ', 'X', '2030-01-01 10:00+00', '2030-01-01 11:00+00', 'UTC')$q$, '23514');
SELECT pg_temp.expect_error('(connection, google_event_id) duplicado',
  $q$INSERT INTO public.calendar_event (user_id, calendar_connection_id, google_event_id, title, starts_at, ends_at, timezone)
     VALUES ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'ev-1', 'X', '2030-01-01 10:00+00', '2030-01-01 11:00+00', 'UTC')$q$, '23505');
SELECT pg_temp.expect_error('calendar_event con user inexistente',
  $q$INSERT INTO public.calendar_event (user_id, calendar_connection_id, google_event_id, title, starts_at, ends_at, timezone)
     VALUES ('00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-00000000000c', 'ev-6', 'X', '2030-01-01 10:00+00', '2030-01-01 11:00+00', 'UTC')$q$, '23503');
SELECT pg_temp.expect_error('calendar_event con connection inexistente',
  $q$INSERT INTO public.calendar_event (user_id, calendar_connection_id, google_event_id, title, starts_at, ends_at, timezone)
     VALUES ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000ff', 'ev-7', 'X', '2030-01-01 10:00+00', '2030-01-01 11:00+00', 'UTC')$q$, '23503');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid IN ('public.calendar_settings'::regclass,
                  'public.availability_rule'::regclass,
                  'public.calendar_event'::regclass)
      AND NOT relrowsecurity
  ) THEN
    RAISE EXCEPTION 'FAIL: RLS no activado en alguna tabla';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('calendar_settings', 'availability_rule', 'calendar_event')
  ) THEN
    RAISE EXCEPTION 'FAIL: existen políticas que no deberían existir';
  END IF;
  RAISE NOTICE 'OK: RLS activado y sin políticas';
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE c.oid IN ('public.calendar_settings'::regclass,
                    'public.availability_rule'::regclass,
                    'public.calendar_event'::regclass)
      AND (a.grantee = 0
           OR a.grantee IN (SELECT oid FROM pg_roles
                            WHERE rolname IN ('anon', 'authenticated')))
  ) THEN
    RAISE EXCEPTION 'FAIL: PUBLIC, anon o authenticated tienen permisos directos';
  END IF;
  RAISE NOTICE 'OK: sin permisos directos para PUBLIC ni roles cliente existentes';
END $$;

DELETE FROM public."user" WHERE id = '00000000-0000-0000-0000-00000000000a';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.calendar_settings
    WHERE user_id = '00000000-0000-0000-0000-00000000000a'
  ) OR EXISTS (
    SELECT 1 FROM public.availability_rule
    WHERE user_id = '00000000-0000-0000-0000-00000000000a'
  ) OR EXISTS (
    SELECT 1 FROM public.calendar_event
    WHERE user_id = '00000000-0000-0000-0000-00000000000a'
  ) THEN
    RAISE EXCEPTION 'FAIL: la cascada desde user no limpió sus registros';
  END IF;
  RAISE NOTICE 'OK: cascada desde user';
END $$;

ROLLBACK;
