ALTER TABLE public."user" DROP CONSTRAINT user_status_check;
ALTER TABLE public."user"
  ADD CONSTRAINT user_status_check CHECK (status IN ('active', 'inactive', 'deleted'));

ALTER TABLE public."user"
  ALTER COLUMN name DROP NOT NULL,
  ALTER COLUMN first_surname DROP NOT NULL,
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE public."user"
  ADD CONSTRAINT user_active_personal_data_check CHECK (
    deleted_at IS NOT NULL OR
    (name IS NOT NULL AND first_surname IS NOT NULL AND email IS NOT NULL)
  );