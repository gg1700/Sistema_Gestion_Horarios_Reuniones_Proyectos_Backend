CREATE TABLE public.external_account (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,
    provider_user_id VARCHAR(100) NOT NULL,
    provider_username VARCHAR(100),
    provider_user_email VARCHAR(200),
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    access_expires_at TIMESTAMPTZ,
    scopes TEXT,
    state VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT external_account_provider_check
        CHECK (provider IN ('google', 'github')),
    CONSTRAINT external_account_state_check
        CHECK (state IN ('active', 'inactive', 'expired', 'revoked')),
    CONSTRAINT external_account_provider_id_check
        CHECK (LENGTH(BTRIM(provider_user_id)) > 0),
    CONSTRAINT external_account_access_token_check
        CHECK (LENGTH(BTRIM(access_token)) > 0),
    CONSTRAINT external_account_provider_user_unique
        UNIQUE (provider, provider_user_id),
    CONSTRAINT external_account_user_provider_unique
        UNIQUE (user_id, provider)
);
ALTER TABLE public.external_account ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.external_account FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.external_account FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.external_account FROM authenticated';
    END IF;
END $$;