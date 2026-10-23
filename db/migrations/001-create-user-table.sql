CREATE TABLE IF NOT EXISTS public."user" (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  handle_name varchar(50) NOT NULL,
  name varchar(100) NOT NULL,
  first_surname varchar(100) NOT NULL,
  email varchar(200) NOT NULL,
  password_hash varchar(255),
  profile_picture varchar(300),
  status varchar(50) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT user_email_lowercase_check CHECK (email = LOWER(email)),
  CONSTRAINT user_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS user_handle_name_unique_index ON public."user" (LOWER(handle_name));

CREATE UNIQUE INDEX IF NOT EXISTS user_email_unique_index ON public."user" (email);

ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;
