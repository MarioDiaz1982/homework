import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

function extractMainFromHtml(html, baseUrl) {
  const dom = new JSDOM(html, { url: baseUrl });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const title = article?.title || dom.window.document.title || baseUrl;
  const text = article?.textContent?.trim() ||
               dom.window.document.body?.textContent?.trim() ||
               "";
  return { title, text };
}

export async function fetchAndExtract(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (Chatbot/1.0)" }});
    const html = await res.text();
    const { title, text } = extractMainFromHtml(html, url);
    // recorte defensivo
    return { url, title, text: text.slice(0, 50_000) };
  } finally {
    clearTimeout(t);
  }
}

export { extractMainFromHtml }; // para tests
