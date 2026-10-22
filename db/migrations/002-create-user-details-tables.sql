CREATE TABLE IF NOT EXISTS public.user_surname (
  user_id uuid PRIMARY KEY NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  surname varchar(100),
  visible boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.country (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  name varchar(200) UNIQUE NOT NULL,
  code varchar(3) UNIQUE NOT NULL,
  CONSTRAINT country_code_format_check CHECK (code ~ '^[1-9][0-9]{0,2}$')
);

CREATE TABLE IF NOT EXISTS public.user_country (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  country_id uuid NOT NULL REFERENCES public.country (id),
  visible boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.phone (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  number varchar(15) UNIQUE NOT NULL,
  CONSTRAINT phone_number_format_check CHECK (number ~ '^[0-9]{6,15}$')
);

CREATE TABLE IF NOT EXISTS public.user_phone (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  country_id uuid NOT NULL REFERENCES public.country (id),
  phone_id uuid NOT NULL REFERENCES public.phone (id),
  visible boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.email (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  address varchar(200) UNIQUE NOT NULL,
  CONSTRAINT email_address_lowercase_check CHECK (address = LOWER(address))
);

CREATE TABLE IF NOT EXISTS public.user_email (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  email_id uuid NOT NULL REFERENCES public.email (id),
  visible boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.address (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  address varchar(300) NOT NULL,
  visible boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS user_country_user_id_index ON public.user_country (user_id);
CREATE INDEX IF NOT EXISTS user_phone_user_id_index ON public.user_phone (user_id);
CREATE INDEX IF NOT EXISTS user_email_user_id_index ON public.user_email (user_id);
CREATE INDEX IF NOT EXISTS address_user_id_index ON public.address (user_id);

INSERT INTO public.country (name, code) VALUES
  ('Bolivia', '591'),
  ('Argentina', '54'),
  ('Brasil', '55'),
  ('Chile', '56'),
  ('Colombia', '57'),
  ('Ecuador', '593'),
  ('Paraguay', '595'),
  ('Perú', '51'),
  ('Uruguay', '598'),
  ('Venezuela', '58'),
  ('México', '52'),
  ('España', '34'),
  ('Estados Unidos', '1')
ON CONFLICT DO NOTHING;

ALTER TABLE public.user_surname ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_country ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_phone ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_email ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.address ENABLE ROW LEVEL SECURITY;
