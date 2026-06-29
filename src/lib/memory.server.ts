// "Cerebro de memoria" (Company Brain) — capa de memoria semántica del asistente.
//
// Cómo funciona, 100% gratis:
//  - Embeddings con Gemini `gemini-embedding-001` (nº1 en MTEB multilingüe → ideal
//    ES/FR). Usa una CUOTA SEPARADA de la de generación de texto, así que NO compite
//    con el límite de 20/día de los modelos de análisis/redacción.
//  - Almacenamiento vectorial en Cloudflare Vectorize (gratis en plan Workers Free).
//
// Cada correo (recibido analizado y enviado) se convierte en un vector y se guarda
// con sus metadatos. Al redactar una respuesta o buscar, recuperamos los correos
// semánticamente más parecidos —aunque sean antiguos— para dar contexto a la IA.
//
// Robustez: pedimos 768 dims (mejor para el límite de almacenamiento de Vectorize) y,
// como red de seguridad, truncamos+normalizamos a 768 en cliente (válido por la
// Matryoshka Representation Learning del modelo) por si la API devolviera 3072.
//
// Degrada con elegancia: si falta la clave Gemini o el binding MEMORY, o falla la
// red, todas las funciones devuelven vacío y la app sigue funcionando igual.

const EMBED_MODEL = "models/gemini-embedding-001";
const EMBED_DIMS = 768;

interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}
interface VectorizeIndex {
  upsert: (vectors: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>) => Promise<unknown>;
  query: (
    vector: number[],
    opts?: { topK?: number; returnMetadata?: boolean | "all" | "indexed"; returnValues?: boolean },
  ) => Promise<{ matches?: VectorizeMatch[] }>;
}

export interface MemoryEnv {
  GEMINI_API_KEY?: string;
  MEMORY?: VectorizeIndex;
  [key: string]: unknown;
}

export interface MemorableEmail {
  id: string;
  sender: string;
  sender_email: string;
  subject: string;
  snippet: string;
  summary?: string | null;
  type?: string | null;
  received_at: number;
  folder?: string | null;
}

export interface MemoryHit {
  id: string;
  score: number;
  sender: string;
  sender_email: string;
  subject: string;
  summary: string;
  type: string;
  folder: string;
  received_at: number;
}

function hasBindings(env: MemoryEnv): env is MemoryEnv & { GEMINI_API_KEY: string; MEMORY: VectorizeIndex } {
  return !!env.GEMINI_API_KEY && !!env.MEMORY;
}

// Trunca a EMBED_DIMS y normaliza (L2). La truncación es válida por MRL; la
// normalización deja el vector listo para similitud coseno.
function normalizeTo(values: number[], dims: number): number[] | null {
  if (!Array.isArray(values) || values.length < dims) return null;
  const v = values.slice(0, dims);
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (!norm || !Number.isFinite(norm)) return null;
  return v.map((x) => x / norm);
}

// Texto compacto y limpio que representa el correo para el embedding.
function emailToText(e: MemorableEmail): string {
  const dir = e.folder === "sent" ? "Enviado a" : "Recibido de";
  const body = (e.summary || e.snippet || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 400);
  return `${dir}: ${e.sender} <${e.sender_email}> | Asunto: ${e.subject} | ${body}`;
}

// Genera embeddings para uno o varios textos vía Gemini batchEmbedContents.
// Devuelve un array de vectores 768-dim normalizados, en el MISMO orden que `texts`.
// Si algún vector no es válido lo deja como null para preservar el orden.
export async function embed(env: MemoryEnv, texts: string[]): Promise<(number[] | null)[]> {
  if (!hasBindings(env) || texts.length === 0) return [];
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${EMBED_MODEL}:batchEmbedContents`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        // No enviamos outputDimensionality (su nombre de campo varía entre REST/SDK y
        // un campo no reconocido daría 400). Pedimos el vector completo (3072) y lo
        // truncamos+normalizamos a 768 en cliente — válido y recomendado por MRL.
        body: JSON.stringify({
          requests: texts.map((t) => ({
            model: EMBED_MODEL,
            content: { parts: [{ text: t.slice(0, 2000) }] },
          })),
        }),
      },
    );
    if (!res.ok) {
      console.error(`[memory.embed] HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);
      return [];
    }
    const data = (await res.json()) as { embeddings?: Array<{ values?: number[] }> };
    const embs = data.embeddings ?? [];
    return texts.map((_, i) => normalizeTo(embs[i]?.values ?? [], EMBED_DIMS));
  } catch (e) {
    console.error(`[memory.embed] ${e}`);
    return [];
  }
}

