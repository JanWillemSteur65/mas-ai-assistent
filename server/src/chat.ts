import { chatCompletion } from "./providers.js";
import { callMaximo } from "./maximo.js";

export type ChatRequest = {
  mode: "ai" | "maximo";
  prompt: string;
  system?: string;
  // Maximo REST builder support
  maximo?: {
    path: string;
    method: string;
    body?: any;
  };
};

export async function handleChat(req: ChatRequest) {
  if (req.mode === "maximo") {
    // If explicit REST call requested, execute it.
    if (req.maximo?.path) {
      const data = await callMaximo(req.maximo.path, req.maximo.method || "GET", req.maximo.body);
      return { content: "Maximo response", maximo: data };
    }
    // Otherwise: treat prompt as a Maximo query endpoint path or pass-through.
    // For safety, we do not auto-generate destructive calls.
    const data = await callMaximo("/api/os/mxapiwo", "GET");
    return { content: "Maximo response", maximo: data };
  }

  const out = await chatCompletion(req.prompt, req.system);
  return { content: out.content, raw: out.raw };
}