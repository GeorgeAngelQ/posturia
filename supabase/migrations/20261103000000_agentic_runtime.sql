-- =====================================================================
-- Runtime agéntico: trazas auditables, memoria por usuario, consentimiento
-- de monitoreo y modo de privacidad de la organización.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Privacidad de la organización y consentimiento del usuario
-- ---------------------------------------------------------------------
-- individual: owner/hr ven puntajes y trazas por colaborador (comportamiento original).
-- aggregate : owner/hr ven solo indicadores agregados; las trazas por colaborador
--             dejan de ser visibles para ellos (se aplica por RLS en agent_runs).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS privacy_mode TEXT NOT NULL DEFAULT 'individual'
  CHECK (privacy_mode IN ('individual', 'aggregate'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monitoring_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS monitoring_consent_version TEXT;

-- `organizations` solo tenía SELECT para authenticated. Se concede UPDATE ÚNICAMENTE sobre
-- privacy_mode (el owner no puede tocar plan ni is_active; la política organizations_update_owner
-- sigue limitando quién puede hacerlo).
GRANT UPDATE (privacy_mode) ON public.organizations TO authenticated;

CREATE OR REPLACE FUNCTION public.org_allows_individual_view(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT privacy_mode = 'individual' FROM public.organizations WHERE id = _org_id),
    false
  )
$$;
REVOKE ALL ON FUNCTION public.org_allows_individual_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_allows_individual_view(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. agent_runs: una fila por análisis de sesión
-- ---------------------------------------------------------------------
CREATE TABLE public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.posture_sessions(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK (mode IN ('agentic', 'pipeline', 'pipeline-fallback')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'fallback', 'error')),
  provider TEXT,
  model TEXT,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  error TEXT,
  llm_calls INT NOT NULL DEFAULT 0,
  tool_calls INT NOT NULL DEFAULT 0,
  approx_tokens_in INT NOT NULL DEFAULT 0,
  approx_tokens_out INT NOT NULL DEFAULT 0,
  validation_passed BOOLEAN,
  escalated BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INT
);
CREATE INDEX agent_runs_user_started_idx ON public.agent_runs(user_id, started_at DESC);
CREATE INDEX agent_runs_org_started_idx ON public.agent_runs(org_id, started_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.agent_runs TO authenticated;
GRANT ALL ON public.agent_runs TO service_role;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

-- Cada usuario ve las suyas. owner/hr ven las de su organización SOLO si la
-- organización está en modo "individual".
CREATE POLICY "agent_runs_select" ON public.agent_runs FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (
    public.has_org_admin_access(auth.uid(), org_id)
    AND public.org_allows_individual_view(org_id)
  )
);
CREATE POLICY "agent_runs_insert_own" ON public.agent_runs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.is_org_member(auth.uid(), org_id));
CREATE POLICY "agent_runs_update_own" ON public.agent_runs FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3. agent_steps: pasos de cada ejecución (LLM, herramientas, delegaciones…)
-- ---------------------------------------------------------------------
CREATE TABLE public.agent_steps (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  idx INT NOT NULL,
  agent TEXT NOT NULL CHECK (agent IN ('orchestrator', 'supervisor', 'analyst', 'coach', 'validator')),
  kind TEXT NOT NULL CHECK (kind IN ('llm', 'tool', 'delegate', 'validation', 'memory', 'system')),
  name TEXT,
  depth INT NOT NULL DEFAULT 0,
  ok BOOLEAN NOT NULL DEFAULT true,
  input JSONB,
  output JSONB,
  error TEXT,
  duration_ms INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, idx)
);
CREATE INDEX agent_steps_run_idx ON public.agent_steps(run_id, idx);
GRANT SELECT, INSERT ON public.agent_steps TO authenticated;
GRANT ALL ON public.agent_steps TO service_role;
ALTER TABLE public.agent_steps ENABLE ROW LEVEL SECURITY;

-- La visibilidad hereda la de la ejecución (el subselect ya pasa por RLS de agent_runs).
CREATE POLICY "agent_steps_select" ON public.agent_steps FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.agent_runs r WHERE r.id = agent_steps.run_id));
CREATE POLICY "agent_steps_insert_own" ON public.agent_steps FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.agent_runs r WHERE r.id = agent_steps.run_id AND r.user_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 4. agent_memory: memoria de largo plazo, estrictamente personal
-- ---------------------------------------------------------------------
CREATE TABLE public.agent_memory (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  memory JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_memory TO authenticated;
GRANT ALL ON public.agent_memory TO service_role;
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

-- Solo el propio usuario (ni siquiera RR. HH.): es contexto personal del Coach.
CREATE POLICY "agent_memory_own" ON public.agent_memory FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid() AND public.is_org_member(auth.uid(), org_id));

-- ---------------------------------------------------------------------
-- 5. Retención: purga de trazas antiguas (llamar desde un cron con service_role)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_old_agent_traces(_days INT DEFAULT 90)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted INT;
BEGIN
  DELETE FROM public.agent_runs WHERE started_at < now() - make_interval(days => _days);
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_old_agent_traces(INT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_agent_traces(INT) TO service_role;
