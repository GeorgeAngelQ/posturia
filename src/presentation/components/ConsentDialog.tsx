import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/presentation/components/ui/alert-dialog";
import { useI18n } from "@/presentation/i18n/i18n";
import type { PrivacyMode } from "@/infrastructure/supabase/repositories/privacy.repository";

/**
 * Aviso de monitoreo que la persona debe aceptar antes de activar la cámara
 * (una vez por versión del texto). Explica qué se mide, qué se guarda, quién lo
 * ve y que la IA no da consejo médico.
 */
export function ConsentDialog({
  open,
  privacyMode,
  saving,
  onAccept,
  onCancel,
}: {
  open: boolean;
  privacyMode: PrivacyMode;
  saving: boolean;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [checked, setChecked] = useState(false);
  const points = [
    t("consent.p1"),
    t("consent.p2"),
    privacyMode === "aggregate" ? t("consent.p3.aggregate") : t("consent.p3.individual"),
    t("consent.p4"),
    t("consent.p5"),
  ];

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && !saving && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" /> {t("consent.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("consent.intro")}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <label className="flex items-start gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 size-4 accent-[var(--primary)]"
          />
          {t("consent.check")}
        </label>
        <AlertDialogFooter>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-secondary disabled:opacity-50"
          >
            {t("consent.cancel")}
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={!checked || saving}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("consent.accept")}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
