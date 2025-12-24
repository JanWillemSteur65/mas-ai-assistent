import React, { useEffect, useMemo, useState } from "react";
import {
  Tabs,
  Tab,
  TextArea,
  TextInput,
  Button,
  InlineNotification,
  Tile,
  Dropdown,
  NumberInput,
} from "@carbon/react";
import TraceLogPanel, { TraceItem } from "../components/TraceLogPanel";
import ResultViewer from "../components/ResultViewer";

type TraceApiResponse = {
  items: TraceItem[];
  state: {
    restBuilderDraft?: unknown;
    lastResponse?: unknown;
  };
};

type SettingsResponse = {
  maximoUrl?: string;
};

function safeStringify(v: unknown) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function safeParseJson<T = any>(s: string): T | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function normalizeMaximoBase(url: string) {
  let u = (url || "").trim();
  if (!u) return u;
  u = u.replace(/\/$/, "");
  // If user pasted a deeper path, normalize back to .../maximo
  u = u.replace(/\/maximo\/(oslc|api)(\/.*)?$/i, "/maximo");
  if (!/\/maximo$/i.test(u)) u = u.replace(/\/$/, "") + "/maximo";
  return u;
}

function buildOslcUrl(maximoBase: string, os: string) {
  const base = normalizeMaximoBase(maximoBase).replace(/\/$/, "");
  const cleanOs = (os || "").trim();
  if (!base || !cleanOs) return "";
  return `${base}/oslc/os/${encodeURIComponent(cleanOs)}`;
}

const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

