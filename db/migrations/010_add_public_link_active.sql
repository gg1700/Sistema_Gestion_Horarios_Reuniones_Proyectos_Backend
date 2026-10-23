-- Requires the base user table migration.

-- Validate existing handles before normalization.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."user"
    WHERE handle_name IS NULL
       OR LOWER(BTRIM(handle_name)) !~ '^[a-z0-9-]{3,50}$'
  ) THEN
    RAISE EXCEPTION 'Invalid handles require manual review';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."user"
    GROUP BY LOWER(BTRIM(handle_name))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate handles after normalization';
  END IF;
END
$$;

-- Normalize existing handles.
UPDATE public."user"
SET handle_name = LOWER(BTRIM(handle_name))
WHERE handle_name IS DISTINCT FROM LOWER(BTRIM(handle_name));

-- Add public link activation status.
ALTER TABLE public."user"
  ADD COLUMN public_link_active BOOLEAN NOT NULL DEFAULT FALSE;

-- Enforce valid handle format.
ALTER TABLE public."user"
  ADD CONSTRAINT user_handle_name_format_check
  CHECK (
    handle_name IS NOT NULL
    AND handle_name ~ '^[a-z0-9-]{3,50}$'
  );