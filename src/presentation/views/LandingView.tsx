import { Link } from "@tanstack/react-router";
import { Activity, Bot, ShieldCheck, Users, Zap } from "lucide-react";
import { LocaleSwitch } from "@/presentation/components/LocaleSwitch";
import { useI18n } from "@/presentation/i18n/i18n";

export function LandingView() {
  const { t } = useI18n();

  const features = [
    { icon: Activity, title: t("landing.f1.title"), desc: t("landing.f1.desc") },
    { icon: Bot, title: t("landing.f2.title"), desc: t("landing.f2.desc") },
    { icon: Zap, title: t("landing.f3.title"), desc: t("landing.f3.desc") },
    { icon: Users, title: t("landing.f4.title"), desc: t("landing.f4.desc") },
  ];

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="font-display text-xl font-bold">
          Postura<span className="text-primary">IA</span>
        </span>
        <div className="flex items-center gap-3">
          <LocaleSwitch />
          <Link
            to="/auth"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t("landing.cta")}
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 md:pt-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
          <ShieldCheck className="size-3.5 text-primary" />
          {t("landing.badge")}
        </span>
        <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-tight md:text-6xl">
          {t("landing.hero")}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          {t("landing.sub")}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to="/auth"
            className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t("landing.cta")}
          </Link>
          <a
            href="#how"
            className="rounded-lg border border-border bg-secondary px-6 py-3 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-muted"
          >
            {t("landing.cta2")}
          </a>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">{t("landing.privacy")}</p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 md:grid-cols-2">
        {features.map((f) => (
          <article key={f.title} className="panel p-6">
            <f.icon className="size-6 text-primary" />
            <h2 className="mt-4 text-lg font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
          </article>
        ))}
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 pb-24">
        <h2 className="text-2xl font-bold">{t("landing.steps")}</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {[t("landing.step1"), t("landing.step2"), t("landing.step3")].map((s, i) => (
            <li key={s} className="panel p-6">
              <span className="font-display text-3xl font-bold text-primary">{i + 1}</span>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{s}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        PosturaIA · {t("app.tagline")}
      </footer>
    </div>
  );
}
