import { createFileRoute } from "@tanstack/react-router";
import { LandingView } from "@/presentation/views/LandingView";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PosturaIA — Bienestar postural medible para tu equipo" },
      {
        name: "description",
        content:
          "Monitoreo postural en tiempo real con visión por computador y dos agentes de IA. Alertas, informes PDF y panel de indicadores para RR. HH.",
      },
      { property: "og:title", content: "PosturaIA — Bienestar postural medible para tu equipo" },
      {
        property: "og:description",
        content:
          "Visión por computador y agentes de IA para cuidar la postura de los colaboradores.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingView,
});
