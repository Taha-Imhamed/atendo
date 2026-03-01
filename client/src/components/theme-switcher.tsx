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
  "--color-primary-foreground",
  "--color-secondary",
  "--color-secondary-foreground",
  "--color-accent",
  "--color-accent-foreground",
  "--color-destructive",
  "--color-destructive-foreground",
  "--color-background",
  "--color-foreground",
  "--color-card",
  "--color-card-foreground",
  "--color-popover",
  "--color-popover-foreground",
  "--color-muted",
  "--color-muted-foreground",
  "--color-border",
  "--color-input",
  "--color-ring",
  "--color-chart-1",
  "--color-chart-2",
  "--color-chart-3",
  "--color-chart-4",
  "--color-chart-5",
  "--badge-outline",
  "--app-bg-gradient",
] as const;

type RGB = { r: number; g: number; b: number };

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeHex(hex: string) {
  const value = hex.trim().replace("#", "");
  if (value.length === 3) {
    return `#${value
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`;
  }
  if (value.length === 6) {
    return `#${value}`;
  }
  return "#000000";
}

function hexToRgb(hex: string): RGB {
  const normalized = normalizeHex(hex).replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: RGB) {
  return `#${clampChannel(r).toString(16).padStart(2, "0")}${clampChannel(g)
    .toString(16)
    .padStart(2, "0")}${clampChannel(b).toString(16).padStart(2, "0")}`;
}

function mixColor(a: string, b: string, weight = 0.5) {
  const aa = hexToRgb(a);
  const bb = hexToRgb(b);
  const w = Math.max(0, Math.min(1, weight));
  return rgbToHex({
    r: aa.r * (1 - w) + bb.r * w,
    g: aa.g * (1 - w) + bb.g * w,
    b: aa.b * (1 - w) + bb.b * w,
  });
}

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function readableText(background: string) {
  return relativeLuminance(background) > 0.45 ? "#0b1220" : "#f8fafc";
}

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
  const primary = normalizeHex(custom.primary);
  const secondary = normalizeHex(custom.secondary);
  const accent = normalizeHex(custom.accent);
  const background = normalizeHex(custom.background);
  const foreground = normalizeHex(custom.foreground);
  const darkTheme = relativeLuminance(background) < 0.35;

  const card = darkTheme
    ? mixColor(background, "#ffffff", 0.08)
    : mixColor(background, "#ffffff", 0.72);
  const popover = darkTheme
    ? mixColor(background, "#ffffff", 0.1)
    : mixColor(background, "#ffffff", 0.8);
  const muted = darkTheme
    ? mixColor(background, "#ffffff", 0.14)
    : mixColor(background, foreground, 0.08);
  const mutedForeground = mixColor(foreground, background, darkTheme ? 0.34 : 0.45);
  const border = darkTheme
    ? mixColor(background, "#ffffff", 0.22)
    : mixColor(background, foreground, 0.2);
  const input = border;

  root.style.setProperty("--color-primary", primary);
  root.style.setProperty("--color-primary-foreground", readableText(primary));
  root.style.setProperty("--color-secondary", secondary);
  root.style.setProperty("--color-secondary-foreground", readableText(secondary));
  root.style.setProperty("--color-accent", accent);
  root.style.setProperty("--color-accent-foreground", readableText(accent));
  root.style.setProperty("--color-destructive", "#ef4444");
  root.style.setProperty("--color-destructive-foreground", "#ffffff");
  root.style.setProperty("--color-background", background);
  root.style.setProperty("--color-foreground", foreground);
  root.style.setProperty("--color-card", card);
  root.style.setProperty("--color-card-foreground", foreground);
  root.style.setProperty("--color-popover", popover);
  root.style.setProperty("--color-popover-foreground", foreground);
  root.style.setProperty("--color-muted", muted);
  root.style.setProperty("--color-muted-foreground", mutedForeground);
  root.style.setProperty("--color-border", border);
  root.style.setProperty("--color-input", input);
  root.style.setProperty("--color-ring", primary);
  root.style.setProperty("--color-chart-1", primary);
  root.style.setProperty("--color-chart-2", accent);
  root.style.setProperty("--color-chart-3", secondary);
  root.style.setProperty("--color-chart-4", mixColor(primary, accent, 0.5));
  root.style.setProperty("--color-chart-5", mixColor(secondary, accent, 0.35));
  root.style.setProperty("--badge-outline", border);
  root.style.setProperty(
    "--app-bg-gradient",
    `radial-gradient(circle at top left, ${mixColor(background, primary, 0.12)} 0%, ${background} 45%, ${mixColor(background, accent, 0.1)} 100%)`,
  );
}

export default function ThemeSwitcher() {
  const [preset, setPreset] = useState<ThemePreset>("light");
  const [custom, setCustom] = useState<CustomTheme>(defaultCustom);

  useEffect(() => {
    const savedPreset = localStorage.getItem(PRESET_KEY) as ThemePreset | null;
    const savedCustomRaw = localStorage.getItem(CUSTOM_KEY);
    let savedCustom = defaultCustom;
    if (savedCustomRaw) {
      try {
        savedCustom = JSON.parse(savedCustomRaw) as CustomTheme;
      } catch {
        savedCustom = defaultCustom;
      }
    }

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
