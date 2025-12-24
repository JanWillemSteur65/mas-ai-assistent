import React from "react";
import { Tile } from "@carbon/react";

export default function HelpPage() {
  return (
    <div style={{ display: "grid", gap: "1rem" }} className="smallHelp">
      <Tile>
        <div className="cds--type-heading-03">Help & User Guide</div>
        <div className="cds--type-helper-text-01">Detailed help mirroring the original standalone HTML.</div>
      </Tile>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <Tile>
          <h3 className="cds--type-heading-04">Overview</h3>
          <p>
            The application supports two modes: <strong>AI</strong> and <strong>Maximo</strong>. Use the header toggle to
            switch modes. The left navigation pane contains modules for Agent, REST Builder & Trace, Settings, and Help.
          </p>
        </Tile>

        <Tile>
          <h3 className="cds--type-heading-04">Settings</h3>
          <ul>
            <li><strong>Maximo Manage URL</strong> and <strong>API Key</strong> are required for Maximo mode.</li>
            <li>Provider keys are required to list models and chat with the selected AI provider.</li>
            <li>Avatars can be configured per provider and per user (URL or data URI).</li>
          </ul>
        </Tile>

        <Tile>
          <h3 className="cds--type-heading-04">Predefined prompts</h3>
          <p>
            On the Agent screen, predefined prompts are displayed as clickable chips and grouped by AI prompts, Maximo prompts,
            and Create prompts.
          </p>
        </Tile>

        <Tile>
          <h3 className="cds--type-heading-04">REST Builder & Trace</h3>
          <ul>
            <li><strong>Build Request</strong>: edit <code>oslc.where</code>, <code>oslc.select</code>, <code>oslc.orderBy</code>, <code>oslc.pageSize</code>.</li>
            <li><strong>Request preview</strong>: a readonly representation of the request.</li>
            <li><strong>Response</strong>: raw payload for debugging.</li>
          </ul>
        </Tile>

        <Tile>
          <h3 className="cds--type-heading-04">Troubleshooting</h3>
          <ul>
            <li>If model list is empty, ensure a provider API key is configured.</li>
            <li>If Maximo requests fail, verify URL/API key and check Trace response.</li>
          </ul>
        </Tile>

        <Tile>
          <h3 className="cds--type-heading-04">Privacy</h3>
          <p>Settings are stored in browser localStorage. The server can be bootstrapped using <code>APP_CONFIG_JSON</code>.</p>
        </Tile>
      </div>
    </div>
  );
}
