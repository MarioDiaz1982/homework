import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';
import { ChatGroq } from '@langchain/groq';

import { loadNews } from './newsLoader.js';
import { buildRetriever, toContext } from './qa.js';

/* ======== PRE-CHECKS ======== */
function preflight() {
  const nodeOk = Number(process.versions.node.split('.')[0]) >= 18;
  if (!nodeOk) throw new Error(`Node 18+ requerido. Detectado: ${process.version}`);
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY no encontrada. Crea .env en la raíz con GROQ_API_KEY=grq_xxx');
  }
}

/* ======== HELPERS ======== */
async function withTimeout(promise, ms, label = 'tarea') {
  const t = new Promise((_, rej) =>
    setTimeout(() => rej(new Error(`${label} timeout (${ms} ms)`)), ms)
  );
  return Promise.race([promise, t]);
}

/* ======== MAIN ======== */
async function main() {
  preflight();

  console.log(chalk.cyan('📰 NewsRAG (LangChain + Groq)'));
  console.log(chalk.gray("Escribe tu pregunta. 'salir' para terminar.\n"));

  const rl = readline.createInterface({ input, output });

  // Instancia LLM *después* de preflight para que no explote antes del prompt
  const llm = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile',
    temperature: 0.2,
    maxRetries: 2,
  });

  const SYSTEM = `
Eres un asistente de noticias en español.
- Usa el CONTEXTO cuando esté relacionado con la pregunta.
- Responde con hechos fechados y claros cuando hables de noticias.
- Termina SIEMPRE con "Referencias:" y una lista de URLs únicas. 
- Si el contexto no contiene la respuesta, dilo y contesta con conocimiento general.
`.trim();

  const history = [];
  let cache = { ts: 0, docs: [] };

  async function getDocsFresh() {
    const now = Date.now();
    const TTL = 5 * 60 * 1000; // 5 min
    if (cache.docs.length && (now - cache.ts) < TTL) return cache.docs;

    console.log(chalk.gray('⏳ Obteniendo noticias (máx. 20s)...'));
    // maxDepth=0 para que no se cuelgue; súbelo a 1 luego de probar
    const docs = await withTimeout(
      loadNews({ maxDepth: 0, timeout: 12000, maxDocs: 12 }),
      20000,
      'loadNews'
    );
    cache = { ts: now, docs };
    console.log(chalk.gray(`✅ Noticias cargadas: ${docs.length} doc(s)`));
    return docs;
  }

  async function answer(query) {
    let docs = [];
    try {
      docs = await getDocsFresh();
    } catch (e) {
      console.log(chalk.yellow(`⚠️ No se pudieron cargar noticias a tiempo (${e.message}). Respondo sin contexto.`));
    }

    let context = '', references = [];
    if (docs.length) {
      const retriever = await buildRetriever(docs, { k: 6 });
      const top = await retriever.getRelevantDocuments(query);
      const c = toContext(top);
      context = c.context;
      references = c.references;
    }

    const messages = [
      { role: 'system', content: SYSTEM },
      ...history.slice(-6),
      {
        role: 'user',
        content:
          `Pregunta: ${query}\n\n` +
          (context ? `CONTEXTO:\n${context}\n\n` : `CONTEXTO: (no disponible)\n\n`) +
          `Instrucciones: contesta en español y termina con "Referencias:" + URLs.`,
      },
    ];

    const stream = await llm.stream(messages);

    let full = '';
    process.stdout.write(chalk.green('\n▶ Respuesta:\n'));
    for await (const chunk of stream) {
      const piece = chunk?.content ?? '';
      full += piece;
      process.stdout.write(piece);
    }

    const refs = (references || []).filter(Boolean);
    process.stdout.write('\n\nReferencias:\n');
    if (refs.length) {
      for (const u of Array.from(new Set(refs))) process.stdout.write(`- ${u}\n`);
    } else {
      process.stdout.write('- (No se detectaron URLs del contexto)\n');
    }

    history.push({ role: 'user', content: query });
    history.push({ role: 'assistant', content: full });
  }

  // === loop de preguntas ===
  while (true) {
    try {
      const q = await rl.question(chalk.yellow('\nTú: '));
      if (!q || q.trim().toLowerCase() === 'salir') break;
      await answer(q.trim());
    } catch (err) {
      console.error(chalk.red('\n[ERROR EN TURNO]'), err?.stack || err);
    }
  }

  rl.close();
  console.log(chalk.gray('\n👋 Fin.'));
}

main().catch((e) => {
  console.error('[FALLO AL INICIAR]', e?.stack || e);
});
