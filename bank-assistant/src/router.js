// src/router.js
import { ROUTER_PROMPT } from "./prompts.js";

/**
 * Clasifica la consulta en:
 *  - "balance": si pide saldo/balance/estado con ID/cédula/cuenta
 *  - "kb":      si pregunta por procesos bancarios (abrir cuenta, transferencias, etc.)
 *  - "general": todo lo demás
 * Intenta extraer un ID (6–12 dígitos) si aparece en el texto.
 */

// Reglas rápidas (fallback si el LLM no clasifica)
const FALLBACK_REGEX = [
  { re: /(saldo|balance|estado).*?(id|c[eé]dula|cuenta|n[úu]mero)/i, route: "balance" },
  { re: /(abrir cuenta|transfer|swift|iban|tarjeta|kyc|comisi[oó]n|plazo|clabe)/i, route: "kb" },
];

/**
 * @param {import("@langchain/groq").ChatGroq} llm  Instancia del LLM (creada en index.js)
 * @param {string} userText Texto de la consulta del usuario
 * @returns {{route: "balance"|"kb"|"general", id: string|null}}
 */
export async function classifyQuery(llm, userText) {
  // 1) Reglas rápidas
  for (const r of FALLBACK_REGEX) {
    if (r.re.test(userText)) return { route: r.route, id: extractId(userText) };
  }

  // 2) Clasificador con LLM (respuesta JSON estricta)
  const messages = [
    { role: "system", content: ROUTER_PROMPT },
    { role: "user", content: userText },
  ];

  try {
    const res = await llm.invoke(messages, { temperature: 0 });
    const json = JSON.parse((res?.content ?? "").trim());
    if (json && json.route) {
      return { route: json.route, id: json.id || extractId(userText) };
    }
  } catch {
    // Ignorar y continuar al fallback
  }

  // 3) Fallback final
  return { route: "general", id: extractId(userText) };
}

function extractId(text) {
  const m = text.match(/\b(\d{6,12})\b/); // 6–12 dígitos
  return m ? m[1] : null;
}
