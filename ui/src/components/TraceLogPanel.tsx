import React, { useMemo, useState } from "react";
import {
  DataTable,
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
  Tabs,
  Tab,
  TextArea,
  Tag,
  Button,
  InlineLoading,
} from "@carbon/react";

import ResultViewer from "./ResultViewer";

export type TraceItem = {
  id: string;
  ts: string;
  kind: "ai" | "maximo" | "rest" | "ui" | "system";
  label?: string;
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  request?: unknown;
  response?: unknown;
  error?: string;
};

function safeStringify(v: unknown) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export default function TraceLogPanel({
  title,
  items,
  kindFilter,
  onRefresh,
  onClear,
}: {
  title: string;
  items: TraceItem[];
  kindFilter?: TraceItem["kind"] | "all";
  onRefresh?: () => Promise<void> | void;
  onClear?: () => Promise<void> | void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const base = kindFilter && kindFilter !== "all" ? items.filter((i) => i.kind === kindFilter) : items;
    return base;
  }, [items, kindFilter]);

  const selected = useMemo(
    () => (selectedId ? filtered.find((i) => i.id === selectedId) : filtered[0]),
    [filtered, selectedId]
  );

  const rows = useMemo(
    () =>
      filtered.map((i) => ({
        id: i.id,
        ts: new Date(i.ts).toLocaleString(),
        kind: i.kind,
        label: i.label ?? "",
        method: i.method ?? "",
        url: i.url ?? "",
        status: i.status ?? "",
        duration: typeof i.durationMs === "number" ? `${i.durationMs} ms` : "",
      })),
    [filtered]
  );

  const headers = [
    { key: "ts", header: "Time" },
    { key: "kind", header: "Type" },
    { key: "label", header: "Label" },
    { key: "method", header: "Method" },
    { key: "url", header: "URL" },
    { key: "status", header: "Status" },
    { key: "duration", header: "Duration" },
  ];

  async function run(fn?: () => Promise<void> | void) {
    if (!fn) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <h4 style={{ margin: 0 }}>{title}</h4>
          <Tag type="gray">{filtered.length} items</Tag>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {busy ? <InlineLoading description="Working..." /> : null}
          <Button size="sm" kind="secondary" onClick={() => run(onRefresh)} disabled={busy}>
            Refresh
          </Button>
          <Button size="sm" kind="danger--tertiary" onClick={() => run(onClear)} disabled={busy}>
            Clear
          </Button>
        </div>
      </div>

      <DataTable rows={rows} headers={headers} isSortable>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps }) => (
          <Table {...getTableProps()} size="sm" useZebraStyles>
            <TableHead>
              <TableRow>
                {headers.map((header) => (
                  <TableHeader key={header.key} {...getHeaderProps({ header })}>
                    {header.header}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  {...getRowProps({ row })}
                  onClick={() => setSelectedId(row.id)}
                  style={{ cursor: "pointer" }}
                >
                  {row.cells.map((cell) => (
                    <TableCell key={cell.id}>{cell.value as any}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DataTable>

      <Tabs>
        <Tab id="trace-table" label="Table">
          <div style={{ marginTop: ".75rem" }}>
            <ResultViewer value={selected?.response ?? null} />
          </div>
        </Tab>
        <Tab id="trace-req" label="Request">
          <TextArea labelText="" readOnly value={safeStringify(selected?.request ?? "")} rows={18} />
        </Tab>
        <Tab id="trace-res" label="Response">
          <TextArea labelText="" readOnly value={safeStringify(selected?.response ?? "")} rows={18} />
        </Tab>
        <Tab id="trace-err" label="Error">
          <TextArea labelText="" readOnly value={selected?.error ?? ""} rows={8} />
        </Tab>
      </Tabs>
    </div>
  );
}
