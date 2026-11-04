import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Download, GitBranch } from "lucide-react";
import { useI18n } from "@/presentation/i18n/i18n";
import { useAuth } from "@/presentation/hooks/useAuth";
import { useOrganization } from "@/presentation/organization/organization-context";
import {
  listAgentRuns,
  listAgentSteps,
  type AgentRunRow,
  type AgentStepRow,
} from "@/infrastructure/supabase/repositories/agent-traces.repository";
import { Card, Chip, EmptyState, PageHeader, type Tone } from "@/presentation/components/kit";

const STATUS_TONE: Record<AgentRunRow["status"], Tone> = {
  ok: "success",
  fallback: "warning",
  error: "danger",
  running: "info",
};

const KIND_TONE: Record<AgentStepRow["kind"], Tone> = {
  llm: "info",
  tool: "primary",
  delegate: "success",
  validation: "warning",
  memory: "neutral",
  system: "neutral",
};

function pretty(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function downloadJson(run: AgentRunRow, steps: AgentStepRow[]) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ run, steps }, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `posturaia-traza-${run.id.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Auditoría de los agentes: cada ejecución con sus delegaciones, llamadas al
 * modelo (mensajes de entrada y salida), herramientas, validación y memoria.
 * Sirve como evidencia de que los agentes colaboran en una misma solicitud.
 */
export function TracesView() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { isHr } = useOrganization();
  const search = useSearch({ strict: false }) as { run?: string };
  const [openId, setOpenId] = useState<string | null>(search.run ?? null);
  const dateLocale = locale === "en" ? "en-US" : "es-PE";

  const runs = useQuery({ queryKey: ["agent-runs"], queryFn: () => listAgentRuns(50) });
  const steps = useQuery({
    queryKey: ["agent-steps", openId],
    enabled: Boolean(openId),
    queryFn: () => listAgentSteps(openId!),
  });

  const rows = runs.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("traces.title")}
        subtitle={t("traces.sub")}
        chips={
          isHr ? (
            <Chip tone="info" icon={GitBranch}>
              {t("traces.adminNote")}
            </Chip>
          ) : undefined
        }
      />

      <Card padded={false} className="overflow-hidden">
        {runs.isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : rows.length === 0 ? (
          <EmptyState>{t("traces.empty")}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 px-4 py-3" />
                  <th className="px-2 py-3">{t("traces.col.date")}</th>
                  <th className="px-4 py-3">{t("traces.col.who")}</th>
                  <th className="px-4 py-3">{t("traces.col.mode")}</th>
                  <th className="px-4 py-3">{t("traces.col.status")}</th>
                  <th className="px-4 py-3">{t("traces.col.duration")}</th>
                  <th className="px-4 py-3">{t("traces.col.calls")}</th>
                  <th className="px-4 py-3">{t("traces.col.validation")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const open = openId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className="cursor-pointer border-t border-border hover:bg-secondary/50"
                        onClick={() => setOpenId(open ? null : r.id)}
                      >
                        <td className="px-4 py-3 text-muted-foreground">
                          {open ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-3 font-semibold">
                          {new Date(r.started_at).toLocaleString(dateLocale, {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {r.user_id === user?.id
                            ? t("traces.you")
                            : `${t("traces.other")} ·${r.user_id.replace(/-/g, "").slice(0, 4).toUpperCase()}`}
                        </td>
                        <td className="px-4 py-3">
                          <Chip tone={r.mode === "agentic" ? "primary" : "neutral"}>
                            {t(`traces.mode.${r.mode}`)}
                          </Chip>
                        </td>
                        <td className="px-4 py-3">
                          <Chip tone={STATUS_TONE[r.status]} dot>
                            {t(`traces.status.${r.status}`)}
                          </Chip>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {r.duration_ms !== null ? `${(r.duration_ms / 1000).toFixed(1)} s` : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {r.llm_calls} {t("traces.llm")} · {r.tool_calls} {t("traces.tools")}
                        </td>
                        <td className="px-4 py-3">
                          {r.validation_passed === null ? (
                            <span className="text-muted-foreground">{t("traces.valid.na")}</span>
                          ) : (
                            <Chip tone={r.validation_passed ? "success" : "warning"}>
                              {r.validation_passed ? t("traces.valid.yes") : t("traces.valid.no")}
                            </Chip>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-secondary/30">
                          <td colSpan={8} className="px-4 py-4 md:px-6">
                            <RunDetail
                              run={r}
                              steps={steps.data ?? []}
                              loading={steps.isLoading}
                              t={t}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function RunDetail({
  run,
  steps,
  loading,
  t,
}: {
  run: AgentRunRow;
  steps: AgentStepRow[];
  loading: boolean;
  t: (k: string) => string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">
            {run.provider}
            {run.model ? ` · ${run.model}` : ""}
          </span>
          <span>
            ≈ {run.approx_tokens_in + run.approx_tokens_out} {t("traces.tokens")}
          </span>
          {run.escalated && <Chip tone="warning">{t("traces.escalated")}</Chip>}
        </div>
        <button
          type="button"
          onClick={() => downloadJson(run, steps)}
          disabled={steps.length === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary disabled:opacity-50"
        >
          <Download className="size-4" /> {t("traces.download")}
        </button>
      </div>
      {run.error && (
        <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger-soft-foreground">
          {t("traces.error")}: {run.error}
        </p>
      )}
      <h3 className="eyebrow">{t("traces.steps")}</h3>
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("traces.loading")}</p>
      ) : steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("traces.noSteps")}</p>
      ) : (
        <ol className="space-y-2">
          {steps.map((s) => (
            <li
              key={s.id}
              className="rounded-xl border border-border bg-card p-3"
              style={{ marginLeft: `${s.depth * 20}px` }}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-muted-foreground">#{s.idx}</span>
                <Chip tone={KIND_TONE[s.kind]}>{t(`traces.kind.${s.kind}`)}</Chip>
                <span className="font-bold">{s.agent}</span>
                {s.name && <span className="font-mono text-muted-foreground">{s.name}</span>}
                <span className="ml-auto text-muted-foreground">{s.duration_ms} ms</span>
                {!s.ok && <Chip tone="danger">{t("traces.error")}</Chip>}
              </div>
              {s.error && <p className="mt-2 text-xs text-danger-soft-foreground">{s.error}</p>}
              <StepPayload label={t("traces.input")} value={s.input} />
              <StepPayload label={t("traces.output")} value={s.output} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function StepPayload({ label, value }: { label: string; value: unknown }) {
  const text = pretty(value);
  if (!text) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-semibold text-primary">{label}</summary>
      <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-secondary/60 p-3 text-[11px] leading-relaxed">
        {text}
      </pre>
    </details>
  );
}
