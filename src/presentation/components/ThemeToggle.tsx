import { Moon, Sun } from "lucide-react";
import { useI18n } from "@/presentation/i18n/i18n";
import { useTheme } from "@/presentation/theme/theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? t("theme.dark") : t("theme.light");

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
      title={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
      className={`inline-flex h-9 items-center gap-2 rounded-full border border-border bg-secondary px-3 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-muted ${className}`}
    >
      {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
