CREATE TABLE field_visibility (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    section VARCHAR(50) NOT NULL,
    visible BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_field_visibility_user
        FOREIGN KEY (user_id)
        REFERENCES "user"(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_field_visibility_user_section
        UNIQUE (user_id, section),

    CONSTRAINT chk_field_visibility_section
        CHECK (section IN ('repositories', 'github_activity'))
);

ALTER TABLE user_email
    ALTER COLUMN visible SET DEFAULT FALSE;

ALTER TABLE user_surname
    ALTER COLUMN visible SET DEFAULT FALSE;

ALTER TABLE user_phone
    ALTER COLUMN visible SET DEFAULT FALSE;

ALTER TABLE user_country
    ALTER COLUMN visible SET DEFAULT FALSE;

ALTER TABLE address
    ALTER COLUMN visible SET DEFAULT FALSE;

ALTER TABLE workexperience
    ALTER COLUMN visible SET DEFAULT FALSE;

ALTER TABLE field_visibility
    ENABLE ROW LEVEL SECURITY;
