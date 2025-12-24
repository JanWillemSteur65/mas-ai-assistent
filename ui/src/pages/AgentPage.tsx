import React, { useEffect, useRef, useState } from "react";
import { Button, Dropdown, TextInput, Tile, InlineLoading } from "@carbon/react";
import { useApp } from "../state/AppState";
import ResultViewer, { ResultViewerColumn } from "../components/ResultViewer";

type ChatMsg = {
  role: "user" | "assistant";
  text: string;
  source?: "ai" | "maximo";
  // Raw Maximo JSON response (typically OSLC JSON)
  maximo?: any;
  // Optional metadata about how the Maximo request was constructed
  maximoMeta?: {
    os?: string;
    where?: string;
    select?: string;
    pageSize?: number;
  };
};

const PNAME: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
  gemini: "Google Gemini",
  watsonx: "IBM watsonx",
  mistral: "Mistral",
  deepseek: "DeepSeek"
};


const DEFAULT_COLUMNS: Record<string, ResultViewerColumn[]> = {
  mxapiasset: [
    { key: "assetnum", label: "Asset" },
    { key: "description", label: "Description" },
    { key: "location", label: "Location" },
    { key: "parent", label: "Parent" },
    { key: "assethealth", label: "Asset health" },
    { key: "siteid", label: "Site" },
    { key: "assettype", label: "Asset type" },
  ],
  mxapiwo: [
    { key: "wonum", label: "WO" },
    { key: "description", label: "Description" },
    { key: "status", label: "Status" },
    { key: "worktype", label: "Work type" },
    { key: "assetnum", label: "Asset" },
    { key: "location", label: "Location" },
    { key: "reportdate", label: "Report date" },
    { key: "siteid", label: "Site" },
  ],
  mxapisr: [
    { key: "ticketid", label: "SR" },
    { key: "description", label: "Description" },
    { key: "status", label: "Status" },
    { key: "reportedby", label: "Reported by" },
    { key: "reportdate", label: "Report date" },
    { key: "assetnum", label: "Asset" },
    { key: "location", label: "Location" },
    { key: "siteid", label: "Site" },
  ],
  mxapiinv: [
    { key: "itemnum", label: "Item" },
    { key: "description", label: "Description" },
    { key: "location", label: "Location" },
    { key: "siteid", label: "Site" },
    { key: "curbal", label: "Current balance" },
    { key: "issueunit", label: "Issue unit" },
  ],
};

function inferMaximoRowCount(data: any): number | null {
  if (!data) return null;
  const member =
    (data && Array.isArray((data as any).member) && (data as any).member) ||
    (data && Array.isArray((data as any)["rdfs:member"]) && (data as any)["rdfs:member"]) ||
    null;
  if (Array.isArray(member)) return member.length;
  if (Array.isArray(data)) return data.length;
  return null;
}


