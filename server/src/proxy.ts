type ProxyRequest = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
};

export async function proxy(req: ProxyRequest) {
  const method = (req.method || "GET").toUpperCase();
  const headers: Record<string, string> = { ...(req.headers || {}) };

  let body: any = undefined;
  if (req.body !== undefined && req.body !== null && method !== "GET" && method !== "HEAD") {
    if (typeof req.body === "string") {
      body = req.body;
      if (!headers["content-type"]) headers["content-type"] = "text/plain";
    } else {
      body = JSON.stringify(req.body);
      if (!headers["content-type"]) headers["content-type"] = "application/json";
    }
  }

  const res = await fetch(req.url, { method, headers, body });
  const text = await res.text();

  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    headers: Object.fromEntries(res.headers.entries()),
    text,
    json,
  };
}
