-- El cliente T-39 ya consulta estas tablas; faltaba su migración versionada.
CREATE TABLE public.github_activity_list (
    user_id UUID PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
    activity TEXT NOT NULL,
    visible BOOLEAN NOT NULL DEFAULT FALSE,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE public.github_activity_grid (
    user_id UUID PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
    activity TEXT NOT NULL,
    visible BOOLEAN NOT NULL DEFAULT FALSE,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.github_activity_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.github_activity_grid ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.github_activity_list, public.github_activity_grid FROM PUBLIC;
