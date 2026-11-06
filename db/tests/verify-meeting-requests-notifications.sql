BEGIN;
DO $$
DECLARE
  requester_id uuid;
  recipient_id uuid;
  request_id uuid;
  notification_id uuid;
  is_blocked boolean;
  default_status varchar;
  default_payload jsonb;
  remaining integer;
BEGIN
  INSERT INTO public."user" (handle_name, name, first_surname, email)
  VALUES ('db02-requester-' || substr(md5(random()::text), 1, 10), 'Test', 'Requester', 'db02-requester-' || substr(md5(random()::text), 1, 10) || '@example.org')
  RETURNING id INTO requester_id;
  INSERT INTO public."user" (handle_name, name, first_surname, email)
  VALUES ('db02-recipient-' || substr(md5(random()::text), 1, 10), 'Test', 'Recipient', 'db02-recipient-' || substr(md5(random()::text), 1, 10) || '@example.org')
  RETURNING id INTO recipient_id;

  INSERT INTO public.meeting_request (requester_user_id, recipient_user_id, requested_start_at, requested_end_at, timezone, title)
  VALUES (requester_id, recipient_id, now() + interval '1 day', now() + interval '1 day 1 hour', 'America/La_Paz', 'Reunion de prueba')
  RETURNING id, status INTO request_id, default_status;
  IF default_status <> 'pending' THEN RAISE EXCEPTION 'Default status must be pending'; END IF;

  is_blocked := false;
  BEGIN
    INSERT INTO public.meeting_request (requester_user_id, recipient_user_id, requested_start_at, requested_end_at, timezone, title, status)
    VALUES (requester_id, recipient_id, now() + interval '1 day', now() + interval '1 day 1 hour', 'UTC', 'Estado invalido', 'archived');
  EXCEPTION WHEN check_violation THEN is_blocked := true;
  END;
  IF NOT is_blocked THEN RAISE EXCEPTION 'Missing status check'; END IF;

  is_blocked := false;
  BEGIN
    INSERT INTO public.meeting_request (requester_user_id, recipient_user_id, requested_start_at, requested_end_at, timezone, title)
    VALUES (requester_id, requester_id, now() + interval '1 day', now() + interval '1 day 1 hour', 'UTC', 'Mismo usuario');
  EXCEPTION WHEN check_violation THEN is_blocked := true;
  END;
  IF NOT is_blocked THEN RAISE EXCEPTION 'Missing requester distinct from recipient check'; END IF;

  is_blocked := false;
  BEGIN
    INSERT INTO public.meeting_request (requester_user_id, recipient_user_id, requested_start_at, requested_end_at, timezone, title)
    VALUES (requester_id, recipient_id, now() + interval '2 hours', now() + interval '1 hour', 'UTC', 'Intervalo invalido');
  EXCEPTION WHEN check_violation THEN is_blocked := true;
  END;
  IF NOT is_blocked THEN RAISE EXCEPTION 'Missing start before end check'; END IF;

  is_blocked := false;
  BEGIN
    INSERT INTO public.meeting_request (requester_user_id, recipient_user_id, requested_start_at, requested_end_at, timezone, title)
    VALUES (requester_id, gen_random_uuid(), now() + interval '1 day', now() + interval '1 day 1 hour', 'UTC', 'Destinatario inexistente');
  EXCEPTION WHEN foreign_key_violation THEN is_blocked := true;
  END;
  IF NOT is_blocked THEN RAISE EXCEPTION 'Missing recipient foreign key'; END IF;

  is_blocked := false;
  BEGIN
    UPDATE public.meeting_request SET calendar_event_id = gen_random_uuid() WHERE id = request_id;
  EXCEPTION WHEN foreign_key_violation THEN is_blocked := true;
  END;
  IF NOT is_blocked THEN RAISE EXCEPTION 'Missing calendar event foreign key'; END IF;

  INSERT INTO public.notification (user_id, actor_user_id, meeting_request_id, notification_type, title, message)
  VALUES (recipient_id, requester_id, request_id, 'meeting_request_created', 'Nueva solicitud', 'Tienes una nueva solicitud de horario')
  RETURNING id, payload INTO notification_id, default_payload;
  IF default_payload <> '{}'::jsonb THEN RAISE EXCEPTION 'Default payload must be an empty object'; END IF;

  is_blocked := false;
  BEGIN
    INSERT INTO public.notification (user_id, notification_type, title, message)
    VALUES (recipient_id, 'meeting_request_deleted', 'Tipo invalido', 'Mensaje');
  EXCEPTION WHEN check_violation THEN is_blocked := true;
  END;
  IF NOT is_blocked THEN RAISE EXCEPTION 'Missing notification type check'; END IF;

  UPDATE public.meeting_request SET status = 'cancelled', resolved_at = now() WHERE id = request_id;
  SELECT count(*) INTO remaining FROM public.meeting_request WHERE id = request_id AND status = 'cancelled';
  IF remaining <> 1 THEN RAISE EXCEPTION 'Cancelled request must be kept'; END IF;

  DELETE FROM public."user" WHERE id = requester_id;
  SELECT count(*) INTO remaining FROM public.meeting_request WHERE id = request_id;
  IF remaining <> 0 THEN RAISE EXCEPTION 'Requester ON DELETE CASCADE failed'; END IF;
  SELECT count(*) INTO remaining FROM public.notification
  WHERE id = notification_id AND meeting_request_id IS NULL AND actor_user_id IS NULL;
  IF remaining <> 1 THEN RAISE EXCEPTION 'Notification ON DELETE SET NULL failed'; END IF;

  DELETE FROM public."user" WHERE id = recipient_id;
  SELECT count(*) INTO remaining FROM public.notification WHERE id = notification_id;
  IF remaining <> 0 THEN RAISE EXCEPTION 'Notification user ON DELETE CASCADE failed'; END IF;

  RAISE NOTICE 'DB-02 constraints and foreign keys OK';
END $$;

DO $$
DECLARE
  table_name text;
  is_enabled boolean;
  policy_count integer;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['meeting_request', 'notification'] LOOP
    SELECT relrowsecurity INTO is_enabled FROM pg_class WHERE oid = ('public.' || table_name)::regclass;
    SELECT count(*) INTO policy_count FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name;
    IF NOT is_enabled THEN RAISE EXCEPTION 'RLS is disabled on %', table_name; END IF;
    IF policy_count <> 0 THEN RAISE EXCEPTION 'Unexpected RLS policies on %', table_name; END IF;
  END LOOP;
  RAISE NOTICE 'DB-02 RLS enabled and no policies found';
END $$;
ROLLBACK;
