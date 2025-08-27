import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";

import { ChatGroq } from "@langchain/groq";
import { SYSTEM_PROMPT } from "./prompts.js";
import { classifyQuery } from "./router.js";
import { getBalanceById } from "./csv_balance.js";
import { buildOrLoadVectorStore } from "./kb_index.js";

const CSV_PATH = "saldos.csv";

function preflight() {
  const nodeOk = Number(process.versions.node.split(".")[0]) >= 18;
  if (!nodeOk) throw new Error(`Node 18+ requerido. Detectado: ${process.version}`);
  if (!process.env.GROQ_API_KEY) throw new Error("Falta GROQ_API_KEY en .env");
}

async function main() {
  preflight();

  const llm = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: "llama-3.3-70b-versatile",
    temperature: 0.2,
  });

  // Cargar/crear índice FAISS (una sola vez)
  output.write(chalk.gray("🔎 Preparando índice de conocimiento...\n"));
  const vectorStore = await buildOrLoadVectorStore().catch((e) => {
    console.warn(chalk.yellow(`⚠️ No se pudo cargar índice FAISS: ${e.message}`));
    return null;
  });

  const rl = readline.createInterface({ input, output });
  const history = [];

  output.write(chalk.cyan("\n🏦 Asistente Bancario (LangChain + Groq)\n"));
  output.write(chalk.gray("Escribe tu consulta. 'salir' para terminar.\n"));

  while (true) {
    const q = await rl.question(chalk.yellow("\nTú: "));
    if (!q || q.trim().toLowerCase() === "salir") break;

    try {
      const { route, id } = await classifyQuery(llm, q.trim());

      if (route === "balance") {
        if (!id) {
          output.write(chalk.yellow("💡 Necesito el ID/cédula para consultar el saldo.\n"));
          continue;
        }
        const rec = getBalanceById(CSV_PATH, id);
        if (!rec) {
          output.write(chalk.red(`No encontré saldo para ID ${id}\n`));
        } else {
          output.write(chalk.green(`\nSaldo para ${rec.nombre} (ID ${rec.id}): ${rec.saldo} ${rec.moneda}\n`));
          output.write("Referencias:\n- CSV saldos\n");
        }
        continue;
      }

      if (route === "kb" && vectorStore) {
        const topK = await vectorStore.similaritySearch(q.trim(), 4);
        const refs = [...new Set(topK.map(d => d.metadata?.source).filter(Boolean))];
        const ctx = topK.map(d => `Fuente: ${d.metadata?.source}\n${d.pageContent}`).join("\n\n---\n\n");

        const messages = [
          { role: "system", content: SYSTEM_PROMPT },
          ...history.slice(-6),
          { role: "user", content: `Pregunta: ${q}\n\nCONTEXTO:\n${ctx}\n\nResponde en español y cita fuentes.`}
        ];

        const stream = await llm.stream(messages);
        output.write(chalk.green("\n▶ Respuesta:\n"));
        let full = "";
        for await (const part of stream) {
          const piece = part?.content ?? "";
          full += piece;
          output.write(piece);
        }
        output.write("\n\nReferencias:\n");
        if (refs.length) refs.forEach(u => output.write(`- ${u}\n`));
        else output.write("- (KB)\n");

        history.push({ role: "user", content: q });
        history.push({ role: "assistant", content: full });
        continue;
      }

      // general
      {
        const messages = [
          { role: "system", content: SYSTEM_PROMPT },
          ...history.slice(-6),
          { role: "user", content: q }
        ];
        const stream = await llm.stream(messages);
        output.write(chalk.green("\n▶ Respuesta:\n"));
        let full = "";
        for await (const part of stream) {
          const piece = part?.content ?? "";
          full += piece;
          output.write(piece);
        }
        output.write("\n\nReferencias:\n- (sin fuentes externas)\n");

        history.push({ role: "user", content: q });
        history.push({ role: "assistant", content: full });
      }

    } catch (err) {
      console.error(chalk.red("\n[ERROR]"), err?.stack || err);
    }
  }

  rl.close();
  output.write(chalk.gray("\n👋 Fin.\n"));
}

main().catch((e) => {
  console.error("[FATAL]", e?.stack || e);
  process.exit(1);
});
