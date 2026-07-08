import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Settings, type LucideIcon } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  action,
  showSettings,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  showSettings?: boolean;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {action}
        {showSettings && (
          <Link
            to="/settings"
            aria-label="Settings"
            className="rounded-full p-2.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink md:hidden"
          >
            <Settings size={20} />
          </Link>
        )}
      </div>
    </header>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-surface p-4 ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
  className?: string;
}) {
  const styles = {
    primary:
      "bg-accent text-white font-semibold shadow-sm hover:opacity-90 dark:text-bg",
    ghost: "text-muted hover:bg-surface-2 hover:text-ink",
    danger:
      "border border-red-400/40 text-red-500 hover:bg-red-500/10 dark:text-red-400",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-sm transition-all active:scale-[0.98] ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-accent-soft text-accent ring-1 ring-accent/50"
          : "bg-surface-2 text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function ComingSoon({
  icon: Icon,
  title,
  phase,
  blurb,
}: {
  icon: LucideIcon;
  title: string;
  phase: string;
  blurb: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-16 text-center">
      <div className="mb-4 rounded-2xl bg-accent-soft p-4 text-accent">
        <Icon size={32} strokeWidth={1.75} />
      </div>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{blurb}</p>
      <span className="mt-5 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
        Arriving in {phase}
      </span>
    </div>
  );
}
