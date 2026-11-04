-- Nuevos modos de ejecución del runtime agéntico:
--   lean     = modo económico (2 llamadas al modelo por sesión)
--   template = resumen determinista sin IA (cuota agotada o modelo no disponible)
ALTER TABLE public.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_mode_check;
ALTER TABLE public.agent_runs
  ADD CONSTRAINT agent_runs_mode_check
  CHECK (mode IN ('agentic', 'lean', 'pipeline', 'pipeline-fallback', 'template'));
