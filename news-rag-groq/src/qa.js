import { BM25Retriever } from "@langchain/community/retrievers/bm25";

/**
 * Construye un retriever BM25 sin embeddings (ideal para textos noticiosos).
 */
export async function buildRetriever(docs, { k = 6 } = {}) {
  const retriever = await BM25Retriever.fromDocuments(docs);
  retriever.k = k;
  return retriever;
}

/**
 * Prepara contexto compacto a partir de documentos recuperados.
 */
export function toContext(docs, { maxChars = 8000 } = {}) {
  const lines = [];
  const urls = new Set();

  for (const d of docs) {
    const src = d.metadata?.source || "";
    urls.add(src);
    const header = `\n### Fuente: ${src}\n`;
    const body = (d.pageContent || "").slice(0, Math.ceil(maxChars / docs.length));
    lines.push(header + body);
  }

  const context = lines.join("\n");
  const references = Array.from(urls);
  return { context, references };
}
