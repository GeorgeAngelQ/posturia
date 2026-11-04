import { createFileRoute } from "@tanstack/react-router";
import { TracesView } from "@/presentation/views/TracesView";

export const Route = createFileRoute("/_authenticated/traces")({
  validateSearch: (search: Record<string, unknown>): { run?: string | undefined } => ({
    run: typeof search["run"] === "string" ? search["run"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Trazas de agentes | PosturaIA" },
      {
        name: "description",
        content:
          "Registro auditable de las ejecuciones de los agentes de IA: delegaciones, herramientas, mensajes y validación.",
      },
    ],
  }),
  component: TracesView,
});
