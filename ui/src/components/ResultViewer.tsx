import React, { useMemo, useState } from "react";
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  TextInput,
  Button,
  Tile,
  Theme,
} from "@carbon/react";

export type ResultViewerColumn = {
  key: string;
  label?: string;
};

function normalizeToRows(input: any): { rows: any[]; meta?: { keys?: string[] } } | null {
  if (input == null) return null;

  // Common OSLC shape
  const member =
    (input && Array.isArray(input.member) && input.member) ||
    (input && Array.isArray(input["rdfs:member"]) && input["rdfs:member"]) ||
    null;

  const data = Array.isArray(member) ? member : input;
  if (!Array.isArray(data) || !data.length) return null;
  if (typeof data[0] !== "object" || data[0] == null) return null;

  // If the upstream already included a table-like structure, respect it.
  // { columns: [...], rows: [...] }
  if (Array.isArray((input as any).columns) && Array.isArray((input as any).rows)) {
    const rows = (input as any).rows;
    if (rows.length && typeof rows[0] === "object") return { rows };
  }

  return { rows: data };
}

function coerceCellValue(v: any) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export default function ResultViewer({
  value,
  maxColumns = 20,
  columns,
  defaultView = "table",
}: {
  value: any;
  maxColumns?: number;
  columns?: ResultViewerColumn[];
  defaultView?: "table" | "raw";
}) {
  const normalized = useMemo(() => normalizeToRows(value), [value]);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  if (!normalized) {
    if (value == null) return null;
    return (
      <Tile>
        <pre style={{ margin: 0, overflowX: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, lineHeight: 1.4 }}>
          {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
        </pre>
      </Tile>
    );
  }

  const keys = (columns?.length ? columns.map((c) => c.key) : Object.keys(normalized.rows[0] || {})).slice(
    0,
    maxColumns
  );
  const headers = keys.map((k) => {
    const label = columns?.find((c) => c.key === k)?.label;
    return { key: k, header: label || k };
  });
  const rows = normalized.rows.map((r, idx) => ({
    id: String(idx),
    ...Object.fromEntries(keys.map((k) => [k, (r as any)?.[k]])),
  }));

  const filteredRows = rows.filter((r) => {
    const rowText = keys.map((k) => coerceCellValue((r as any)[k]).toLowerCase()).join(" | ");
    if (globalFilter.trim()) {
      if (!rowText.includes(globalFilter.trim().toLowerCase())) return false;
    }
    for (const k of keys) {
      const fv = (colFilters[k] || "").trim().toLowerCase();
      if (!fv) continue;
      const cell = coerceCellValue((r as any)[k]).toLowerCase();
      if (!cell.includes(fv)) return false;
    }
    return true;
  });

  const hasFilters = globalFilter.trim() || Object.values(colFilters).some((v) => (v || "").trim());

  if (defaultView === "raw") {
    return (
      <Tile>
        <pre style={{ margin: 0, overflowX: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, lineHeight: 1.4 }}>
          {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
        </pre>
      </Tile>
    );
  }

  return (
    <Theme theme="g10"><div className="resultTableWrap">
      <DataTable rows={filteredRows} headers={headers}>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps }) => (
          <Table {...getTableProps()} size="sm" useZebraStyles className="resultTable">
            <TableToolbar>
              <TableToolbarContent>
                <TableToolbarSearch
                  persistent
                  labelText="Search"
                  placeholder="Filter all columns…"
                  value={globalFilter}
                  onChange={(e: any) => setGlobalFilter(String(e?.target?.value || ""))}
                />
                {hasFilters ? (
                  <Button
                    size="sm"
                    kind="secondary"
                    onClick={() => {
                      setGlobalFilter("");
                      setColFilters({});
                    }}
                  >
                    Clear filters
                  </Button>
                ) : null}
              </TableToolbarContent>
            </TableToolbar>
            <TableHead>
              <TableRow>
                {headers.map((h) => (
                  <TableHeader key={h.key} {...getHeaderProps({ header: h })}>
                    {h.header}
                  </TableHeader>
                ))}
              </TableRow>
              <TableRow>
                {headers.map((h) => (
                  <TableHeader key={`filter-${h.key}`}>
                    <TextInput
                      id={`filter-${h.key}`}
                      hideLabel
                      labelText={""}
                      size="sm"
                      placeholder="Filter…"
                      value={colFilters[h.key] || ""}
                      onChange={(e: any) => {
                        const v = String(e?.target?.value || "");
                        setColFilters((prev) => ({ ...prev, [h.key]: v }));
                      }}
                    />
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} {...getRowProps({ row })}>
                  {row.cells.map((cell) => (
                    <TableCell key={cell.id}>{coerceCellValue(cell.value)}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DataTable>
    </div></Theme>
  );
}
