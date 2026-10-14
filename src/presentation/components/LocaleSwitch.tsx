import { useI18n, type Locale } from "@/presentation/i18n/i18n";

export function LocaleSwitch() {
  const { locale, setLocale } = useI18n();
  const options: Locale[] = ["es", "en"];

  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-border bg-secondary p-1"
      role="group"
    >
      {options.map((o) => (
        <button
          key={o}
          onClick={() => setLocale(o)}
          className={`rounded-md px-2 py-1 text-xs font-semibold uppercase transition-colors ${
            locale === o
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
