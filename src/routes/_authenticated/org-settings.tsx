import { createFileRoute } from "@tanstack/react-router";
import { OrgSettingsView } from "@/presentation/views/OrgSettingsView";

export const Route = createFileRoute("/_authenticated/org-settings")({
  head: () => ({
    meta: [
      { title: "Organización | PosturIA" },
      {
        name: "description",
        content: "Gestiona departamentos, invitaciones y miembros de tu organización.",
      },
      { property: "og:title", content: "Organización | PosturIA" },
      {
        property: "og:description",
        content: "Panel de administración del tenant: departamentos, invitaciones y miembros.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrgSettingsView,
});
