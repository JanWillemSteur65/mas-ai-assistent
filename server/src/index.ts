import express from "express";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";

// NOTE: The server package runs as native Node.js ESM ("type": "module").
// Node's ESM loader requires explicit file extensions for *relative* imports.
// TypeScript preserves import specifiers, so we must use ".js" here even though
// the source files are ".ts".
import { getConfig, updateConfig } from "./config.js";
import { listModels, getSelectedProvider, chatCompletionWith, resolveProviderAuth } from "./providers.js";
import { handleChat } from "./chat.js";
import { addTrace, clearTraces, getTraceState, listTraces, setTraceState } from "./traceStore.js";
import { callMaximo, callMaximoWith } from "./maximo.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Basic request tracing for API calls (captures request body + JSON responses)
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) return next();

  const started = Date.now();
  const chunks: Buffer[] = [];
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  (res as any).json = (body: any) => {
    try {
      addTrace({
        kind: "rest",
        label: "API",
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - started,
        request: req.body ?? null,
        response: body,
      });
    } catch {
      // ignore
    }
    return originalJson(body);
  };

  (res as any).send = (body: any) => {
    try {
      addTrace({
        kind: "rest",
        label: "API",
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - started,
        request: req.body ?? null,
        response: body,
      });
    } catch {
      // ignore
    }
    return originalSend(body);
  };

  res.on("close", () => {
    // non-json responses already handled above
  });

  next();
});

// Config
app.get("/api/config", (_req, res) => {
  res.json(getConfig());
});

// Backwards compatible settings endpoints (UI uses /api/settings)
app.get("/api/settings", (_req, res) => {
  // UI expects the config shape directly: {secrets, avatars, ui}
  res.json(getConfig());
});

app.put("/api/config", (req, res) => {
  res.json(updateConfig(req.body || {}));
});

app.post("/api/settings", (req, res) => {
  // UI sends { settings: {...} }
  const next = req.body?.settings || req.body || {};
  const updated = updateConfig(next);
  res.json({ ok: true, settings: updated });
});

// Provider / model metadata
app.get("/api/providers/selected", (_req, res) => {
  res.json({ provider: getSelectedProvider() });
});

app.get("/api/models", async (req, res) => {
  const provider = (req.query.provider as string | undefined) as any;
  const models = await listModels(provider);
  // UI expects a simple string list.
  res.json({ models: (models || []).map((m: any) => (typeof m === "string" ? m : String(m?.id || m))) });
});

