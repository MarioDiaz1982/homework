import 'dotenv/config';
import OpenAI from "openai";
import pLimit from "p-limit";
import { webSearchSerper } from "./search.js";
import { fetchAndExtract } from "./scrape.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY; // misma var
const LLM_BASE_URL   = process.env.LLM_BASE_URL; // opcional
const LLM_MODEL      = process.env.LLM_MODEL || "gpt-4o-mini";

export function makeClient() {
  const opt = { apiKey: OPENAI_API_KEY };
  if (LLM_BASE_URL) opt.baseURL = LLM_BASE_URL;
  return new OpenAI(opt);
}

// Definición del tool (function calling)
export const tools = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Busca en Google (Serper.dev) links relevantes. Devuelve URLs candidatas a leer.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Consulta de búsqueda" },
          max_results: { type: "integer", description: "Máximo de resultados (5 recomendado)", default: 5 }
        },
        required: ["query"]
      }
    }
  }
];

const SYSTEM_PROMPT =
  "Eres un asistente de investigación. Puedes pedir usar la función web_search cuando necesites información actualizada o verificar datos. " +
  "Cuando respondas, explica brevemente y añade **Referencias** con enlaces al final. Usa un estilo conciso.";

// Llama al modelo SIN streaming para detectar si quiere usar tool calling
export async function maybeToolCall(client, messages) {
  const isGroq = (LLM_BASE_URL || "").includes("groq");
  const params = {
    model: LLM_MODEL,
    messages,
    tools,
    tool_choice: "auto",
    temperature: 0.3,
    // Groq prefiere max_completion_tokens; otros usan max_tokens. Enviamos ambos con un valor pequeño.
    ...(isGroq ? { max_completion_tokens: 256 } : { max_tokens: 256 })
  };

  const r = await client.chat.completions.create(params);
  const choice = r.choices?.[0];
  const toolCalls = choice?.message?.tool_calls || [];
  return { toolCalls, toolMessage: choice?.message };
}

// Ejecuta la búsqueda + scraping top 5 (con logs progresivos)
export async function runWebResearch(query, maxResults, onProgress = () => {}) {
  onProgress(`🔎 Buscando: ${query}`);
  const results = await webSearchSerper(query, Math.min(Math.max(maxResults || 5, 1), 5));
  if (results.length === 0) return { sources: [], corpus: "" };

  const limit = pLimit(3);
  const fetches = results.map((r, i) => limit(async () => {
    onProgress(`📖 Leyendo [${i+1}/${results.length}]: ${r.url}`);
    try {
      const page = await fetchAndExtract(r.url);
      onProgress(`✓ Fuente: ${page.title} (${r.url})`);
      return { ...page };
    } catch (e) {
      onProgress(`⚠️ No se pudo leer: ${r.url} (${e.message})`);
      return null;
    }
  }));

  const pages = (await Promise.all(fetches)).filter(Boolean);
  const corpus = pages.map(p => `# ${p.title}\nURL: ${p.url}\n\n${p.text}`).join("\n\n---\n\n");
  return { sources: pages.map(p => ({ title: p.title, url: p.url })), corpus };
}

// Streaming del output final
export async function streamFinalAnswer(client, messages, onToken) {
  const isGroq = (LLM_BASE_URL || "").includes("groq");
  const stream = await client.chat.completions.create({
    model: LLM_MODEL,
    messages,
    temperature: 0.3,
    stream: true,
    ...(isGroq ? { max_completion_tokens: 1024 } : { max_tokens: 1024 })
  });

  for await (const part of stream) {
    const delta = part.choices?.[0]?.delta?.content;
    if (delta) onToken(delta);
  }
}
 
export function systemPrompt() { return SYSTEM_PROMPT; }
