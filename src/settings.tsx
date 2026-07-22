import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "system";
export type Accent = "lagoon" | "violet" | "coral" | "honey" | "sky" | "moss";

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: "lagoon", label: "Lagoon", swatch: "#0f9d8f" },
  { id: "violet", label: "Violet", swatch: "#7c5cd6" },
  { id: "coral", label: "Coral", swatch: "#e35d6a" },
  { id: "honey", label: "Honey", swatch: "#c07f10" },
  { id: "sky", label: "Sky", swatch: "#2f7fd6" },
  { id: "moss", label: "Moss", swatch: "#4d8f3f" },
];

export const CURRENCIES = ["£", "$", "€", "¥", "₹", "kr"];

export type Units = "metric" | "imperial";

interface Settings {
  name: string;
  theme: ThemeMode;
  accent: Accent;
  currency: string;
  units: Units;
  weeklyGoal: number; // active days per week target
  favTeams: string[]; // highlighted teams on the Sports page
  weeklyDigest: boolean; // Sunday-evening summary push
  homeOrder: string[]; // module keys in display order (missing keys append)
  homeHidden: string[]; // module keys hidden from the Home grid
}

const DEFAULTS: Settings = {
  name: "",
  theme: "system",
  accent: "lagoon",
  currency: "£",
  units: "metric",
  weeklyGoal: 3,
  favTeams: [],
  weeklyDigest: true,
  homeOrder: [],
  homeHidden: [],
};
const KEY = "lifetime-settings";

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return DEFAULTS;
  }
}

const Ctx = createContext<{
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}>({ settings: DEFAULTS, update: () => {} });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);

  const update = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });

  // Apply theme + accent to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.accent = settings.accent;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark =
        settings.theme === "dark" ||
        (settings.theme === "system" && media.matches);
      root.classList.toggle("dark", dark);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.theme, settings.accent]);

  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);
