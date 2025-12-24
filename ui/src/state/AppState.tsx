import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ProviderId = "openai" | "anthropic" | "gemini" | "watsonx" | "mistral" | "deepseek";

export type UIState = {
  provider: ProviderId;
  model: string;
  temperature: number;
  system: string;
  src: "ai" | "maximo";
  maximoOS: string;

  theme: "light" | "dark";
};

export type SecretsState = Record<string, string>;
export type AvatarsState = Record<string, string>;

export type BuilderState = {
  method: "GET" | "POST" | "PATCH";
  os: string;
  where: string;
  select: string;
  orderBy: string;
  pageSize: number;
  body: string;
  preview: string;
  response: string;
};

export type AppState = {
  ui: UIState;
  secrets: SecretsState;
  avatars: AvatarsState;
  models: string[];
  builder: BuilderState;
  setUi: (u: UIState) => void;
  setSecrets: (s: SecretsState) => void;
  setAvatars: (a: AvatarsState) => void;
  setModels: (m: string[]) => void;
  setBuilder: (b: BuilderState) => void;
  reloadServerSettings: () => Promise<void>;
  saveServerSettings: () => Promise<void>;
};

const UI_KEY = "agent.ui";
const SEC_KEY = "agent.secrets";
const AVA_KEY = "agent.avatars";

const defaultUI: UIState = {
  provider: "openai",
  model: "",
  temperature: 0.7,
  system: "",
  src: "ai",
  maximoOS: "",
  theme: "light"
};

const defaultBuilder: BuilderState = {
  method: "GET",
  os: "",
  where: "",
  select: "",
  orderBy: "",
  pageSize: 1000,
  body: "",
  preview: "—",
  response: "—"
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ui, setUi] = useState<UIState>(() => {
    try { return { ...defaultUI, ...(JSON.parse(localStorage.getItem(UI_KEY) || "{}") as Partial<UIState>) }; } catch { return defaultUI; }
  });
  const [secrets, setSecrets] = useState<SecretsState>(() => {
    // Do not persist secrets in browser storage. Secrets should be served from /api/settings.
    return {};
  });
  const [avatars, setAvatars] = useState<AvatarsState>(() => {
    try { return JSON.parse(localStorage.getItem(AVA_KEY) || "{}") || {}; } catch { return {}; }
  });
  const [models, setModels] = useState<string[]>([]);
  const [builder, setBuilder] = useState<BuilderState>(defaultBuilder);

  useEffect(() => { localStorage.setItem(UI_KEY, JSON.stringify(ui)); }, [ui]);
  // Intentionally do not persist secrets to localStorage.
  useEffect(() => { localStorage.setItem(AVA_KEY, JSON.stringify(avatars)); }, [avatars]);

  // Apply Carbon theme tokens
  useEffect(() => {
    const carbonTheme = ui.theme === "dark" ? "g100" : "g10";
    document.documentElement.setAttribute("data-carbon-theme", carbonTheme);
  }, [ui.theme]);

  async function reloadServerSettings() {
    const r = await fetch("/api/settings");
    if (!r.ok) return;
    const j = await r.json();
    if (j?.secrets) setSecrets((prev) => ({ ...prev, ...j.secrets }));
    if (j?.avatars) setAvatars((prev) => ({ ...prev, ...j.avatars }));
    if (j?.ui) setUi((prev) => ({ ...prev, ...j.ui }));
  }

  async function saveServerSettings() {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secrets, avatars, ui })
    });
  }

  const value = useMemo<AppState>(() => ({
    ui, secrets, avatars, models, builder,
    setUi, setSecrets, setAvatars, setModels, setBuilder,
    reloadServerSettings, saveServerSettings
  }), [ui, secrets, avatars, models, builder]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("AppState missing");
  return v;
}
