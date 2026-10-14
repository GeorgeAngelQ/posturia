import { createFileRoute } from "@tanstack/react-router";
import { AuthView } from "@/presentation/views/AuthView";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acceso de colaboradores | PosturaIA" },
      {
        name: "description",
        content:
          "Inicia sesión o crea tu cuenta de colaborador para monitorear tu postura con PosturaIA.",
      },
      { property: "og:title", content: "Acceso de colaboradores | PosturaIA" },
      {
        property: "og:description",
        content: "Accede a tu monitoreo postural y a tus informes ergonómicos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthView,
});
