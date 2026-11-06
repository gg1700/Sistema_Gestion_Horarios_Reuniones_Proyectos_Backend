CREATE TABLE public.calendar_settings (
    user_id UUID PRIMARY KEY,
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_calendar_settings_user
        FOREIGN KEY (user_id)
        REFERENCES public."user"(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_calendar_settings_timezone
        CHECK (LENGTH(TRIM(timezone)) > 0)
);

CREATE TABLE public.availability_rule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,

    day_of_week SMALLINT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_availability_rule_user
        FOREIGN KEY (user_id)
        REFERENCES public."user"(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_availability_rule_day
        CHECK (day_of_week BETWEEN 0 AND 6),

    CONSTRAINT chk_availability_rule_time_range
        CHECK (start_time < end_time),

    CONSTRAINT uq_availability_rule_window
        UNIQUE (user_id, day_of_week, start_time, end_time)
);

CREATE INDEX availability_rule_user_day_active_idx
    ON public.availability_rule (user_id, day_of_week, active);

CREATE TABLE public.calendar_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    calendar_connection_id UUID NOT NULL,
    google_event_id VARCHAR(255) NOT NULL,

    title VARCHAR(200) NOT NULL,
    description TEXT,
    location VARCHAR(300),

    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    timezone VARCHAR(100) NOT NULL,

    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    event_status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    sync_status VARCHAR(20) NOT NULL DEFAULT 'synced',

    provider_updated_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_calendar_event_user
        FOREIGN KEY (user_id)
        REFERENCES public."user"(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_calendar_event_connection
        FOREIGN KEY (calendar_connection_id)
        REFERENCES public.calendar_connection(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_calendar_event_time_range
        CHECK (starts_at < ends_at),

    CONSTRAINT chk_calendar_event_status
        CHECK (event_status IN ('confirmed', 'tentative', 'cancelled')),

    CONSTRAINT chk_calendar_event_sync_status
        CHECK (sync_status IN ('synced', 'pending_sync', 'sync_error')),

    CONSTRAINT chk_calendar_event_google_id
        CHECK (LENGTH(TRIM(google_event_id)) > 0),

    CONSTRAINT uq_calendar_event_connection_google_id
        UNIQUE (calendar_connection_id, google_event_id)
);

CREATE INDEX calendar_event_user_range_idx
    ON public.calendar_event (user_id, starts_at, ends_at);

CREATE INDEX calendar_event_connection_start_idx
    ON public.calendar_event (calendar_connection_id, starts_at);

CREATE INDEX calendar_event_public_range_idx
    ON public.calendar_event (user_id, is_public, starts_at);

ALTER TABLE public.calendar_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_event ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
    public.calendar_settings,
    public.availability_rule,
    public.calendar_event
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE public.calendar_settings, public.availability_rule, public.calendar_event FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE public.calendar_settings, public.availability_rule, public.calendar_event FROM authenticated;
    END IF;
END
$$;
