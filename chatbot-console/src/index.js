import 'dotenv/config';
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { makeClient, maybeToolCall, runWebResearch, streamFinalAnswer, systemPrompt } from "./llm.js";
import { Memory } from "./memory.js";

const rl = readline.createInterface({ input, output });
const client = makeClient();
const mem = new Memory(systemPrompt());

console.log("🤖 Chatbot (consola). Escribe tu pregunta. Ctrl+C para salir.\n");

async function handleUserTurn(userText) {
  mem.pushUser(userText);

  // 1) Pregunta inicial al LLM (sin streaming) para ver si pide tool calling
  const { toolCalls, toolMessage } = await maybeToolCall(client, mem.all());

  let sources = [];
  if (toolCalls.length > 0) {
    const tc = toolCalls[0];
    const args = JSON.parse(tc.function.arguments || "{}");
    const query = args.query || userText;
    const maxResults = args.max_results || 5;

    // 2) Ejecuta búsqueda + scraping con logs en tiempo real
    const logs = [];
    const onProgress = (msg) => {
      logs.push(msg);
      process.stdout.write(msg + "\n");
    };
    const research = await runWebResearch(query, maxResults, onProgress);
    sources = research.sources;

    // 3) Entrega resultado de la herramienta como mensaje de "tool"
    mem.pushToolCall({ id: tc.id, type: "function", function: tc.function });
    mem.pushToolResult(tc.id, {
      query, maxResults,
      note: "Top páginas analizadas y texto extraído (corpus truncado si es muy largo).",
      sources: research.sources,
      corpus: research.corpus.slice(0, 80_000)
    });
  }

  // 4) Segunda llamada con streaming para generar la respuesta final
  process.stdout.write("\n🧠 Respuesta: ");
  await streamFinalAnswer(client, mem.all(), (chunk) => process.stdout.write(chunk));
  process.stdout.write("\n");

  // 5) Citas al final (si hay fuentes)
  if (sources.length) {
    process.stdout.write("\nReferencias:\n");
    for (const s of sources) {
      process.stdout.write(`- ${s.title} — ${s.url}\n`);
    }
  }
  process.stdout.write("\n");
}

async function main() {
  while (true) {
    const q = await rl.question("> ");
    if (!q?.trim()) continue;
    await handleUserTurn(q.trim());
  }
}

main().catch(err => {
  console.error("\n[ERROR]", err?.message || err);
  process.exit(1);
});
