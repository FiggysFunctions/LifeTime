import { NavLink, Outlet } from "react-router-dom";
import {
  Home,
  ListChecks,
  CheckSquare,
  CalendarDays,
  PiggyBank,
  Dumbbell,
  Search,
  Settings,
} from "lucide-react";

const tabs = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/lists", label: "Lists", icon: ListChecks },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/budget", label: "Budget", icon: PiggyBank },
  { to: "/fitness", label: "Fitness", icon: Dumbbell },
];

function Tab({
  to,
  label,
  icon: Icon,
  end,
  sidebar,
}: (typeof tabs)[number] & { sidebar?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        sidebar
          ? `flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-accent-soft text-accent"
                : "text-muted hover:bg-surface-2 hover:text-ink"
            }`
          : `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
              isActive ? "text-accent" : "text-muted"
            }`
      }
    >
      <Icon size={sidebar ? 18 : 22} strokeWidth={2} />
      {label}
    </NavLink>
  );
}

export default function Shell() {
  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface p-4 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2 pt-2">
          <img src="/icons/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
          <span className="font-display text-lg font-semibold tracking-tight">
            Lifetime
          </span>
        </div>
        <nav className="flex flex-col gap-1">
          {tabs.map((t) => (
            <Tab key={t.to} {...t} sidebar />
          ))}
        </nav>
        <div className="mt-auto">
          <Tab to="/search" label="Search" icon={Search} sidebar />
          <Tab to="/settings" label="Settings" icon={Settings} sidebar />
        </div>
      </aside>

      {/* Content */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-4 md:ml-60 md:px-8 md:pb-12 md:pt-8">
        <Outlet />
      </main>

      {/* Bottom tab bar — mobile */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {tabs.map((t) => (
          <Tab key={t.to} {...t} />
        ))}
      </nav>
    </div>
  );
}