// POST variant: allows the UI to supply provider-specific keys without persisting them server-side first.
// This is particularly useful when secrets are sourced from Kubernetes and the pod has not been restarted.
app.post("/api/models", async (req, res) => {
  try {
    const body = req.body || {};
    const provider = String(body.provider || "").toLowerCase() as any;
    const settings = (body.settings && typeof body.settings === "object") ? body.settings : {};

    // Temporarily merge request settings into config secrets for this call.
    const cfg = getConfig();
    const mergedSecrets = { ...(cfg.secrets || {}), ...(settings || {}) };

    // listModels() reads from getConfig(), so call the provider implementation directly
    // by temporarily resolving auth and fetching models here.
    // We re-use listModels() by monkey-patching getConfig is undesirable; instead, call listModels
    // with a provider override and rely on resolveProviderAuth() within providers.ts by passing
    // merged secrets through a minimal local shim.
    const { listModelsWithSecrets } = await import("./providers.js");
    const models = await listModelsWithSecrets(mergedSecrets, provider);

    res.json({ models: (models || []).map((m: any) => (typeof m === "string" ? m : String(m?.id || m))) });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// Chat
app.post("/api/chat", async (req, res) => {
  try {
    const body = req.body || {};
    const mode = String(body.mode || body.src || "ai").toLowerCase() === "maximo" ? "maximo" : "ai";
    const text = String(body.text || body.prompt || "");
    const system = typeof body.system === "string" ? body.system : undefined;
    const temperature = Number(body.temperature ?? 0.2);
    const provider = String(body.provider || getSelectedProvider()).toLowerCase();
    const model = String(body.model || "").trim();
    const settings = (body.settings && typeof body.settings === "object") ? body.settings : {};

    // Merge request-provided settings with server bootstrap (server wins for fields not provided)
    const cfg = getConfig();
    const mergedSecrets = { ...(cfg.secrets || {}), ...(settings || {}) };

    if (mode === "maximo") {
      const uiOS = String(body.maximoOS || body.maximoOs || body.os || "").trim();
      const q = text.trim();

      // If the user supplies an explicit REST path, use it verbatim.
      if (q.startsWith("/")) {
        const data = await callMaximoWith(mergedSecrets, q, "GET");
        res.json({ reply: JSON.stringify(data, null, 2), maximo: data });
        return;
      }

      // Heuristic routing for predefined prompts. This keeps responses smaller
      // (reducing route timeouts) and avoids needing OSLC endpoints.
      const lower = q.toLowerCase();
      let os = uiOS;
      let where = "";
      let select = "";
      let pageSize = 50;

      const isWO = lower.includes("work order") || lower.includes("workorder") || lower.includes("wo");
      const isSR = lower.includes("service request") || lower.includes("servicerequest") || lower.includes("sr");

      if (!os) {
        if (lower.includes("location")) os = "mxapilocation";
        else if (lower.includes("asset")) os = "mxapiasset";
        else if (isSR) os = "mxapisr";
        else if (lower.includes("inventory")) os = "mxapiinv";
        else os = "mxapiwo"; // safe default
      }

      // Default selects aligned with the table UI expectations (and keeps responses small).
      const defaultSelectByOS: Record<string, string> = {
        mxapiasset: "assetnum,description,location,parent,assethealth,siteid,assettype",
        mxapiwo: "wonum,description,status,worktype,siteid,orgid,location,assetnum,reportdate",
        mxapisr: "ticketid,description,status,reportedby,reportdate,siteid,orgid,location,assetnum",
        mxapiinv: "itemnum,description,location,siteid,curbal,issueunit",
        mxapilocation: "location,description,parent,siteid,type",
      };

      if (lower.includes("corrective") && isWO) {
        where = 'woclass="WORKORDER" and worktype="CORRECTIVE"';
        select = "wonum,description,status,worktype,siteid,orgid,location,assetnum,reportdate";
        pageSize = 100;
      } else if (lower.includes("open") && isWO) {
        // 'open' differs per client config; this broad filter avoids terminal statuses.
        where = 'woclass="WORKORDER" and status not in ["CLOSE","CAN","CANCEL","COMP"]';
        select = "wonum,description,status,worktype,siteid,orgid,location,assetnum,reportdate";
        pageSize = 100;
      } else if (isSR && lower.includes("all")) {
        select = "ticketid,description,status,reportedby,reportdate,siteid,orgid,location,assetnum";
        pageSize = 100;
      }

      // If the user asked to summarize the last results, retrieve the last Maximo trace response and send it to the selected AI provider.
      if (lower.includes("summarize the last maximo results") || (lower.includes("summarize") && lower.includes("last") && lower.includes("maximo"))) {
        const last = listTraces("maximo", 1)[0];
        const lastResponse = last?.response;
        if (!lastResponse) {
          res.status(400).json({ error: "No previous Maximo results found to summarize (Trace is empty)." });
          return;
        }

        const pid = (provider as any);
        const auth = resolveProviderAuth(mergedSecrets, pid);

        // Keep payload bounded to avoid provider request limits.
        let payload = "";
        try {
          payload = JSON.stringify(lastResponse);
        } catch {
          payload = String(lastResponse);
        }
        if (payload.length > 120_000) payload = payload.slice(0, 120_000) + "\n...TRUNCATED";

        const out = await chatCompletionWith({
          provider: pid,
          apiKey: auth.apiKey,
          baseUrl: auth.baseUrl,
          model: model || mergedSecrets.aiModel || "gpt-4o-mini",
          temperature: Number.isFinite(temperature) ? temperature : 0.2,
          system:
            system ||
            "You are an assistant helping summarize IBM Maximo REST query results. Provide a clear, business-readable summary with key counts, notable statuses, and anomalies.",
          prompt:
            "Summarize the following Maximo results (JSON). Include: total items, important fields, patterns, outliers, and a short recommended next step.\n\n" + payload,
        });

        res.json({
          reply: out.content,
          maximo: lastResponse,
          request: { summaryOf: "last-maximo", os: (last?.request as any)?.os || undefined },
        });
        return;
      }

      // Apply default select if none is set by a more specific rule.
      if (!select) {
        const def = defaultSelectByOS[String(os).toLowerCase()];
        if (def) select = def;
      }

      const params = new URLSearchParams();
      params.set("oslc.pageSize", String(pageSize));
      if (select) params.set("oslc.select", select);
      if (where) params.set("oslc.where", where);

      const path = `/api/os/${encodeURIComponent(os)}${params.toString() ? `?${params.toString()}` : ""}`;
      const data = await callMaximoWith(mergedSecrets, path, "GET");
      res.json({ reply: JSON.stringify(data, null, 2), maximo: data, request: { os, where, select, pageSize } });
      return;
    }

    // AI mode
    const pid = (provider as any);
    const auth = resolveProviderAuth(mergedSecrets, pid);
    const out = await chatCompletionWith({
      provider: pid,
      apiKey: auth.apiKey,
      baseUrl: auth.baseUrl,
      model: model || mergedSecrets.aiModel || "gpt-4o-mini",
      temperature: Number.isFinite(temperature) ? temperature : 0.2,
      system,
      prompt: text,
    });

    res.json({ reply: out.content, raw: out.raw });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// Maximo REST builder passthrough
app.post("/api/maximo", async (req, res) => {
  try {
    const { path: maxPath, method, body } = req.body || {};
    const data = await callMaximo(String(maxPath || "/"), String(method || "GET"), body);
    res.json({ data });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

app.post("/api/proxy", async (req, res) => {
  const cfg = getConfig();
  const payload = req.body || {};
  const kind = String(payload.kind || "rest");
  const method = String(payload.method || "GET").toUpperCase();
  const urlIn = String(payload.url || "");
  const headersIn = (payload.headers && typeof payload.headers === "object") ? payload.headers : {};
  const bodyIn = payload.body;

  try {
    let url = urlIn;
    const headers: Record<string, string> = {};
    Object.entries(headersIn).forEach(([k, v]) => {
      if (typeof v === "string") headers[k] = v;
    });

    if (kind === "maximo") {
      let base = cfg.secrets.maximoUrl;
      const apiKey = cfg.secrets.maximoApiKey;
      if (!base) throw new Error("Maximo Manage URL is not configured.");
      if (!apiKey) throw new Error("Maximo API key is not configured.");

      base = base.replace(/\/$/, "");
      base = base.replace(/\/(oslc|api)(\/.*)?$/i, "");

      if (url.startsWith("/")) url = base.replace(/\/$/, "") + url;
      if (!url.startsWith(base)) throw new Error("Maximo proxy URL must be relative or within the configured Maximo base URL.");
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      headers["maxauth"] = apiKey;
      headers["apikey"] = apiKey;
    } else if (kind === "ai") {
      const apiKey = cfg.secrets.aiApiKey;
      if (!apiKey) throw new Error("AI API key is not configured.");
      headers["Authorization"] = headers["Authorization"] || `Bearer ${apiKey}`;
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }

    const t0 = Date.now();
    const resp = await fetch(url, {
      method,
      headers,
      body: bodyIn != null && method !== "GET" && method !== "HEAD" ? (typeof bodyIn === "string" ? bodyIn : JSON.stringify(bodyIn)) : undefined,
    });
    const text = await resp.text();
    const durationMs = Date.now() - t0;

    let data: any = null;
    try { data = JSON.parse(text); } catch { data = text; }

    addTrace({
      kind: kind === "maximo" ? "maximo" : kind === "ai" ? "ai" : "rest",
      label: "Proxy call",
      method,
      url,
      status: resp.status,
      durationMs,
      request: { headers, body: bodyIn },
      response: data,
    });

    // Persist builder draft/last response for UI convenience
    // Keep both v1 and v2 field names for UI compatibility.
    setTraceState({
      restBuilderDraft: payload,
      restBuilderLastResponse: { status: resp.status, data },
      lastResponse: { status: resp.status, data },
    });

    res.status(resp.status).json({ status: resp.status, data });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// Traces
app.get("/api/trace/state", (_req, res) => res.json(getTraceState()));
app.put("/api/trace/state", (req, res) => res.json(setTraceState(req.body || {})));

// UI expects /api/trace to return {items,state}
app.get("/api/trace", (_req, res) => {
  res.json({ items: listTraces(), state: getTraceState() });
});

app.post("/api/trace/clear", (_req, res) => {
  clearTraces();
  res.json({ ok: true });
});

// UI expects POST /api/trace/clear
app.post("/api/trace/clear", (_req, res) => {
  clearTraces();
  res.json({ ok: true });
});

app.get("/api/traces", (req, res) => {
  const kind = (req.query.kind as any) || undefined;
  const limit = Number(req.query.limit || 200);
  res.json({ traces: listTraces(kind, limit) });
});

app.delete("/api/traces", (_req, res) => {
  clearTraces();
  res.json({ ok: true });
});

// Static UI
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server listening on ${port}`);
});