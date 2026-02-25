import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";

type ThemePreset =
  | "light"
  | "midnight"
  | "slate"
  | "custom";

type CustomTheme = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
};

const PRESET_KEY = "attendo.theme.preset";
const CUSTOM_KEY = "attendo.theme.custom";

const defaultCustom: CustomTheme = {
  primary: "#0f766e",
  secondary: "#334155",
  accent: "#f59e0b",
  background: "#f8fafc",
  foreground: "#1e293b",
};

const customVarKeys = [
  "--color-primary",
  "--color-secondary",
  "--color-accent",
  "--color-background",
  "--color-foreground",
  "--color-card",
  "--color-popover",
  "--color-muted",
  "--color-muted-foreground",
  "--color-border",
  "--color-input",
  "--badge-outline",
  "--app-bg-gradient",
] as const;

function applyPreset(preset: ThemePreset) {
  const root = document.documentElement;
  for (const key of customVarKeys) {
    root.style.removeProperty(key);
  }
  if (preset === "light") {
    root.removeAttribute("data-theme");
    return;
  }
  if (preset === "custom") {
    root.removeAttribute("data-theme");
    return;
  }
  root.setAttribute("data-theme", preset);
}

function applyCustom(custom: CustomTheme) {
  const root = document.documentElement;
  root.style.setProperty("--color-primary", custom.primary);
  root.style.setProperty("--color-secondary", custom.secondary);
  root.style.setProperty("--color-accent", custom.accent);
  root.style.setProperty("--color-background", custom.background);
  root.style.setProperty("--color-foreground", custom.foreground);
  root.style.setProperty("--color-card", "#ffffff");
  root.style.setProperty("--color-popover", "#ffffff");
  root.style.setProperty("--color-muted", "#e2e8f0");
  root.style.setProperty("--color-muted-foreground", "#475569");
  root.style.setProperty("--color-border", "#cbd5e1");
  root.style.setProperty("--color-input", "#cbd5e1");
  root.style.setProperty("--badge-outline", "#cbd5e1");
  root.style.setProperty(
    "--app-bg-gradient",
    "radial-gradient(circle at top left, #ffffff 0%, #f8fafc 45%, #eef2f7 100%)",
  );
}

export default function ThemeSwitcher() {
  const [preset, setPreset] = useState<ThemePreset>("light");
  const [custom, setCustom] = useState<CustomTheme>(defaultCustom);

  useEffect(() => {
    const savedPreset = localStorage.getItem(PRESET_KEY) as ThemePreset | null;
    const savedCustomRaw = localStorage.getItem(CUSTOM_KEY);
    const savedCustom = savedCustomRaw
      ? (JSON.parse(savedCustomRaw) as CustomTheme)
      : defaultCustom;

    if (
      savedPreset &&
      ["light", "midnight", "slate", "custom"].includes(savedPreset)
    ) {
      setPreset(savedPreset);
      applyPreset(savedPreset);
      if (savedPreset === "custom") {
        setCustom(savedCustom);
        applyCustom(savedCustom);
      }
    } else {
      applyPreset("light");
    }
  }, []);

  const showCustom = useMemo(() => preset === "custom", [preset]);

  const handlePresetChange = (next: ThemePreset) => {
    setPreset(next);
    localStorage.setItem(PRESET_KEY, next);
    applyPreset(next);
    if (next === "custom") {
      applyCustom(custom);
    }
  };

  const handleCustomChange = (key: keyof CustomTheme, value: string) => {
    const next = { ...custom, [key]: value };
    setCustom(next);
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
    if (preset === "custom") {
      applyCustom(next);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="theme-select" className="text-xs text-muted-foreground">
        Theme
      </Label>
      <select
        id="theme-select"
        value={preset}
        onChange={(e) => handlePresetChange(e.target.value as ThemePreset)}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
      >
        <option value="light">Light</option>
        <option value="midnight">Midnight</option>
        <option value="slate">Slate</option>
        <option value="custom">Custom</option>
      </select>
      {showCustom && (
        <div className="flex items-center gap-1">
          <input
            type="color"
            aria-label="Primary color"
            value={custom.primary}
            onChange={(e) => handleCustomChange("primary", e.target.value)}
            className="h-8 w-8 cursor-pointer rounded border border-border p-0"
          />
          <input
            type="color"
            aria-label="Accent color"
            value={custom.accent}
            onChange={(e) => handleCustomChange("accent", e.target.value)}
            className="h-8 w-8 cursor-pointer rounded border border-border p-0"
          />
          <input
            type="color"
            aria-label="Background color"
            value={custom.background}
            onChange={(e) => handleCustomChange("background", e.target.value)}
            className="h-8 w-8 cursor-pointer rounded border border-border p-0"
          />
        </div>
      )}
    </div>
  );
}
