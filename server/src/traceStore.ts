export type TraceKind = "ai" | "maximo" | "rest" | "ui" | "system" | "models";

export type TraceItem = {
  id: string;
  ts: string; // ISO timestamp
  kind: TraceKind;
  provider?: string;
  ok?: boolean;
  label?: string;
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  request?: unknown;
  response?: unknown;
  error?: string;
};

export type TraceState = {
  enabled: boolean;
  maxItems: number;
} & Record<string, any>;

let state: TraceState = {
  enabled: true,
  maxItems: 500,
};

const items: TraceItem[] = [];

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function addTrace(partial: Omit<TraceItem, "id" | "ts"> & { id?: string; ts?: string }) {
  if (!state.enabled) return;
  const item: TraceItem = {
    id: partial.id ?? makeId(),
    ts: partial.ts ?? new Date().toISOString(),
    kind: partial.kind,
    label: partial.label,
    method: partial.method,
    url: partial.url,
    status: partial.status,
    durationMs: partial.durationMs,
    request: partial.request,
    response: partial.response,
    error: partial.error,
  };
  items.unshift(item);
  if (items.length > state.maxItems) items.length = state.maxItems;
}

export function listTraces(kind?: TraceKind, limit = 200) {
  const filtered = kind ? items.filter((i) => i.kind === kind) : items;
  return filtered.slice(0, Math.max(1, Math.min(limit, state.maxItems)));
}

export function clearTraces() {
  items.length = 0;
}

export function getTraceState() {
  return state;
}

export function setTraceState(patch: Partial<TraceState>) {
  state = { ...state, ...patch };
  return state;
}
