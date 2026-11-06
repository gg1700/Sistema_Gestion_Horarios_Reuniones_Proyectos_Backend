ALTER TABLE public."user"
  ADD COLUMN IF NOT EXISTS registration_completed boolean NOT NULL DEFAULT false;
