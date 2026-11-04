import type { ComponentType, ReactNode } from "react";
import type { RiskLevel } from "@/domain/posture/posture";

export type Tone = "success" | "warning" | "danger" | "info" | "primary" | "neutral";

type IconType = ComponentType<{ className?: string }>;

const toneSoft: Record<Tone, string> = {
  success: "bg-success-soft text-success-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-danger-soft text-danger-soft-foreground",
  info: "bg-info-soft text-info-soft-foreground",
  primary: "bg-primary text-primary-foreground",
  neutral: "bg-muted text-muted-foreground",
};

/** Color sólido (barras, puntos, anillos). */
export const toneStrong: Record<Tone, string> = {
  success: "bg-success-strong",
  warning: "bg-warning-strong",
  danger: "bg-danger-strong",
  info: "bg-info-strong",
  primary: "bg-primary",
  neutral: "bg-muted-foreground",
};

/** Texto del color fuerte de cada tono. */
export const toneText: Record<Tone, string> = {
  success: "text-success-strong",
  warning: "text-warning-strong",
  danger: "text-danger-strong",
  info: "text-info-strong",
  primary: "text-primary",
  neutral: "text-muted-foreground",
};

/** Nivel de riesgo (score) → tono visual. */
export function riskTone(risk: RiskLevel): Tone {
  return risk === "low" ? "success" : risk === "mid" ? "warning" : "danger";
}

/** Chip/píldora de estado. `dot` agrega un punto de color a la izquierda. */
export function Chip({
  tone = "neutral",
  dot = false,
  icon: Icon,
  mono = false,
  upper = false,
  className = "",
  title,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  icon?: IconType;
  mono?: boolean;
  upper?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold leading-none ${
        toneSoft[tone]
      } ${mono ? "font-mono" : ""} ${upper ? "uppercase tracking-wide" : ""} ${className}`}
    >
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" />}
      {Icon && <Icon className="size-3.5 shrink-0" />}
      {children}
    </span>
  );
}

/** Tarjeta base (`panel`) con padding estándar. */
export function Card({
  className = "",
  padded = true,
  children,
}: {
  className?: string;
  padded?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`panel ${padded ? "p-5 md:p-6" : ""} ${className}`}>{children}</section>
  );
}

/** Encabezado de tarjeta: ícono en cuadro tintado + título + subtítulo + acción a la derecha. */
export function CardHeader({
  icon: Icon,
  iconTone = "info",
  title,
  subtitle,
  right,
  className = "",
}: {
  icon?: IconType;
  iconTone?: Tone;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneSoft[iconTone]}`}
          >
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/** Cabecera de página: eyebrow opcional, título grande, subtítulo y acciones a la derecha. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  chips,
  right,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  chips?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="text-3xl font-extrabold leading-[1.1] md:text-4xl">{title}</h1>
        {chips && <div className="mt-3 flex flex-wrap items-center gap-2">{chips}</div>}
        {subtitle && (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
            {subtitle}
          </p>
        )}
      </div>
      {right && <div className="flex flex-wrap items-center gap-3">{right}</div>}
    </header>
  );
}

/** Barra de progreso horizontal (0-100). */
export function ProgressBar({
  value,
  tone = "primary",
  className = "",
}: {
  value: number;
  tone?: Tone;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-muted ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full ${toneStrong[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Tabs segmentados (píldora). Controlado: el padre guarda el valor. */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode; icon?: IconType; badge?: ReactNode }>;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`inline-flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-secondary p-1 ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.icon && <o.icon className="size-4" />}
            {o.label}
            {o.badge !== undefined && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  active ? "bg-primary-foreground/20" : "bg-info-soft text-info-soft-foreground"
                }`}
              >
                {o.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Avatar circular con iniciales (determinístico por texto). `dot` = indicador en línea. */
export function Avatar({
  name,
  size = "md",
  dot = false,
  className = "",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  dot?: boolean;
  className?: string;
}) {
  const sizes = { sm: "size-8 text-[11px]", md: "size-10 text-xs", lg: "size-12 text-sm" };
  const tones: Tone[] = ["info", "success", "warning", "danger"];
  const tone = tones[hashString(name) % tones.length]!;
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-bold ${sizes[size]} ${toneSoft[tone]} ${className}`}
      aria-hidden
    >
      {initials(name)}
      {dot && (
        <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-success-strong" />
      )}
    </span>
  );
}

export function initials(name: string): string {
  const parts = name
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : (parts[0]![1] ?? "");
  return (first + second).toUpperCase();
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Anillo de progreso circular con contenido central (gauge de score). */
export function ScoreRing({
  value,
  tone = "success",
  size = 112,
  stroke = 9,
  children,
}: {
  value: number;
  tone?: Tone;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className={toneText[tone]}
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: "stroke-dashoffset 400ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/** Texto de estado vacío / sin acceso dentro de una tarjeta. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}
