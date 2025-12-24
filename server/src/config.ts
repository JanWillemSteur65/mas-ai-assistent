import fs from "node:fs";

export type Secrets = {
  // generic (backwards compatible)
  aiProvider?: string;
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiModel?: string;

  // provider-specific (used by Settings UI)
  openai_key?: string;
  // UI uses *_base; server historically used *_baseurl
  openai_base?: string;
  openai_baseurl?: string;

  anthropic_key?: string;
  anthropic_base?: string;
  anthropic_baseurl?: string;

  gemini_key?: string;
  gemini_base?: string;
  gemini_baseurl?: string;

  mistral_key?: string;
  mistral_base?: string;
  mistral_baseurl?: string;

  deepseek_key?: string;
  deepseek_base?: string;
  deepseek_baseurl?: string;

  // watsonx (optional)
  watsonx_key?: string;
  watsonx_base?: string;
  watsonx_baseurl?: string;

  // Maximo (camelCase + legacy snake_case)
  maximoUrl?: string;
  maximoApiKey?: string;
  maximo_url?: string;
  maximo_apikey?: string;
};

export type AppConfig = {
  secrets: Secrets;
  avatars: Record<string, string>;
  ui: {
    theme?: "light" | "dark";
    mode?: "ai" | "maximo";
  } & Record<string, any>;
};

const inMemory: Partial<AppConfig> = { secrets: {}, avatars: {}, ui: {} };

function inClusterNamespace(): string | null {
  try {
    // Kubernetes mounts namespace here by default
    const ns = fs.readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/namespace", "utf8").trim();
    return ns || null;
  } catch {
    return process.env.POD_NAMESPACE || null;
  }
}

function inClusterToken(): string | null {
  try {
    const t = fs.readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/token", "utf8").trim();
    return t || null;
  } catch {
    return null;
  }
}

async function persistConfigToK8sSecret(cfg: AppConfig) {
  // Best-effort persistence: patch Secret {APP_CONFIG_JSON: <string>}.
  // Defaults match the OpenShift manifests in /openshift/deployment.yaml.
  const enabled = (process.env.PERSIST_TO_K8S_SECRET || "true").toLowerCase() !== "false";
  if (!enabled) return;

  const name = process.env.K8S_SECRET_NAME || "agent-config";
  const key = process.env.K8S_SECRET_KEY || "APP_CONFIG_JSON";
  const ns = inClusterNamespace();
  const token = inClusterToken();
  if (!ns || !token) return; // not running in-cluster

  const api = process.env.KUBERNETES_SERVICE_HOST
    ? `https://${process.env.KUBERNETES_SERVICE_HOST}:${process.env.KUBERNETES_SERVICE_PORT || 443}`
    : "https://kubernetes.default.svc";

  const bodyStr = JSON.stringify(cfg, null, 2);
  const patch = {
    data: {
      [key]: Buffer.from(bodyStr, "utf8").toString("base64"),
    },
  };

  const url = `${api}/api/v1/namespaces/${encodeURIComponent(ns)}/secrets/${encodeURIComponent(name)}`;
  await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/merge-patch+json",
      Accept: "application/json",
    },
    body: JSON.stringify(patch),
  }).then(async (r) => {
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`Failed to patch Secret ${ns}/${name}: ${r.status} ${t}`);
    }
  });
}

function safeParse(jsonStr: string): Partial<AppConfig> {
  if (!jsonStr) return {};
  try {
    return JSON.parse(jsonStr);
  } catch {
    return {};
  }
}

function normalizeSecrets(s: Secrets): Secrets {
  const out: Secrets = { ...s };

  // Maximo: normalize legacy snake_case to camelCase
  if (out.maximoUrl == null && out.maximo_url) out.maximoUrl = out.maximo_url;
  if (out.maximoApiKey == null && out.maximo_apikey) out.maximoApiKey = out.maximo_apikey;

  // If UI only populates provider-specific keys, mirror into generic fields for existing code paths
  // (provider-aware code should still prefer provider-specific keys)
  if (!out.aiProvider && (out as any).provider) out.aiProvider = (out as any).provider;

  // Provider base URL aliases (UI uses *_base, legacy used *_baseurl)
  if (out.openai_baseurl == null && out.openai_base) out.openai_baseurl = out.openai_base;
  if (out.anthropic_baseurl == null && out.anthropic_base) out.anthropic_baseurl = out.anthropic_base;
  if (out.gemini_baseurl == null && out.gemini_base) out.gemini_baseurl = out.gemini_base;
  if (out.mistral_baseurl == null && out.mistral_base) out.mistral_baseurl = out.mistral_base;
  if (out.deepseek_baseurl == null && out.deepseek_base) out.deepseek_baseurl = out.deepseek_base;
  if (out.watsonx_baseurl == null && out.watsonx_base) out.watsonx_baseurl = out.watsonx_base;

  return out;
}

export function getConfig(): AppConfig {
  const bootstrap = safeParse(process.env.APP_CONFIG_JSON || "");
  const mergedSecrets = normalizeSecrets({
    ...(bootstrap.secrets || {}),
    ...(inMemory.secrets || {}),
  } as Secrets);

  return {
    secrets: mergedSecrets,
    avatars: { ...(bootstrap.avatars || {}), ...(inMemory.avatars || {}) },
    ui: { ...(bootstrap.ui || {}), ...(inMemory.ui || {}) },
  };
}

export function updateConfig(patch: Partial<AppConfig>) {
  if (patch.secrets) {
    inMemory.secrets = { ...(inMemory.secrets || {}), ...normalizeSecrets(patch.secrets as Secrets) };
  }
  if (patch.avatars) inMemory.avatars = { ...(inMemory.avatars || {}), ...patch.avatars };
  if (patch.ui) inMemory.ui = { ...(inMemory.ui || {}), ...patch.ui };

  const next = getConfig();
  // Best-effort persistence (do not block requests)
  persistConfigToK8sSecret(next).catch((e) => {
    // eslint-disable-next-line no-console
    console.warn(String(e?.message || e));
  });
  return next;
}
