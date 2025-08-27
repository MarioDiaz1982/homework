import 'dotenv/config';

const SERPER_API_KEY = process.env.SERPER_API_KEY;
if (!SERPER_API_KEY) {
  console.warn("[WARN] SERPER_API_KEY no está definido; las búsquedas fallarán.");
}

export async function webSearchSerper(query, maxResults = 5) {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": SERPER_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ q: query, gl: "mx", hl: "es", num: Math.max(5, maxResults) })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Serper error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const organic = Array.isArray(data.organic) ? data.organic : [];
  return organic
    .filter(x => x.link && !x.link.includes("pdf")) // opcional: evita PDFs
    .slice(0, maxResults)
    .map(x => ({
      title: x.title || x.snippet || x.link,
      url: x.link,
      snippet: x.snippet || ""
    }));
}