// Indexa en la memoria los correos dados (upsert por id). Devuelve los IDS indexados
// (los que obtuvieron un vector válido), para que el llamador marque solo esos.
export async function rememberEmails(env: MemoryEnv, emails: MemorableEmail[]): Promise<string[]> {
  if (!hasBindings(env) || emails.length === 0) return [];
  const vectors = await embed(env, emails.map(emailToText));
  const payload = emails
    .map((e, i) => ({ e, v: vectors[i] }))
    .filter((x): x is { e: MemorableEmail; v: number[] } => Array.isArray(x.v))
    .map(({ e, v }) => ({
      id: e.id,
      values: v,
      metadata: {
        sender: e.sender.slice(0, 120),
        sender_email: e.sender_email.slice(0, 160),
        subject: (e.subject || "").slice(0, 200),
        summary: (e.summary || e.snippet || "").slice(0, 300),
        type: e.type || "",
        folder: e.folder || "inbox",
        received_at: e.received_at,
      },
    }));
  if (payload.length === 0) return [];
  try {
    await env.MEMORY.upsert(payload);
    return payload.map((p) => p.id);
  } catch (e) {
    console.error(`[memory.remember] ${e}`);
    return [];
  }
}

// Recupera los correos semánticamente más parecidos a una consulta de texto libre.
export async function recall(
  env: MemoryEnv,
  queryText: string,
  opts: { topK?: number; excludeId?: string; minScore?: number } = {},
): Promise<MemoryHit[]> {
  if (!hasBindings(env) || !queryText.trim()) return [];
  const [vec] = await embed(env, [queryText.slice(0, 1800)]);
  if (!vec) return [];
  const topK = opts.topK ?? 5;
  const minScore = opts.minScore ?? 0.35;
  try {
    const res = await env.MEMORY.query(vec, { topK: topK + 1, returnMetadata: "all" });
    const matches = res.matches ?? [];
    return matches
      .filter((m) => m.id !== opts.excludeId && m.score >= minScore)
      .slice(0, topK)
      .map((m) => {
        const md = m.metadata ?? {};
        return {
          id: m.id,
          score: m.score,
          sender: String(md.sender ?? ""),
          sender_email: String(md.sender_email ?? ""),
          subject: String(md.subject ?? ""),
          summary: String(md.summary ?? ""),
          type: String(md.type ?? ""),
          folder: String(md.folder ?? "inbox"),
          received_at: Number(md.received_at ?? 0),
        };
      });
  } catch (e) {
    console.error(`[memory.recall] ${e}`);
    return [];
  }
}

// Formatea los recuerdos como contexto legible para inyectar en un prompt de IA.
// fr=true → etiquetas en francés. Devuelve "" si no hay recuerdos.
export function formatMemoryContext(hits: MemoryHit[], fr: boolean): string {
  if (hits.length === 0) return "";
  const fmtDate = (ms: number) =>
    ms ? new Date(ms).toLocaleDateString(fr ? "fr-FR" : "es-ES", { day: "2-digit", month: "short", year: "numeric" }) : "";
  const lines = hits.map((h) => {
    const dir = h.folder === "sent" ? (fr ? "Tu as écrit" : "Escribiste tú") : (fr ? "Reçu de" : "Recibido de");
    return `- [${fmtDate(h.received_at)}] ${dir} ${h.sender}: "${h.subject}" — ${h.summary}`;
  });
  return lines.join("\n");
}
