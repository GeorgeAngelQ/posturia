import { createFileRoute } from "@tanstack/react-router";
import { HrView } from "@/presentation/views/HrView";

export const Route = createFileRoute("/_authenticated/hr")({
  head: () => ({
    meta: [
      { title: "Panel de RR. HH. | PosturaIA" },
      {
        name: "description",
        content:
          "Indicadores agregados de bienestar postural: puntaje promedio, alertas y áreas con mayor riesgo ergonómico.",
      },
      { property: "og:title", content: "Panel de RR. HH. | PosturaIA" },
      {
        property: "og:description",
        content: "Visibilidad objetiva del bienestar físico del equipo para el área de RR. HH.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HrView,
});