export default function AgentPage() {
  const { ui, setUi, secrets, avatars, models, setModels, reloadServerSettings } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const chatRef = useRef<HTMLDivElement>(null);

  const aiChips = [
    "Create a extended summary of our conversation",
    "Create an Executive Summary of our conversation",
    "Provide me the reasoning, evidence and confidence score behind your response",
    "Explain like I'm not familiar with Maximo or Asset Management"
  ];
  const mxChips = [
    "Show me all locations",
    "Show me all assets",
    "Show me all open work orders",
    "Show me all corrective work orders",
    "Show me all service requests",
    "Show me all inventory",
    "Summarize the last Maximo results"
  ];
  const createChips = [
    "Create new Work Order",
    "Create new Service Request",
    "Create new Asset"
  ];

  function defAvaSVG(txt = "AI") {
    return `data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22><rect width=%2264%22 height=%2264%22 fill=%22%230f62fe%22/><text x=%2232%22 y=%2239%22 font-size=%2232%22 text-anchor=%22middle%22 fill=%22white%22 font-family=%22Arial%22>${encodeURIComponent(txt)}</text></svg>`;
  }
  function assistantAvatar() {
    if (ui.src === "maximo") return defAvaSVG("MX");
    const v = (avatars[ui.provider] || avatars.default || "").trim();
    return v || defAvaSVG("AI");
  }
  function userAvatar() {
    const v = (avatars.user || avatars.default || "").trim();
    return v || defAvaSVG("U");
  }

  useEffect(() => { reloadServerSettings(); }, []);
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight }); }, [messages]);

  async function loadModels() {
    setStatus("Loading models…");
    const r = await fetch(`/api/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: ui.provider, settings: secrets })
    });
    const t = await r.text();
    let j: any = null;
    try { j = JSON.parse(t); } catch { j = null; }
    if (!r.ok) {
      const err = j?.error || t || `HTTP ${r.status}`;
      setModels([]);
      setUi({ ...ui, model: "" });
      setStatus(`Model load failed: ${String(err).slice(0, 200)}`);
      return;
    }

    const list: string[] = j?.models || [];
    setModels(list);
    const next = ui.model || list[0] || "";
    setUi({ ...ui, model: next });
    setStatus(list.length ? `Loaded ${list.length} models` : "No models returned");
  }
  useEffect(() => { loadModels(); }, [ui.provider]);

  async function sendPrompt(prompt: string, forceMode?: "ai" | "maximo") {
    const mode = forceMode || ui.src;
    const trimmed = prompt.trim();
    if (!trimmed) return;

    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    setText("");
    setBusy(true);
    setStatus(mode === "maximo" ? "Sending to Maximo…" : "Sending…");

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          provider: ui.provider,
          model: ui.model,
          temperature: ui.temperature,
          system: ui.system,
          text: trimmed,
          settings: secrets,
          maximoOS: ui.maximoOS
        })
      });

      const t = await r.text();
      let j: any = null;
      try { j = JSON.parse(t); } catch { j = null; }
      if (!r.ok) throw new Error(j?.error || t || `HTTP ${r.status}`);
      const reply = j?.reply || j?.summary || "[empty]";
      if (mode === "maximo") {
        const isSummary = Boolean(j?.request?.summaryOf);
        const rowCount = inferMaximoRowCount(j?.maximo);
        const label = isSummary
          ? reply
          : rowCount != null
          ? `Maximo results (${rowCount} rows)`
          : "Maximo results";
        setMessages((m) => [...m, { role: "assistant", text: label, source: mode, maximo: j?.maximo, maximoMeta: j?.request }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", text: reply, source: mode }]);
      }
      setStatus("OK");
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", text: `Error: ${e?.message || String(e)}`, source: mode }]);
      setStatus("Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <Tile>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div className="cds--type-heading-03">Agent</div>
            <div className="cds--type-body-compact-01" style={{ opacity: 0.85 }}>
              Mode: <strong>{ui.src === "maximo" ? "Maximo" : "AI"}</strong> · Provider: <strong>{PNAME[ui.provider]}</strong>
              {ui.model ? <> · Model: <strong>{ui.model}</strong></> : null}
            </div>
            <div className="cds--type-helper-text-01" style={{ marginTop: ".25rem" }}>{status}</div>
          </div>

          <div style={{ display: "grid", gap: ".5rem", minWidth: 320 }}>
            <Dropdown
              id="prov"
              titleText="AI Provider"
              label={PNAME[ui.provider]}
              items={["openai", "anthropic", "gemini", "watsonx", "mistral", "deepseek"]}
              itemToString={(x) => PNAME[String(x)] || String(x)}
              selectedItem={ui.provider}
              onChange={(e: any) => setUi({ ...ui, provider: e.selectedItem })}
            />
            <Dropdown
              id="model"
              titleText="Model"
              label={ui.model || "Select model"}
              items={models.length ? models : ["(no models)"]}
              selectedItem={ui.model || (models[0] || "")}
              onChange={(e: any) => setUi({ ...ui, model: e.selectedItem })}
            />
            <TextInput
              id="maximoOS"
              labelText="Maximo Object Structure (optional)"
              value={ui.maximoOS}
              onChange={(e: any) => setUi({ ...ui, maximoOS: e.target.value })}
              placeholder="e.g. mxapiwo"
            />
          </div>
        </div>
      </Tile>

      <div style={{ display: "grid", gap: "1rem" }}>
<Tile style={{ display: "flex", flexDirection: "column", minHeight: "70vh" }}>
          <div className="chatBox" ref={chatRef} style={{ flex: "1 1 auto" }}>
            {messages.map((m, idx) => (
              <div key={idx} className={`msgRow ${m.role === "user" ? "user" : "ai"}`}>
                {m.role !== "user" ? (
                  <div className="avatar28">
                    <img src={assistantAvatar()} alt="assistant" />
                  </div>
                ) : null}
                <div>
                  <div className="msgBubble">{m.text}</div>
                  {m.role === "assistant" && m.source === "maximo" ? (
                    <div style={{ marginTop: 12 }}>
                      <ResultViewer
                        value={m.maximo}
                        columns={(() => {
                          const os = String(m.maximoMeta?.os || "").toLowerCase();
                          const preset = DEFAULT_COLUMNS[os];
                          if (preset?.length) return preset;

                          // Fall back to meta.select (if present) with best-effort labels.
                          const keys = String(m.maximoMeta?.select || "")
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean);
                          if (!keys.length) return undefined;
                          return keys.map((k) => ({ key: k }));
                        })()}
                      />
                      <div className="cds--type-helper-text-01" style={{ marginTop: 6, opacity: 0.8 }}>
                        Tip: use the search box to filter all columns, or use per-column filters in the header.
                      </div>
                    </div>
                  ) : null}
                  <div className="msgMeta">
                    {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                {m.role === "user" ? (
                  <div className="avatar28">
                    <img src={userAvatar()} alt="user" />
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gap: ".75rem", marginTop: "1rem" }}>
            <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "end" }}>
              <TextInput
                id="prompt"
                labelText="Prompt"
                value={text}
                onChange={(e: any) => setText(e.target.value)}
                onKeyDown={(e: any) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    sendPrompt(text);
                  }
                }}
                style={{ flex: "1 1 520px" }}
              />
              <Button kind="primary" onClick={() => sendPrompt(text)} disabled={busy || !text.trim()}>
                Send
              </Button>
              <Button kind="secondary" onClick={() => setMessages([])} disabled={busy}>
                Clear
              </Button>
            </div>

            {busy ? <InlineLoading description="Working…" /> : null}
          </div>
        </Tile>

        {/* Predefined prompts */}
        <Tile style={{ height: "100%", overflowY: "auto" }}>
          <div style={{ display: "grid", gap: ".75rem" }}>
            <div>
              <div className="cds--type-heading-02">Predefined Prompt Examples</div>
              <div className="cds--type-helper-text-01">Easy prompts to use for direct responses</div>
            </div>

            <div style={{ display: "grid", gap: "1rem" }}>
              <div>
                <div className="cds--type-heading-02" style={{ marginBottom: ".5rem" }}>
                  AI prompts
                </div>
                <div className="chipRow">
                  {aiChips.map((c) => (
                    <Button
                      key={c}
                      className="chipBtn"
                      kind="tertiary"
                      size="sm"
                      onClick={() => sendPrompt(c, "ai")}
                    >
                      {c}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <div className="cds--type-heading-02" style={{ marginBottom: ".5rem" }}>
                  Maximo prompts
                </div>
                <div className="chipRow">
                  {mxChips.map((c) => (
                    <Button
                      key={c}
                      className="chipBtn"
                      kind="tertiary"
                      size="sm"
                      onClick={() => sendPrompt(c, c.toLowerCase().includes("summarize") ? "ai" : "maximo")}
                    >
                      {c}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <div className="cds--type-heading-02" style={{ marginBottom: ".5rem" }}>
                  Create prompts
                </div>
                <div className="chipRow">
                  {createChips.map((c) => (
                    <Button
                      key={c}
                      className="chipBtn"
                      kind="tertiary"
                      size="sm"
                      onClick={() => sendPrompt(c, "maximo")}
                    >
                      {c}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Tile>
      </div>
    </div>
  );
}
