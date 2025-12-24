import { getConfig } from "./config.js";
import { addTrace } from "./traceStore.js";

export async function callMaximoWith(secrets: any, path: string, method: string, body?: any) {
  let base = (secrets.maximoUrl || secrets.maximo_url);
  const apiKey = (secrets.maximoApiKey || secrets.maximo_apikey);

  if (!base) throw new Error("Maximo Manage URL is not configured.");
  if (!apiKey) throw new Error("Maximo API key is not configured.");

  // Normalize common user inputs. Users may paste full OSLC or API base URLs.
  // We want the Manage root (..../maximo) and then append the provided path.
  base = base.replace(/\/$/, "");
  base = base.replace(/\/(oslc|api)(\/.*)?$/i, "");

  const url = base + (path.startsWith("/") ? path : `/${path}`);
  const t0 = Date.now();

  const resp = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      // Maximo Manage API key headers vary by endpoint/version; send both for compatibility.
      "maxauth": apiKey,
      "apikey": apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await resp.text();
  const durationMs = Date.now() - t0;

  let data: any = null;
  try { data = JSON.parse(text); } catch { /* ignore */ }

  addTrace({
    kind: "maximo",
    label: "Maximo call",
    method,
    url,
    status: resp.status,
    durationMs,
    request: body ?? null,
    response: data ?? text,
  });

  if (!resp.ok) {
    throw new Error(`Maximo error (${resp.status}): ${text}`);
  }
  return data ?? text;
}

export async function callMaximo(path: string, method: string, body?: any) {
  const cfg = getConfig();
  return callMaximoWith(cfg.secrets as any, path, method, body);
}