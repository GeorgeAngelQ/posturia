import { createFileRoute } from "@tanstack/react-router";
import { MonitorView } from "@/presentation/views/MonitorView";

export const Route = createFileRoute("/_authenticated/monitor")({
  head: () => ({
    meta: [
      { title: "Monitoreo postural en vivo | PosturaIA" },
      {
        name: "description",
        content:
          "Activa la cámara y recibe alertas en tiempo real cuando tu postura de trabajo se desvía.",
      },
      { property: "og:title", content: "Monitoreo postural en vivo | PosturaIA" },
      {
        property: "og:description",
        content: "Medición continua de los ángulos cervical y torácico con alertas automáticas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MonitorView,
});
