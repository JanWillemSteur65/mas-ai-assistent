import React, { useEffect, useMemo, useState } from "react";
import { Button, Dropdown, TextInput,
  Toggle, Tile } from "@carbon/react";
import { useApp, ProviderId } from "../state/AppState";

const PROVIDERS: ProviderId[] = ["openai","anthropic","gemini","watsonx","mistral","deepseek"];

export default function SettingsPage() {
  const { ui, setUi, secrets, setSecrets, avatars, setAvatars, reloadServerSettings, saveServerSettings } = useApp();
  const [msg, setMsg] = useState("—");

  useEffect(() => { reloadServerSettings(); }, []);

  const avatarRows = useMemo(() => ([
    { key: "default", label: "Global default" },
    { key: "openai", label: "OpenAI" },
    { key: "anthropic", label: "Anthropic" },
    { key: "gemini", label: "Gemini" },
    { key: "watsonx", label: "watsonx" },
    { key: "mistral", label: "Mistral" },
    { key: "deepseek", label: "DeepSeek" },
    { key: "user", label: "User" }
  ]), []);

  const preview = (val: string) => (val?.trim()
    ? val.trim()
    : "data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22><rect width=%2264%22 height=%2264%22 fill=%22%238d8d8d%22/></svg>");

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <Tile>
        <div className="cds--type-heading-03">Settings</div>
        <div className="cds--type-helper-text-01">{msg}</div>
      </Tile>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <Tile>
          <div className="cds--type-heading-02" style={{ marginBottom: ".75rem" }}>AI Provider</div>
          <Dropdown id="provider" titleText="Provider" items={PROVIDERS} selectedItem={ui.provider} label={ui.provider}
            onChange={(e:any)=>setUi({ ...ui, provider: e.selectedItem })} />
          <TextInput id="system" labelText="System prompt" value={ui.system} onChange={(e:any)=>setUi({ ...ui, system: e.target.value })} style={{ marginTop: ".75rem" }} />
          <TextInput id="temp" labelText="Temperature" type="number" value={String(ui.temperature)} onChange={(e:any)=>setUi({ ...ui, temperature: Number(e.target.value || 0.7) })} style={{ marginTop: ".75rem" }} />

          <div style={{ marginTop: ".75rem" }}>
            <Toggle id="theme" labelText="Dark mode" labelA="Light" labelB="Dark" toggled={ui.theme === "dark"}
              onToggle={(t:boolean)=>setUi({ ...ui, theme: t ? "dark" : "light" })} />
          </div>
        </Tile>

        <Tile>
          <div className="cds--type-heading-02" style={{ marginBottom: ".75rem" }}>Maximo</div>
          <TextInput id="maximo_url" labelText="Maximo Manage/Base URL" value={secrets.maximo_url || ""} onChange={(e:any)=>setSecrets({ ...secrets, maximo_url: e.target.value })} />
          <TextInput id="maximo_apikey" labelText="Maximo API Key" type="password" value={secrets.maximo_apikey || ""} onChange={(e:any)=>setSecrets({ ...secrets, maximo_apikey: e.target.value })} style={{ marginTop: ".75rem" }} />
          <TextInput id="default_siteid" labelText="Default Site ID" value={secrets.default_siteid || ""} onChange={(e:any)=>setSecrets({ ...secrets, default_siteid: (e.target.value || "").toUpperCase() })} style={{ marginTop: ".75rem" }} />
        </Tile>
      </div>

      <Tile>
        <div className="cds--type-heading-02" style={{ marginBottom: ".75rem" }}>Provider Keys</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <TextInput id="openai_key" labelText="OpenAI API Key" type="password" value={secrets.openai_key || ""} onChange={(e:any)=>setSecrets({ ...secrets, openai_key: e.target.value })} />
            <TextInput id="openai_base" labelText="OpenAI Base URL" value={secrets.openai_base || "https://api.openai.com/v1"} onChange={(e:any)=>setSecrets({ ...secrets, openai_base: e.target.value })} style={{ marginTop: ".75rem" }} />
          </div>
          <div>
            <TextInput id="anthropic_key" labelText="Anthropic API Key" type="password" value={secrets.anthropic_key || ""} onChange={(e:any)=>setSecrets({ ...secrets, anthropic_key: e.target.value })} />
            <TextInput id="anthropic_base" labelText="Anthropic Base URL" value={secrets.anthropic_base || "https://api.anthropic.com"} onChange={(e:any)=>setSecrets({ ...secrets, anthropic_base: e.target.value })} style={{ marginTop: ".75rem" }} />
          </div>
          <div>
            <TextInput id="gemini_key" labelText="Gemini API Key" type="password" value={secrets.gemini_key || ""} onChange={(e:any)=>setSecrets({ ...secrets, gemini_key: e.target.value })} />
            <TextInput id="gemini_base" labelText="Gemini Base URL" value={secrets.gemini_base || "https://generativelanguage.googleapis.com/v1beta"} onChange={(e:any)=>setSecrets({ ...secrets, gemini_base: e.target.value })} style={{ marginTop: ".75rem" }} />
          </div>
          <div>
            <TextInput id="mistral_key" labelText="Mistral API Key" type="password" value={secrets.mistral_key || ""} onChange={(e:any)=>setSecrets({ ...secrets, mistral_key: e.target.value })} />
            <TextInput id="mistral_base" labelText="Mistral Base URL" value={secrets.mistral_base || "https://api.mistral.ai/v1"} onChange={(e:any)=>setSecrets({ ...secrets, mistral_base: e.target.value })} style={{ marginTop: ".75rem" }} />
          </div>
          <div>
            <TextInput id="deepseek_key" labelText="DeepSeek API Key" type="password" value={secrets.deepseek_key || ""} onChange={(e:any)=>setSecrets({ ...secrets, deepseek_key: e.target.value })} />
            <TextInput id="deepseek_base" labelText="DeepSeek Base URL" value={secrets.deepseek_base || "https://api.deepseek.com/v1"} onChange={(e:any)=>setSecrets({ ...secrets, deepseek_base: e.target.value })} style={{ marginTop: ".75rem" }} />
          </div>
        </div>
      </Tile>

      <Tile>
        <div className="cds--type-heading-02" style={{ marginBottom: ".75rem" }}>Avatars</div>
        <div style={{ display: "grid", gap: ".75rem" }}>
          {avatarRows.map((row) => (
            <div key={row.key} style={{ display:"grid", gridTemplateColumns:"160px 1fr 90px 40px", gap:".75rem", alignItems:"end" }}>
              <div className="cds--type-body-compact-01"><strong>{row.label}</strong></div>
              <TextInput id={`ava_${row.key}`} labelText="URL or data URI" value={avatars[row.key] || ""} onChange={(e:any)=>setAvatars({ ...avatars, [row.key]: e.target.value })} />
              <Button kind="secondary" onClick={async()=>{ await saveServerSettings(); setMsg(`Saved (avatar ${row.key})`); }}>Set</Button>
              <div className="avatar28" style={{ width:32, height:32 }}><img src={preview(avatars[row.key] || "")} alt={row.key} /></div>
            </div>
          ))}
        </div>
      </Tile>

      <Tile>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: ".5rem" }}>
          <Button kind="secondary" onClick={() => { setSecrets({}); setMsg("Cleared local secrets"); }}>Clear local</Button>
          <Button kind="primary" onClick={async () => { await saveServerSettings(); setMsg("Saved"); }}>Save</Button>
        </div>
      </Tile>
    </div>
  );
}