export default function TracePage() {
  const [items, setItems] = useState<TraceItem[]>([]);
  const [draft, setDraft] = useState<string>("{}");
  const [lastResponse, setLastResponse] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [open, setOpen] = useState<boolean>(true);

  const [settings, setSettings] = useState<SettingsResponse>({});

  // Logical builder fields (mirrors the reference HTML layout)
  const [method, setMethod] = useState<(typeof METHODS)[number]>("GET");
  const [url, setUrl] = useState<string>("");
  const [os, setOs] = useState<string>("");

  const [whereText, setWhereText] = useState<string>("");
  const [selectText, setSelectText] = useState<string>("");
  const [orderBy, setOrderBy] = useState<string>("");
  const [pageSize, setPageSize] = useState<number>(50);
  const [bodyText, setBodyText] = useState<string>("");

  const lastResponseObj = useMemo(() => safeParseJson(lastResponse), [lastResponse]);

  async function refresh() {
    setError("");
    const res = await fetch("/api/trace");
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as TraceApiResponse;
    setItems(data.items || []);
    if (data.state?.restBuilderDraft) setDraft(safeStringify(data.state.restBuilderDraft));
    if (data.state?.lastResponse) setLastResponse(safeStringify(data.state.lastResponse));
  }

  async function clear() {
    await fetch("/api/trace/clear", { method: "POST" });
    await refresh();
  }

  // Keep draft JSON in sync with logical builder fields
  useEffect(() => {
    // If URL not specified but OS is, build it from settings (like the reference HTML)
    const effectiveUrl = url || (os ? buildOslcUrl(settings.maximoUrl || "", os) : "");
    const headers: Record<string, string> = { "content-type": "application/json" };

    const params: Record<string, any> = {};
    const whereLines = whereText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (whereLines.length) params["oslc.where"] = whereLines.join(" and ");
    const selectKeys = selectText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (selectKeys.length) params["oslc.select"] = selectKeys.join(",");
    if (orderBy.trim()) params["oslc.orderBy"] = orderBy.trim();
    if (pageSize && Number.isFinite(pageSize)) params["oslc.pageSize"] = pageSize;

    let fullUrl = effectiveUrl;
    if (fullUrl && Object.keys(params).length) {
      const usp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) usp.set(k, String(v));
      fullUrl += (fullUrl.includes("?") ? "&" : "?") + usp.toString();
    }

    const bodyParsed = bodyText.trim() ? safeParseJson(bodyText) : null;

    const payload: any = {
      method,
      url: fullUrl || effectiveUrl || "",
      headers,
      body: bodyParsed,
    };

    setDraft(safeStringify(payload));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, url, os, whereText, selectText, orderBy, pageSize, bodyText, settings.maximoUrl]);

  async function runBuilder() {
    setError("");
    try {
      const payload = safeParseJson(draft);
      if (!payload) throw new Error("Request preview JSON is not valid.");
      if (!payload.url) throw new Error("No URL is set. Provide a URL or an Object Structure (OS).");

      // Persist builder state for convenience
      await fetch("/api/trace/state", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restBuilderDraft: payload }),
      });

      const res = await fetch("/api/proxy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const t = await res.text();
      const data = safeParseJson(t) ?? { status: res.status, body: t };
      setLastResponse(safeStringify(data));
      await fetch("/api/trace/state", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lastResponse: data }),
      });
      await refresh();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  function resetBuilder() {
    setMethod("GET");
    setUrl("");
    setOs("");
    setWhereText("");
    setSelectText("");
    setOrderBy("");
    setPageSize(50);
    setBodyText("");
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/settings");
        const j = (await r.json()) as SettingsResponse;
        setSettings(j || {});
      } catch {
        setSettings({});
      }
    })();
    refresh().catch((e) => setError(e?.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restItems = useMemo(() => items.filter((i) => i.kind === "rest"), [items]);
  const maximoItems = useMemo(() => items.filter((i) => i.kind === "maximo"), [items]);
  const aiItems = useMemo(() => items.filter((i) => i.kind === "ai"), [items]);

  return (
    <div style={{ padding: "1rem", display: "grid", gap: "1rem" }}>
      {error ? (
        <InlineNotification kind="error" title="Trace error" subtitle={error} hideCloseButton lowContrast />
      ) : null}

      <Tile>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div className="cds--type-heading-03">REST Builder & Trace</div>
            <div className="cds--type-body-compact-01" style={{ opacity: 0.8 }}>
              Transparent REST traceability
            </div>
          </div>
          <div style={{ display: "flex", gap: ".5rem" }}>
            <Button size="sm" kind="secondary" onClick={() => setOpen((v) => !v)}>
              {open ? "Close" : "Open"}
            </Button>
            <Button size="sm" kind="secondary" onClick={clear}>
              Clear
            </Button>
          </div>
        </div>

        {open ? (
          <div style={{ marginTop: "1rem", display: "grid", gap: "1rem" }}>
            <Tabs>
              <Tab id="build" label="Build Request (logical)">
                <div style={{ marginTop: "1rem", display: "grid", gap: ".75rem" }}>
                  <div className="builderGrid">
                    <div className="k">Method</div>
                    <div>
                      <Dropdown
                        id="br_method"
                        titleText=""
                        items={[...METHODS]}
                        selectedItem={method}
                        onChange={({ selectedItem }) => setMethod((selectedItem as any) || "GET")}
                      />
                    </div>

                    <div className="k">Resource URL</div>
                    <div>
                      <TextInput id="br_url" labelText="" value={url} onChange={(e) => setUrl((e.target as any).value)} placeholder="https://.../maximo/oslc/os/mxapiasset" />
                    </div>

                    <div className="k">Object Structure</div>
                    <div>
                      <TextInput id="br_os" labelText="" value={os} onChange={(e) => setOs((e.target as any).value)} placeholder="mxapiasset (optional; used if URL is empty)" />
                    </div>

                    <div className="k">oslc.where</div>
                    <div>
                      <TextArea id="br_where" labelText="" value={whereText} onChange={(e) => setWhereText((e.target as any).value)} rows={4} />
                    </div>

                    <div className="k">oslc.select</div>
                    <div>
                      <TextArea id="br_select" labelText="" value={selectText} onChange={(e) => setSelectText((e.target as any).value)} rows={2} />
                    </div>

                    <div className="k">oslc.orderBy</div>
                    <div>
                      <TextInput id="br_order" labelText="" value={orderBy} onChange={(e) => setOrderBy((e.target as any).value)} />
                    </div>

                    <div className="k">oslc.pageSize</div>
                    <div style={{ maxWidth: 240 }}>
                      <NumberInput id="br_page" label="" min={1} value={pageSize} onChange={(e: any) => setPageSize(Number(e.imaginaryTarget?.value || e.target?.value || 50))} />
                    </div>

                    <div className="k">Body (POST/PATCH)</div>
                    <div>
                      <TextArea id="br_body" labelText="" value={bodyText} onChange={(e) => setBodyText((e.target as any).value)} rows={6} />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <Button size="sm" kind="secondary" onClick={resetBuilder}>
                      Reset
                    </Button>
                    <Button size="sm" onClick={runBuilder}>
                      Run
                    </Button>
                  </div>
                </div>
              </Tab>

              <Tab id="preview" label="Request preview (readonly)">
                <div style={{ marginTop: "1rem" }}>
                  <TextArea labelText="" readOnly value={draft} rows={14} />
                </div>
              </Tab>

              <Tab id="response" label="Response (status + body)">
                <div style={{ marginTop: "1rem", display: "grid", gap: ".75rem" }}>
                  <ResultViewer value={lastResponseObj ?? lastResponse} defaultView="table" />
                  <TextArea labelText="Raw response" readOnly value={lastResponse} rows={10} />
                </div>
              </Tab>
            </Tabs>

            <TraceLogPanel title="Trace" items={restItems} kindFilter="rest" onRefresh={refresh} onClear={clear} defaultOpen />

            <Tabs>
              <Tab id="maximo" label="Maximo trace">
                <TraceLogPanel title="Maximo" items={maximoItems} kindFilter="maximo" onRefresh={refresh} onClear={clear} defaultOpen />
              </Tab>
              <Tab id="ai" label="AI trace">
                <TraceLogPanel title="AI" items={aiItems} kindFilter="ai" onRefresh={refresh} onClear={clear} defaultOpen />
              </Tab>
            </Tabs>
          </div>
        ) : null}
      </Tile>
    </div>
  );
}
