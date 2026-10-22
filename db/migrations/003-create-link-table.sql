CREATE TABLE IF NOT EXISTS public.link (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  text varchar(150) NOT NULL,
  url varchar(300) NOT NULL,
  visible boolean NOT NULL DEFAULT true,
  CONSTRAINT link_url_protocol_check CHECK (url ~* '^https?://')
);

CREATE INDEX IF NOT EXISTS link_user_id_index ON public.link (user_id);

ALTER TABLE public.link ENABLE ROW LEVEL SECURITY;
