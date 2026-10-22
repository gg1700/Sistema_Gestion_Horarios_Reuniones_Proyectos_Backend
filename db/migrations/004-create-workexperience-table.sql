CREATE TABLE IF NOT EXISTS public.workexperience (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  title varchar(150) NOT NULL,
  description varchar(200),
  company_name varchar(200),
  visible boolean NOT NULL DEFAULT true,
  start_date date NOT NULL,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workexperience_dates_check CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS workexperience_user_id_index ON public.workexperience (user_id);

ALTER TABLE public.workexperience ENABLE ROW LEVEL SECURITY;
