
-- Requires migration 001-create-user-table.

-- Reject handles that cannot be normalized safely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.users
    WHERE handle_name IS NULL
       OR LOWER(BTRIM(handle_name)) !~ '^[a-z0-9-]{3,50}$'
  ) THEN
    RAISE EXCEPTION 'Invalid handles require manual review';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.users
    GROUP BY LOWER(BTRIM(handle_name))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate handles after normalization';
  END IF;
END
$$;

-- Normalize existing handles.
UPDATE public.users
SET handle_name = LOWER(BTRIM(handle_name))
WHERE handle_name IS DISTINCT FROM LOWER(BTRIM(handle_name));

-- Add public link activation status.
ALTER TABLE public.users
  ADD COLUMN public_link_active BOOLEAN NOT NULL DEFAULT FALSE;

-- Enforce valid handle format.
ALTER TABLE public.users
  ADD CONSTRAINT users_handle_name_format_check
  CHECK (handle_name IS NOT NULL AND handle_name ~ '^[a-z0-9-]{3,50}$');
