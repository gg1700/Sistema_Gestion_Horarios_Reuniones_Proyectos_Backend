
CREATE TABLE public.field_visibility (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    section VARCHAR(50) NOT NULL,
    visible BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_field_visibility_user
        FOREIGN KEY (user_id)
        REFERENCES public."user"(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_field_visibility_user_section
        UNIQUE (user_id, section),

    CONSTRAINT chk_field_visibility_section
        CHECK (section IN ('repositories', 'github_activity'))
);

ALTER TABLE public.user_email
    ALTER COLUMN visible SET DEFAULT FALSE;

ALTER TABLE public.user_surname
    ALTER COLUMN visible SET DEFAULT FALSE;

ALTER TABLE public.user_phone
    ALTER COLUMN visible SET DEFAULT FALSE;

ALTER TABLE public.user_country
    ALTER COLUMN visible SET DEFAULT FALSE;

ALTER TABLE public.address
    ALTER COLUMN visible SET DEFAULT FALSE;

ALTER TABLE public.workexperience
    ALTER COLUMN visible SET DEFAULT FALSE;

ALTER TABLE public.field_visibility
    ENABLE ROW LEVEL SECURITY;
