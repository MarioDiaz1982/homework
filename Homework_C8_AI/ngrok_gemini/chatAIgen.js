// index.mjs o index.js (con "type":"module" en package.json)
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai"; // ver nota abajo

dotenv.config();

if (!process.env.GROQ_API_KEY || !process.env.GOOGLE_API_KEY) {
  throw new Error("Faltan variables de entorno GROQ_API_KEY / GOOGLE_API_KEY");
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// modelos recomendados
const MODEL_PRIMARY  = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const MODEL_FALLBACK = "llama-3.1-8b-instant";

async function main_groq(input) {
  try {
    const completion = await groq.chat.completions.create({
      model: MODEL_PRIMARY,
      max_completion_tokens: 256, // usa esta clave; 'max_tokens' está deprecado
      messages: [{ role: "user", content: input }],
    });
    const text = completion.choices?.[0]?.message?.content?.trim() ?? "";
    console.log("[GROQ] =>", text);
    return text;
  } catch (err) {
    console.warn("Groq primary model falló:", err?.message || err);
    const completion = await groq.chat.completions.create({
      model: MODEL_FALLBACK,
      max_completion_tokens: 256,
      messages: [{ role: "user", content: input }],
    });
    const text = completion.choices?.[0]?.message?.content?.trim() ?? "";
    console.log("[GROQ:FALLBACK] =>", text);
    return text;
  }
}

async function main_gemini(input) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const prompt = `En base a los siguientes títulos:\n${input}\nGenera 3 subtítulos para cada uno de ellos.`;
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  console.log("[GEMINI] =>", text);
  return text;
}

(async () => {
  try {
    const titulosGroq = await main_groq("Dame 3 títulos de películas de ciencia ficción");
    const subsGemini = await main_gemini(titulosGroq);
    console.log("\n=== Resultado final ===\n", subsGemini);
  } catch (err) {
    console.error("Error:", err?.message || err);
    process.exit(1);
  }
})();
