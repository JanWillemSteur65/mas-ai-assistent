import { getConfig } from "./config.js";
import { addTrace } from "./traceStore.js";

export type ProviderId = "openai" | "anthropic" | "gemini" | "mistral" | "watsonx" | "deepseek";

export type ModelInfo = { id: string; label?: string };

// Providers that (often) expose an OpenAI-compatible API surface (GET /models, /chat/completions).
// We treat any configured baseUrl + apiKey as OpenAI-compatible to keep the app resilient.
// Providers that expose an OpenAI-compatible API surface (GET /models, /chat/completions).
// watsonx and deepseek are typically configured behind OpenAI-compatible gateways.
const OPENAI_COMPATIBLE: ProviderId[] = ["openai", "mistral", "watsonx", "deepseek"];


function filterModelIds(provider: ProviderId, ids: string[]): string[] {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (provider !== "openai") return uniq;

  // Heuristic: prefer modern Chat/Reasoning model families and exclude legacy completion models.
  const preferred = uniq.filter((id) =>
    /^(gpt-|o\d|chatgpt)/i.test(id) &&
    !/(davinci|curie|babbage|ada|text-|code-|instruct|deprecated)/i.test(id)
  );

  // If OpenAI returns many legacy ids, keep the preferred set; otherwise return original.
  const out = preferred.length ? preferred : uniq;
  // Sort to bubble likely-latest families first.
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function resolveProviderAuth(secrets: any, provider: ProviderId): { apiKey?: string; baseUrl?: string } {
  // Provider-specific keys from Settings UI
  const map: Record<string, { key?: string; baseUrl?: string }> = {
    openai: { key: secrets.openai_key, baseUrl: secrets.openai_baseurl || secrets.openai_base },
    mistral: { key: secrets.mistral_key, baseUrl: secrets.mistral_baseurl || secrets.mistral_base },
    deepseek: { key: secrets.deepseek_key, baseUrl: secrets.deepseek_baseurl || secrets.deepseek_base },
    watsonx: { key: secrets.watsonx_key, baseUrl: secrets.watsonx_baseurl || secrets.watsonx_base },
    anthropic: { key: secrets.anthropic_key, baseUrl: secrets.anthropic_baseurl || secrets.anthropic_base },
    gemini: { key: secrets.gemini_key, baseUrl: secrets.gemini_baseurl || secrets.gemini_base },
  };

  const entry = map[provider] || {};
  const chosenKey = (entry.key ?? "").trim();
  const chosenBase = (entry.baseUrl ?? "").trim();

  // Only fall back to generic aiApiKey/aiBaseUrl if it is explicitly configured
  // for the same provider. This prevents accidental reuse of unrelated keys
  // (e.g., Maximo API keys).
  const genericProvider = String(secrets.aiProvider || "").toLowerCase();
  const allowGeneric = genericProvider === provider;

  const fallbackKey = allowGeneric ? (String(secrets.aiApiKey || "").trim() || undefined) : undefined;
  const fallbackBase = allowGeneric ? (String(secrets.aiBaseUrl || "").trim() || undefined) : undefined;

  return {
    apiKey: chosenKey || fallbackKey,
    baseUrl: chosenBase || fallbackBase,
  };
}

export function getSelectedProvider(): ProviderId {
  const cfg = getConfig();
  const p = (cfg.secrets.aiProvider || "openai").toLowerCase();
  if (p === "anthropic" || p === "gemini" || p === "mistral" || p === "watsonx" || p === "deepseek") return p as ProviderId;
  return "openai";
}

export async function listModels(providerOverride?: ProviderId): Promise<ModelInfo[]> {
  const cfg = getConfig();
  const provider = providerOverride || getSelectedProvider();

  return listModelsWithSecrets(cfg.secrets, provider);
}

// Same behavior as listModels(), but allows callers to provide a secrets object
// (e.g., request-scoped settings from the UI) without persisting it first.
export async function listModelsWithSecrets(secrets: any, provider: ProviderId): Promise<ModelInfo[]> {
  const { apiKey, baseUrl } = resolveProviderAuth(secrets, provider);

  // Conservative fallbacks: allow UI model selection even when model listing
  // is unavailable (e.g., blocked egress or provider does not support /models).
  const fallbackByProvider: Partial<Record<ProviderId, ModelInfo[]>> = {
    openai: [
      { id: "gpt-4o", label: "gpt-4o" },
      { id: "gpt-4o-mini", label: "gpt-4o-mini" },
      { id: "gpt-4.1", label: "gpt-4.1" },
      { id: "gpt-4.1-mini", label: "gpt-4.1-mini" },
    ],
    mistral: [
      { id: "mistral-large-latest", label: "mistral-large-latest" },
      { id: "mistral-small-latest", label: "mistral-small-latest" },
      { id: "codestral-latest", label: "codestral-latest" },
    ],
    deepseek: [
      { id: "deepseek-chat", label: "deepseek-chat" },
      { id: "deepseek-reasoner", label: "deepseek-reasoner" },
    ],
    watsonx: [
      { id: "ibm/granite-20b-multilingual", label: "ibm/granite-20b-multilingual" },
    ],
  };

  // Providers without a model-list API: return a curated list.
  if (provider === "anthropic") {
    return [
      { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet (latest)" },
      { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku (latest)" },
      { id: "claude-3-opus-latest", label: "Claude 3 Opus (latest)" },
    ];
  }

  if (provider === "gemini") {
    return [
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ];
  }

  if (!apiKey) return fallbackByProvider[provider] || [];

  // OpenAI-compatible providers: attempt GET /v1/models
  if (!OPENAI_COMPATIBLE.includes(provider)) return fallbackByProvider[provider] || [];

  const url = (baseUrl || "https://api.openai.com/v1").replace(/\/$/, "") + "/models";
  const t0 = Date.now();

  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${String(apiKey).trim()}`,
      },
    });

    const text = await resp.text();
    const durationMs = Date.now() - t0;

    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      // If the upstream returned HTML (common when auth fails), treat as empty list.
      addTrace({
        kind: "models",
        provider,
        ok: false,
        durationMs,
        request: { url, method: "GET" },
        response: { status: resp.status, body: text },
      });
      return fallbackByProvider[provider] || [];
    }

    addTrace({
      kind: "models",
      provider,
      ok: resp.ok,
      durationMs,
      request: { url, method: "GET" },
      response: { status: resp.status, body: data },
    });

    if (!resp.ok) return fallbackByProvider[provider] || [];
    const arr = Array.isArray(data?.data) ? data.data : [];
    const ids = arr.map((m: any) => String(m?.id || "")).filter(Boolean);
    const filteredIds = filterModelIds(provider, ids);
    const out = filteredIds.map((id) => ({ id, label: id }));
    return out.length ? out : (fallbackByProvider[provider] || []);
  } catch (err: any) {
    addTrace({
      kind: "models",
      provider,
      ok: false,
      durationMs: Date.now() - t0,
      request: { url, method: "GET" },
      response: { status: 0, body: String(err?.message || err) },
    });
    return fallbackByProvider[provider] || [];
  }
}

export async function chatCompletion(prompt: string, system?: string) {
  const cfg = getConfig();
  const provider = getSelectedProvider();
  const { apiKey, baseUrl } = resolveProviderAuth(cfg.secrets, provider);
  const model = cfg.secrets.aiModel || "gpt-4o-mini";
  return chatCompletionWith({ provider, apiKey, baseUrl, model, temperature: 0.2, system, prompt });
}

export async function chatCompletionWith(args: {
  provider: ProviderId;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  system?: string;
  prompt: string;
}) {
  const { provider, apiKey, baseUrl, model, temperature = 0.2, system, prompt } = args;
  if (!apiKey) throw new Error("AI API key is not configured.");

  // OpenAI-compatible providers
  if (OPENAI_COMPATIBLE.includes(provider)) {
    const url = (baseUrl || "https://api.openai.com/v1").replace(/\/$/, "") + "/chat/completions";
    const body = {
      model,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
      temperature,
    };

    const t0 = Date.now();
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${String(apiKey).trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await resp.text();
    const durationMs = Date.now() - t0;
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }

    addTrace({
      kind: "ai",
      label: "Chat completion",
      method: "POST",
      url,
      status: resp.status,
      durationMs,
      request: body,
      response: data ?? text,
    });

    if (!resp.ok) {
      const msg = data?.error?.message || text || `AI provider error (${resp.status})`;
      throw new Error(msg);
    }
    const content = data?.choices?.[0]?.message?.content ?? "";
    return { content, raw: data };
  }

  // Anthropic (Messages API)
  if (provider === "anthropic") {
    const url = (baseUrl || "https://api.anthropic.com").replace(/\/$/, "") + "/v1/messages";
    const body: any = {
      model,
      max_tokens: 1024,
      temperature,
      messages: [{ role: "user", content: prompt }],
    };
    if (system) body.system = system;

    const t0 = Date.now();
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    const durationMs = Date.now() - t0;
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    addTrace({
      kind: "ai",
      label: "Anthropic messages",
      method: "POST",
      url,
      status: resp.status,
      durationMs,
      request: body,
      response: data ?? text,
    });
    if (!resp.ok) {
      const msg = data?.error?.message || data?.message || text || `AI provider error (${resp.status})`;
      throw new Error(msg);
    }
    const content = Array.isArray(data?.content) ? data.content.map((p: any) => p?.text || "").join("") : "";
    return { content, raw: data };
  }

  // Gemini (Generative Language API)
  if (provider === "gemini") {
    const base = (baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
    const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body: any = {
      contents: [{ role: "user", parts: [{ text: system ? `${system}\n\n${prompt}` : prompt }] }],
      generationConfig: { temperature },
    };
    const t0 = Date.now();
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    const durationMs = Date.now() - t0;
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    addTrace({
      kind: "ai",
      label: "Gemini generateContent",
      method: "POST",
      url,
      status: resp.status,
      durationMs,
      request: body,
      response: data ?? text,
    });
    if (!resp.ok) {
      const msg = data?.error?.message || text || `AI provider error (${resp.status})`;
      throw new Error(msg);
    }
    const content = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("") ?? "";
    return { content, raw: data };
  }

  throw new Error(`Provider '${provider}' is not supported by this build.`);
}