
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SPECIES_MAP } from "@/lib/ecovision/species";
import type { CameraState, Severity, SpeciesId } from "@/lib/ecovision/types";
import { SEVERITY_CLASS, STATE_META } from "@/lib/ecovision/format";

export function Panel({
  title,
  action,
  children,
  className,
  bodyClass,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={cn("panel flex flex-col overflow-hidden", className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide">{title}</h2>
          {action}
        </header>
      )}
      <div className={cn("flex-1 p-4", bodyClass)}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
        {label}
        {icon}
      </div>
      <div className="mt-2 font-display text-3xl">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function SeverityBadge({ s }: { s: Severity }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 font-mono text-[10px] uppercase",
        SEVERITY_CLASS[s] ?? "bg-secondary text-muted-foreground"
      )}
    >
      {s ?? "unknown"}
    </span>
  );
}

export function StateBadge({
  s,
  className,
}: {
  s: CameraState;
  className?: string;
}) {
  const m = STATE_META[s] ?? {
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
    label: String(s ?? "unknown"),
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider",
        m.text,
        className
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

export function SpeciesIcon({
  id,
  className,
}: {
  id: SpeciesId;
  className?: string;
}) {
  const species = SPECIES_MAP[id];

  return (
    <span
      className={cn("leading-none", className)}
      role="img"
      aria-label={species?.name ?? String(id)}
    >
      {species?.icon ?? "•"}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export const selectCls =
  "h-9 rounded-md border border-input bg-secondary px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export const btnCls =
  "inline-flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm transition-colors hover:bg-accent disabled:opacity-50";

export const btnPrimary =
  "inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110";
