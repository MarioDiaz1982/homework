// src/kb_index.js
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { TextLoader }      from "langchain/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

import {
  HuggingFaceTransformersEmbeddings,
} from "@langchain/community/embeddings/huggingface_transformers";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { env as HFEnv } from "@huggingface/transformers";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const KB_DIR        = path.resolve(__dirname, "..", "knowledge_base");
const INDEX_DIR     = path.resolve(__dirname, "..", "vector_index");
const HF_CACHE_DIR  = path.resolve(__dirname, "..", ".cache_transformers");

// Flags / tuning por .env
const USE_FAISS  = String(process.env.USE_FAISS ?? "true").toLowerCase() !== "false";
const MAX_CHUNKS = parseInt(process.env.MAX_CHUNKS || "40", 10);   // ← limita volumen
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || "900", 10);
const CHUNK_OVER = parseInt(process.env.CHUNK_OVERLAP || "100", 10);

// Transformers.js estable en Windows/CPU
HFEnv.allowRemoteModels = true;
HFEnv.localModelPath    = HF_CACHE_DIR;
HFEnv.cacheDir          = HF_CACHE_DIR;
HFEnv.backends ??= {};
HFEnv.backends.onnx ??= {};
HFEnv.backends.onnx.wasm ??= {};
HFEnv.backends.onnx.wasm.numThreads = 1;

function faissIndexFilesExist(dir) {
  const required = ["index.faiss", "docstore.json"];
  return fs.existsSync(dir) && required.every(f => fs.existsSync(path.join(dir, f)));
}

function makeEmbeddings() {
  return new HuggingFaceTransformersEmbeddings({
    model: "Xenova/all-MiniLM-L6-v2",
    quantize: true,
    device: "cpu",
  });
}

async function loadDocs() {
  console.log("📂 Leyendo knowledge_base…");
  const loader = new DirectoryLoader(KB_DIR, {
    ".txt": (p) => new TextLoader(p),
    ".md":  (p) => new TextLoader(p),
  });
  const rawDocs = await loader.load();
  console.log(`   → Archivos: ${rawDocs.length}`);

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVER,
  });

  console.time("⏱️ split");
  const chunks = await splitter.splitDocuments(rawDocs);
  console.timeEnd("⏱️ split");
  console.log(`   → Chunks totales: ${chunks.length}`);

  // Limitar a MAX_CHUNKS para que el primer indexado no se eternice
  let sliced = chunks;
  if (chunks.length > MAX_CHUNKS) {
    sliced = chunks.slice(0, MAX_CHUNKS);
    console.log(`   → Limite aplicado: ${MAX_CHUNKS} chunks (recortado de ${chunks.length}).`);
  }
  return sliced;
}

export async function buildOrLoadVectorStore({ reindex = false } = {}) {
  if (!fs.existsSync(KB_DIR)) {
    throw new Error(`No existe la carpeta knowledge_base en: ${KB_DIR}`);
  }
  if (!fs.existsSync(HF_CACHE_DIR)) {
    fs.mkdirSync(HF_CACHE_DIR, { recursive: true });
  }

  const embeddings = makeEmbeddings();

  // Warm-up (descarga/carga del modelo y muestra progreso)
  try {
    console.log("🧠 Cargando modelo de embeddings (warm-up)...");
    const v = await embeddings.embedQuery("warmup");
    console.log(`✅ Modelo listo (dim=${v.length}). Cache: ${HF_CACHE_DIR}`);
  } catch (e) {
    console.warn("⚠️ Falló warm-up de embeddings:", e?.message || e);
  }

  // Import dinámico FAISS
  let FaissStore = null;
  if (USE_FAISS) {
    try {
      ({ FaissStore } = await import("@langchain/community/vectorstores/faiss"));
    } catch (e) {
      console.warn("⚠️ FAISS no disponible (import falló):", e?.message || e);
    }
  } else {
    console.log("ℹ️ USE_FAISS=false → sólo índice en memoria.");
  }

  // Cargar FAISS si existe completo y no se fuerza rebuild
  if (USE_FAISS && FaissStore && !reindex && faissIndexFilesExist(INDEX_DIR)) {
    try {
      console.log("📦 Cargando índice FAISS desde disco…");
      const store = await FaissStore.load(INDEX_DIR, embeddings);
      console.log("✅ FAISS cargado");
      return store;
    } catch (e) {
      console.warn("⚠️ No se pudo cargar FAISS:", e?.message || e);
      console.warn("→ Se intentará construir; si falla, usaré memoria.");
    }
  } else if (USE_FAISS && FaissStore && !reindex && !faissIndexFilesExist(INDEX_DIR)) {
    console.log("ℹ️ No hay índice FAISS completo en disco; se construirá uno nuevo.");
  }

  // Construir desde documentos (limitados)
  console.log("🧱 Construyendo índice (puede tardar la 1ª vez)...");
  const docs = await loadDocs();
  if (!docs.length) {
    console.warn("⚠️ KB vacía. Se agrega placeholder para no romper.");
    docs.push({ pageContent: "(KB vacía)", metadata: { source: "kb/placeholder" } });
  }

  // Intentar FAISS
  if (USE_FAISS && FaissStore) {
    try {
      console.time("⏱️ embeddings+FAISS");
      const store = await FaissStore.fromDocuments(docs, embeddings);
      console.timeEnd("⏱️ embeddings+FAISS");

      try {
        if (!fs.existsSync(INDEX_DIR)) fs.mkdirSync(INDEX_DIR, { recursive: true });
        await store.save(INDEX_DIR);
        console.log("💾 FAISS guardado en:", INDEX_DIR);
      } catch (e) {
        console.warn("⚠️ No se pudo guardar FAISS a disco:", e?.message || e);
      }
      console.log("✅ Índice FAISS listo");
      return store;
    } catch (e) {
      console.warn("⚠️ Construcción de FAISS falló:", e?.message || e);
      console.warn("→ Fallback a MemoryVectorStore (no persistente).");
    }
  }

  // Fallback: vector store en memoria
  console.time("⏱️ embeddings+MEM");
  const mem = await MemoryVectorStore.fromDocuments(docs, embeddings);
  console.timeEnd("⏱️ embeddings+MEM");
  console.log("✅ Índice en memoria listo (sin persistencia)");
  return mem;
}

export async function getKbRetriever({ k = 4, reindex = false } = {}) {
  const store = await buildOrLoadVectorStore({ reindex });
  return store.asRetriever({ k });
}

// CLI: npm run reindex
if (process.argv.includes("--reindex")) {
  buildOrLoadVectorStore({ reindex: true })
    .then(() => console.log(`✅ Índice listo (FAISS si disponible; si no, memoria). Carpeta: ${INDEX_DIR}`))
    .catch((e) => {
      console.error("❌ Error al reindexar:", e?.stack || e);
      process.exit(1);
    });
}
