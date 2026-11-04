
CREATE TABLE IF NOT EXISTS public.calendar_calendar_choice (
  user_id UUID PRIMARY KEY
    REFERENCES public."user"(id)
    ON DELETE CASCADE,

  google_calendar_id VARCHAR(1024) NOT NULL,
  sync_token TEXT,
  last_synced_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT calendar_choice_id_not_blank
    CHECK (LENGTH(BTRIM(google_calendar_id)) > 0)
);

INSERT INTO public.calendar_calendar_choice (
  user_id,
  google_calendar_id
)
SELECT
  ea.user_id,
  cc.google_calendar_id
FROM public.calendar_connection cc
JOIN public.external_account ea
  ON ea.id = cc.external_account_id
WHERE ea.provider = 'google'
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.calendar_calendar_choice
ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.calendar_calendar_choice FROM PUBLIC;