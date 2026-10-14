import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/infrastructure/supabase/client";
import { lovable } from "@/infrastructure/lovable";
import { LocaleSwitch } from "@/presentation/components/LocaleSwitch";
import { useI18n } from "@/presentation/i18n/i18n";
import { useAuth } from "@/presentation/hooks/useAuth";

export function AuthView() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/monitor" });
  }, [loading, user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/monitor" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/monitor`,
            data: { full_name: fullName, department },
          },
        });
        if (error) throw error;
        toast.success(t("auth.checkEmail"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message ?? "Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/monitor" });
  };

  const field =
    "w-full rounded-lg border border-input bg-secondary px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring";

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/" className="font-display text-xl font-bold">
            Postura<span className="text-primary">IA</span>
          </Link>
          <LocaleSwitch />
        </div>
        <div className="panel p-6">
          <h1 className="text-2xl font-bold">{t("auth.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("app.tagline")}</p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            {mode === "signup" && (
              <>
                <input
                  className={field}
                  placeholder={t("auth.name")}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
                <input
                  className={field}
                  placeholder={t("auth.department")}
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
              </>
            )}
            <input
              className={field}
              type="email"
              placeholder={t("auth.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className={field}
              type="password"
              placeholder={t("auth.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {mode === "signin" ? t("auth.signin") : t("auth.signup")}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs uppercase text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("auth.or")}
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={google}
            className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-muted"
          >
            {t("auth.google")}
          </button>

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            {mode === "signin" ? t("auth.toSignup") : t("auth.toSignin")}
          </button>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">{t("landing.privacy")}</p>
      </div>
    </div>
  );
}
