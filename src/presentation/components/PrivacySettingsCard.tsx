import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/presentation/i18n/i18n";
import {
  getOrgPrivacyMode,
  setOrgPrivacyMode,
  type PrivacyMode,
} from "@/infrastructure/supabase/repositories/privacy.repository";
import { Card, CardHeader } from "./kit";

/** Selector del modo de privacidad de RR. HH. (solo el propietario puede cambiarlo; lo aplica RLS). */
export function PrivacySettingsCard({ orgId, isOwner }: { orgId: string; isOwner: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: mode = "individual" } = useQuery({
    queryKey: ["org-privacy", orgId],
    queryFn: () => getOrgPrivacyMode(orgId),
  });

  const change = async (next: PrivacyMode) => {
    if (!isOwner || next === mode) return;
    try {
      await setOrgPrivacyMode(orgId, next);
      await qc.invalidateQueries({ queryKey: ["org-privacy", orgId] });
      toast.success(t("org.privacy.saved"));
    } catch (e) {
      console.error(e);
      toast.error(t("org.privacy.error"));
    }
  };

  const options: Array<{ value: PrivacyMode; label: string; desc: string }> = [
    {
      value: "individual",
      label: t("org.privacy.individual"),
      desc: t("org.privacy.individualDesc"),
    },
    { value: "aggregate", label: t("org.privacy.aggregate"), desc: t("org.privacy.aggregateDesc") },
  ];

  return (
    <Card>
      <CardHeader title={t("org.privacy.title")} subtitle={t("org.privacy.sub")} />
      <div
        className="mt-4 grid gap-3 md:grid-cols-2"
        role="radiogroup"
        aria-label={t("org.privacy.title")}
      >
        {options.map((o) => {
          const active = mode === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!isOwner}
              onClick={() => change(o.value)}
              className={`rounded-2xl border p-4 text-left transition-colors disabled:cursor-not-allowed ${
                active ? "border-primary bg-primary/10" : "border-border hover:bg-secondary"
              }`}
            >
              <p className="flex items-center gap-2 text-sm font-bold">
                <Lock className="size-4 text-primary" /> {o.label}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{o.desc}</p>
            </button>
          );
        })}
      </div>
      {!isOwner && (
        <p className="mt-3 text-xs text-muted-foreground">{t("org.privacy.onlyOwner")}</p>
      )}
    </Card>
  );
}
