import { createFileRoute } from "@tanstack/react-router";
import { ReportsView } from "@/presentation/views/ReportsView";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Mis informes posturales | PosturaIA" },
      {
        name: "description",
        content:
          "Historial de tus sesiones de monitoreo con diagnóstico, recomendaciones e informes PDF.",
      },
      { property: "og:title", content: "Mis informes posturales | PosturaIA" },
      {
        property: "og:description",
        content: "Consulta tu evolución postural y descarga tus informes ergonómicos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsView,
});
