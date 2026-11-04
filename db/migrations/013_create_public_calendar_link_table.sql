CREATE TABLE IF NOT EXISTS public.public_calendar_link (
  user_id UUID PRIMARY KEY,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT public_calendar_link_user_fk
    FOREIGN KEY (user_id)
    REFERENCES public."user"(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);
ALTER TABLE public.public_calendar_link
ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.public_calendar_link FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'anon'
  ) THEN
    REVOKE ALL ON TABLE public.public_calendar_link FROM anon;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'authenticated'
  ) THEN
    REVOKE ALL ON TABLE public.public_calendar_link FROM authenticated;
  END IF;
END
$$;
