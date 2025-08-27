// src/newsLoader.js
import { RecursiveUrlLoader } from "@langchain/community/document_loaders/web/recursive_url";
import { compile } from "html-to-text";

export async function loadNews({
  maxDepth = 0,             // << antes 1: prueba primero con 0 (solo portada)
  timeout = 12000,          // tiempo por página
  maxDocs = 12              // límite de documentos totales
} = {}) {
  const extractor = compile({
    wordwrap: 130,
    selectors: [{ selector: "a", options: { hideLinkHrefIfSameAsText: true } }]
  });

  const roots = [
    "https://cnnespanol.cnn.com/lite/",
    "https://www.cbc.ca/lite/news?sort=latest"
  ];

  const loaders = roots.map(
    (url) =>
      new RecursiveUrlLoader(url, {
        extractor,
        maxDepth,
        timeout,
        preventOutside: true
      })
  );

  console.time("loadNews");
  const results = await Promise.allSettled(loaders.map((l) => l.load()));
  let docs = results
    .flatMap(r => (r.status === "fulfilled" ? r.value : []))
    .filter(Boolean);

  // Filtrar y limitar ruido
  const MIN_LEN = 300;
  docs = docs
    .filter((d) => (d.pageContent || "").length >= MIN_LEN)
    .map((d) => {
      const src = d.metadata?.source || "";
      // recorte defensivo del contenido
      d.pageContent = d.pageContent.slice(0, 20000);
      return { ...d, metadata: { ...d.metadata, source: src } };
    });

  // De-duplicar por URL
  const seen = new Set();
  docs = docs.filter((d) => {
    const k = d.metadata?.source;
    if (!k) return false;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Priorizar “artículos” por heurística simple y limitar
  const looksArticle = (src) =>
    (src.includes("/lite/") && /\d{4}\/\d{2}\/\d{2}/.test(src)) || // CNN
    (src.includes("/news/") || /\d{4}-\d{2}-\d{2}/.test(src));     // CBC

  const articles = docs.filter((d) => looksArticle(d.metadata.source));
  const rest = docs.filter((d) => !looksArticle(d.metadata.source));

  // toma hasta maxDocs priorizando artículos
  docs = [...articles.slice(0, maxDocs), ...rest.slice(0, Math.max(0, maxDocs - articles.length))];

  console.log(`loadNews -> ${docs.length} documentos`);
  console.timeEnd("loadNews");
  return docs;
}
