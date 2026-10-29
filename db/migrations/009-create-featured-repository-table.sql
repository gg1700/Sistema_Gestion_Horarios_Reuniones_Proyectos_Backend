-- T-44: el esquema del equipo y Visibilidad llaman a esta copia "repository".
-- No crear una segunda tabla featured_repository para los mismos datos.
CREATE TABLE public.repository (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    github_repo_id BIGINT NOT NULL CHECK (github_repo_id > 0),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    language VARCHAR(100),
    stars INTEGER NOT NULL DEFAULT 0 CHECK (stars >= 0),
    url TEXT NOT NULL CHECK (url LIKE 'https://github.com/%'),
    display_order INTEGER NOT NULL CHECK (display_order BETWEEN 0 AND 4),
    visible BOOLEAN NOT NULL DEFAULT FALSE,
    github_visibility VARCHAR(10) NOT NULL DEFAULT 'public'
      CHECK (github_visibility IN ('public', 'private', 'internal')),
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT repository_user_github_unique UNIQUE (user_id, github_repo_id),
    CONSTRAINT repository_user_order_unique UNIQUE (user_id, display_order) DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT repository_public_only CHECK (NOT visible OR github_visibility = 'public')
);
ALTER TABLE public.repository ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.repository FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE public.repository FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE public.repository FROM authenticated;
    END IF;
END $$;
