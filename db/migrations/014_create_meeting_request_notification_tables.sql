CREATE TABLE IF NOT EXISTS public.meeting_request (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  requester_user_id uuid NOT NULL REFERENCES public."user" (id) ON DELETE CASCADE ON UPDATE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES public."user" (id) ON DELETE CASCADE ON UPDATE CASCADE,
  requested_start_at timestamptz NOT NULL,
  requested_end_at timestamptz NOT NULL,
  timezone varchar(100) NOT NULL,
  title varchar(200) NOT NULL,
  message text,
  status varchar(20) NOT NULL DEFAULT 'pending',
  owner_response_message text,
  calendar_event_id uuid REFERENCES public.calendar_event (id) ON DELETE SET NULL ON UPDATE CASCADE,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_request_participants_check CHECK (requester_user_id <> recipient_user_id),
  CONSTRAINT meeting_request_interval_check CHECK (requested_start_at < requested_end_at),
  CONSTRAINT meeting_request_status_check CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  CONSTRAINT meeting_request_timezone_check CHECK (LENGTH(BTRIM(timezone)) > 0),
  CONSTRAINT meeting_request_title_check CHECK (LENGTH(BTRIM(title)) > 0)
);

CREATE INDEX IF NOT EXISTS meeting_request_requester_status_index
  ON public.meeting_request (requester_user_id, status, created_at);
CREATE INDEX IF NOT EXISTS meeting_request_recipient_status_index
  ON public.meeting_request (recipient_user_id, status, requested_start_at);
CREATE INDEX IF NOT EXISTS meeting_request_recipient_interval_index
  ON public.meeting_request (recipient_user_id, requested_start_at, requested_end_at);
CREATE INDEX IF NOT EXISTS meeting_request_calendar_event_index
  ON public.meeting_request (calendar_event_id);

CREATE TABLE IF NOT EXISTS public.notification (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public."user" (id) ON DELETE CASCADE ON UPDATE CASCADE,
  actor_user_id uuid REFERENCES public."user" (id) ON DELETE SET NULL ON UPDATE CASCADE,
  meeting_request_id uuid REFERENCES public.meeting_request (id) ON DELETE SET NULL ON UPDATE CASCADE,
  notification_type varchar(50) NOT NULL,
  title varchar(120) NOT NULL,
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_type_check CHECK (notification_type IN (
    'meeting_request_created',
    'meeting_request_updated',
    'meeting_request_cancelled',
    'meeting_request_accepted',
    'meeting_request_rejected'
  )),
  CONSTRAINT notification_title_check CHECK (LENGTH(BTRIM(title)) > 0),
  CONSTRAINT notification_payload_check CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS notification_user_read_index
  ON public.notification (user_id, read_at, created_at);
CREATE INDEX IF NOT EXISTS notification_meeting_request_index
  ON public.notification (meeting_request_id);
CREATE INDEX IF NOT EXISTS notification_actor_index
  ON public.notification (actor_user_id);

ALTER TABLE public.meeting_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.meeting_request FROM PUBLIC;
REVOKE ALL ON TABLE public.notification FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.meeting_request FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.notification FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.meeting_request FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.notification FROM authenticated';
  END IF;
END $$;
