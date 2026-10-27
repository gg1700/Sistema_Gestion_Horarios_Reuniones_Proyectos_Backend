
CREATE TABLE public.calendar_connection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    external_account_id UUID NOT NULL UNIQUE,

    google_calendar_id TEXT NOT NULL,
    name VARCHAR(150) NOT NULL,
    timezone TEXT NOT NULL,

    status VARCHAR(50) NOT NULL DEFAULT 'connected',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_calendar_external_account
        FOREIGN KEY (external_account_id)
        REFERENCES public.external_account(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_calendar_status
        CHECK (status IN ('connected', 'reconnection_required')),

    CONSTRAINT chk_google_calendar_id
        CHECK (LENGTH(TRIM(google_calendar_id)) > 0),

    CONSTRAINT chk_calendar_name
        CHECK (LENGTH(TRIM(name)) > 0),

    CONSTRAINT chk_calendar_timezone
        CHECK (LENGTH(TRIM(timezone)) > 0)
);

CREATE FUNCTION public.validate_google_calendar_account()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.external_account
        WHERE id = NEW.external_account_id
          AND provider = 'google'
        FOR SHARE
    ) THEN
        RAISE EXCEPTION
            'Calendar connection requires a Google external account';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_google_calendar_account
BEFORE INSERT OR UPDATE OF external_account_id
ON public.calendar_connection
FOR EACH ROW
EXECUTE FUNCTION public.validate_google_calendar_account();

CREATE FUNCTION public.prevent_calendar_provider_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.provider IS DISTINCT FROM NEW.provider
       AND EXISTS (
           SELECT 1
           FROM public.calendar_connection
           WHERE external_account_id = OLD.id
       )
    THEN
        RAISE EXCEPTION
            'Cannot change provider while a calendar connection exists';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_calendar_provider_change
BEFORE UPDATE OF provider
ON public.external_account
FOR EACH ROW
EXECUTE FUNCTION public.prevent_calendar_provider_change();

ALTER TABLE public.calendar_connection
ENABLE ROW LEVEL SECURITY;
