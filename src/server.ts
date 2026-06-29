import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  handleGmailStart,
  handleGmailCallback,
  handleGmailStatus,
  handleGmailDisconnect,
  type GmailEnv,
} from "./lib/gmail-oauth.server";
import { syncRecentEmails, syncSentEmails, listEmails, listSent } from "./lib/gmail-api.server";
import { getEmailDetail } from "./lib/gmail-message.server";
import { archiveEmail, trashEmail, spamEmail, markRead, sendReply, sendNew } from "./lib/gmail-actions.server";
import { extractDocument } from "./lib/doc-extract.server";
import { analyzeBatch, generateReply, answerInboxQuestion, assistantChat, type AiEnv } from "./lib/ai-analyze.server";
import { applyRules, learnRule } from "./lib/rules.server";
import { localSearch } from "./lib/local-search.server";
import { rememberEmails, recall, formatMemoryContext, type MemoryEnv, type MemorableEmail } from "./lib/memory.server";
import {
  isAuthenticated,
  handleLogin,
  handleLogout,
  unauthorized,
  changePassword,
  hasCustomPassword,
  generateRecovery,
  type AuthEnv,
} from "./lib/auth.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function emptyApiResponseWithoutDb(pathname: string, method: string, env: Record<string, unknown>): Response | null {
  if (pathname === "/api/gmail/status") {
    return Response.json({ connected: false, provider: null, email: null });
  }
  if (pathname === "/api/gmail/disconnect" && method === "POST") {
    return Response.json({ connected: false });
  }
  if (pathname === "/api/gmail/sync" && method === "POST") {
    return Response.json({ synced: 0 });
  }
  if (pathname === "/api/inbox/list" || pathname === "/api/inbox/sent") {
    return Response.json({ emails: [] });
  }
  if (pathname === "/api/inbox/ask" && method === "POST") {
    return Response.json({ answer: "No hay correos disponibles todavía.", related: [], source: "local" });
  }
  if (pathname === "/api/waiting") {
    return Response.json({ fromOthers: [], fromMe: [] });
  }
  if (pathname === "/api/risks") {
    return Response.json({ risks: [], opportunities: [], silences: [] });
  }
  if (pathname === "/api/agenda") {
    return Response.json({ events: [] });
  }
  if (pathname === "/api/today") {
    return Response.json({
      total: 0,
      todayCount: 0,
      counts: {},
      important: [],
      attention: [],
      pending: [],
      robot: { lastRunAt: null, runsToday: 0, syncedToday: 0, ruledToday: 0, aiToday: 0 },
    });
  }
  if (pathname === "/api/control") {
    return Response.json({
      total: 0,
      suspicious: 0,
      rulesLearned: 0,
      freePct: 0,
      byType: [],
      classified: { rule: 0, ai: 0, manual: 0, none: 0 },
      robot: { lastRunAt: null, totalRuns: 0, totalSynced: 0, totalRuled: 0, totalAi: 0, recentRuns: [] },
      topRules: [],
    });
  }
  if (pathname === "/api/config") {
    return Response.json(method === "GET" ? { autoArchive: {} } : { ok: true });
  }
  if (pathname === "/api/ai/chat" && method === "POST") {
    return Response.json({ answer: "No hay correos disponibles todavía." });
  }
  if (pathname === "/api/contact") {
    const email = new URL(`https://local${pathname}`).searchParams.get("email") ?? "";
    return Response.json({ email, total: 0, firstAt: null, lastAt: null, recent: [], promises: [], negative: false });
  }
  if (/^\/api\/email\/[^/]+$/.test(pathname) && method === "GET") {
    return new Response("Not found", { status: 404 });
  }
  if (/^\/api\/email\/[^/]+\/(archive|trash|spam|read|type|reply)$/.test(pathname) && method === "POST") {
    return Response.json({ ok: false });
  }
  if (/^\/api\/email\/[^/]+\/draft$/.test(pathname) && method === "POST") {
    return Response.json({ draft: null }, { status: 404 });
  }
  if (pathname === "/api/email/bulk" && method === "POST") {
    return Response.json({ done: 0 });
  }
  if (pathname === "/api/email/send" && method === "POST") {
    return Response.json({ ok: false });
  }
  if (pathname === "/api/inbox/diagnose" && method === "POST") {
    const aiEnv = env as AiEnv;
    return Response.json({
      hasKey: !!aiEnv.GEMINI_API_KEY,
      keyPrefix: aiEnv.GEMINI_API_KEY?.substring(0, 8) ?? "none",
      geminiStatus: "not_tested",
      geminiError: "",
      pendingEmails: 0,
    });
  }
  if (pathname === "/api/inbox/reset-analysis" && method === "POST") {
    return Response.json({ reset: 0 });
  }
  if (pathname === "/api/inbox/analyze" && method === "POST") {
    return Response.json({ analyzed: 0, pending: 0, ruled: 0, engines: [], embedded: 0 });
  }
  if (pathname === "/api/memory/backfill" && method === "POST") {
    return Response.json({ embedded: 0 });
  }
  if (pathname === "/api/memory/stats") {
    const memEnv = env as MemoryEnv & AiEnv;
    return Response.json({ total: 0, embedded: 0, enabled: !!memEnv.MEMORY && !!memEnv.GEMINI_API_KEY });
  }
  return null;
}

// Indexa en la memoria (Vectorize) los correos que aún no estén indexados:
// correos de bandeja ya analizados + correos enviados. Marca embedded_at al terminar.
// Devuelve cuántos se indexaron. Nunca lanza: si no hay bindings o falla, devuelve 0.
async function embedPending(env: GmailEnv & MemoryEnv, limit = 30): Promise<number> {
  if (!env.GEMINI_API_KEY || !env.MEMORY) return 0;
  const { results } = await env.DB.prepare(
    `SELECT id, sender, sender_email, subject, snippet, summary, type, received_at, folder
       FROM email
      WHERE embedded_at IS NULL
        AND (folder = 'sent' OR analyzed_at IS NOT NULL)
      ORDER BY received_at DESC LIMIT ?`,
  ).bind(limit).all<MemorableEmail>();
  if (results.length === 0) return 0;
  const BATCH = 20;
  let total = 0;
  for (let i = 0; i < results.length; i += BATCH) {
    const batch = results.slice(i, i + BATCH);
    const ids = await rememberEmails(env, batch);
    if (ids.length > 0) {
      const now = Date.now();
      // Marca como indexados SOLO los que obtuvieron vector válido.
      for (const id of ids) {
        await env.DB.prepare("UPDATE email SET embedded_at = ? WHERE id = ?").bind(now, id).run();
      }
      total += ids.length;
    }
  }
  return total;
}

// Sincroniza y analiza correos pendientes. Reutilizado por el endpoint y por el cron.
// Auto-acciones: lee qué categorías deben auto-archivarse (config en app_config).
async function getAutoArchiveSet(db: GmailEnv["DB"]): Promise<Set<string>> {
  try {
    const { results } = await db.prepare("SELECT key FROM app_config WHERE key LIKE 'auto_archive_%' AND value = 'true'").all<{ key: string }>();
    return new Set(results.map((r) => r.key.replace("auto_archive_", "")));
  } catch { return new Set(); }
}

async function syncAndAnalyze(env: GmailEnv & AiEnv & MemoryEnv, trigger: string = "cron"): Promise<{ synced: number; analyzed: number; ruled: number; autoArchived: number; embedded: number }> {
  const startedAt = Date.now();
  const synced = await syncRecentEmails(env);
  await syncSentEmails(env);
  const db = env.DB;
  const { results: pendingAll } = await db.prepare(
    "SELECT id, sender, sender_email, subject, snippet FROM email WHERE analyzed_at IS NULL AND (folder = 'inbox' OR folder IS NULL) LIMIT 50",
  ).all<{ id: string; sender: string; sender_email: string | null; subject: string; snippet: string }>();
  let ruledCount = 0;
  let aiCount = 0;
  let autoArchived = 0;
  const autoArchive = await getAutoArchiveSet(db);

  // Auto-acción: archiva el correo si su categoría está marcada para auto-archivar.
  const maybeAutoArchive = async (id: string, type: string) => {
    if (!autoArchive.has(type)) return;
    if (await archiveEmail(env, id)) { await db.prepare("DELETE FROM email WHERE id=?").bind(id).run(); autoArchived++; }
  };

  // 1) Robots que aprenden: aplica reglas (0 tokens) antes de gastar IA.
  const ruled = await applyRules(env, pendingAll);
  if (ruled.size > 0) {
    const now = Date.now();
    for (const email of pendingAll) {
      const t = ruled.get(email.id);
      if (!t) continue;
      await db.prepare(
        `UPDATE email SET type=?, summary=COALESCE(summary, ?), effort=COALESCE(effort,'quick'), classified_by='rule', analyzed_at=? WHERE id=?`,
      ).bind(t, "Clasificado por una regla aprendida (sin IA).", now, email.id).run();
      ruledCount++;
      await maybeAutoArchive(email.id, t);
    }
  }
  // 2) El resto (sin regla) va a la IA.
  const pending = pendingAll.filter((e) => !ruled.has(e.id));
  const BATCH = 8;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const { results } = await analyzeBatch(env, batch);
    const byId = new Map(results.map((r) => [String(r.id), r]));
    for (const email of batch) {
      const r = byId.get(String(email.id));
      if (!r || !r.type || !r.summary || !r.effort) continue;
      await db.prepare(
        `UPDATE email SET type=?, summary=?, promise=?, tone_warning=?, effort=?, classified_by='ai', analyzed_at=? WHERE id=?`,
      ).bind(r.type, r.summary, r.promise ?? null, r.tone_warning ?? null, r.effort, Date.now(), email.id).run();
      aiCount++;
      await maybeAutoArchive(email.id, r.type);
    }
  }
  const analyzed = ruledCount + aiCount;
  // Alimenta el cerebro de memoria con lo nuevo (analizados + enviados).
  let embedded = 0;
  try {
    embedded = await embedPending(env);
  } catch (e) {
    console.error(`[embedPending] ${e}`);
  }
  // Robot manager: registra esta ejecución para el centro de control.
  try {
    await db.prepare(
      `INSERT INTO robot_runs (ran_at, trigger, synced, ruled, ai_analyzed, embedded, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(Date.now(), trigger, synced, ruledCount, aiCount, embedded, Date.now() - startedAt).run();
  } catch (e) {
    console.error(`[robot_runs] ${e}`);
  }
  return { synced, analyzed, ruled: ruledCount, autoArchived, embedded };
}

export default {
  // Cron: sincroniza y analiza automáticamente sin intervención del usuario.
  async scheduled(_event: unknown, env: unknown, _ctx: unknown) {
    try {
      const result = await syncAndAnalyze(env as GmailEnv & AiEnv & MemoryEnv);
      console.log(`[Cron] sync=${result.synced} analyzed=${result.analyzed} embedded=${result.embedded}`);
    } catch (e) {
      console.error(`[Cron] error: ${e}`);
    }
  },

  async fetch(request: Request, envParam: unknown, ctx: unknown) {
    // En dev sin .dev.vars, env puede llegar como undefined: garantizamos un objeto.
    const env: Record<string, unknown> = (envParam ?? {}) as Record<string, unknown>;
    // Rutas API propias (OAuth de Gmail), manejadas antes del renderizado SSR.
    const pathname = new URL(request.url).pathname;
    const combinedEnv = env as unknown as GmailEnv & AuthEnv;

    // Rutas de auth — siempre públicas (sin cookie todavía).
    if (pathname === "/api/auth/login" && request.method === "POST")
      return handleLogin(request, combinedEnv);
    if (pathname === "/api/auth/logout" && request.method === "POST")
      return handleLogout(request);

    // OAuth de Gmail — el callback debe ser accesible sin sesión (viene de Google).
    if (pathname === "/api/gmail/start") return handleGmailStart(request, combinedEnv);
    if (pathname === "/api/gmail/callback") return handleGmailCallback(request, combinedEnv);

    // Todas las demás rutas /api/* requieren sesión válida.
    if (pathname.startsWith("/api/")) {
      if (!(await isAuthenticated(request, combinedEnv))) return unauthorized();

      if (!combinedEnv.DB) {
        const emptyResponse = emptyApiResponseWithoutDb(pathname, request.method, env);
        if (emptyResponse) return emptyResponse;
      }

      // Auth gestionada (cambiar PIN / recuperación / estado)
      if (pathname === "/api/auth/has-password") {
        return Response.json({ hasCustom: await hasCustomPassword(combinedEnv) });
      }
      if (pathname === "/api/auth/change-password" && request.method === "POST") {
        const { oldPassword, newPassword } = await request.json() as { oldPassword: string; newPassword: string };
        const res = await changePassword(combinedEnv, oldPassword, newPassword);
        return Response.json(res, { status: res.ok ? 200 : 400 });
      }
      if (pathname === "/api/auth/recovery" && request.method === "POST") {
        const code = await generateRecovery(combinedEnv);
        return Response.json({ code });
      }
      if (pathname === "/api/gmail/status") return handleGmailStatus(request, combinedEnv);
      if (pathname === "/api/gmail/disconnect" && request.method === "POST")
        return handleGmailDisconnect(request, combinedEnv);
      if (pathname === "/api/gmail/sync" && request.method === "POST") {
        const synced = await syncRecentEmails(combinedEnv);
        await syncSentEmails(combinedEnv);
        return Response.json({ synced });
      }
      if (pathname === "/api/inbox/sent") {
        const emails = await listSent(combinedEnv);
        return Response.json({ emails });
      }
      if (pathname === "/api/inbox/list") {
        const emails = await listEmails(combinedEnv);
        return Response.json({ emails });
      }
      // GET /api/ai/status — VALIDA de verdad que las claves funcionan (llamada real),
      // no solo que existan. .trim() por si el secreto trae espacios/BOM invisibles.
      if (pathname === "/api/ai/status") {
        const aiEnv = env as AiEnv;
        const g = aiEnv.GEMINI_API_KEY?.trim();
        const q = aiEnv.GROQ_API_KEY?.trim();
        const safe = async (fn: () => Promise<boolean>) => { try { return await fn(); } catch { return false; } };
        const [gemini, groq] = await Promise.all([
          safe(async () => !!g && (await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash", { headers: { "x-goog-api-key": g } })).ok),
          safe(async () => !!q && (await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${q}` } })).ok),
        ]);
        return Response.json({ gemini, groq });
      }
      // POST /api/documents/extract — extrae datos de un PDF/imagen con IA multimodal
      if (pathname === "/api/documents/extract" && request.method === "POST") {
        const { mimeType, dataBase64 } = await request.json() as { mimeType: string; dataBase64: string };
        const result = await extractDocument(env as AiEnv, { mimeType, dataBase64 });
        return Response.json({ result });
      }
      // POST /api/inbox/ask — pregunta en lenguaje natural sobre la bandeja
      if (pathname === "/api/inbox/ask" && request.method === "POST") {
        const { question, lang } = await request.json() as { question: string; lang?: string };
        const uiLang = lang === "fr" ? "fr" : "es";
        const db = combinedEnv.DB as GmailEnv["DB"];
        const { results } = await db.prepare(
          `SELECT id, sender, subject, summary, snippet, type, promise, tone_warning, received_at FROM email ORDER BY received_at DESC LIMIT 40`,
        ).all<{ id: string; sender: string; subject: string; summary: string | null; snippet: string; type: string | null; promise: string | null; tone_warning: string | null; received_at: number }>();

        // Local-first: intenta resolver sin IA. Solo llama a la IA si es semántico.
        const local = localSearch(question, results, uiLang);
        let answer: string;
        let matches: number[];
        let source: "local" | "ia";
        if (local) {
          answer = local.answer;
          matches = local.matchIds;
          source = "local";
        } else {
          const r = await answerInboxQuestion(env as AiEnv, question, results, uiLang);
          answer = r.answer;
          matches = r.matches;
          source = "ia";
        }
        const related = matches
          .map((n) => results[n - 1])
          .filter(Boolean)
          .map((e) => ({ id: e.id, sender: e.sender, subject: e.subject, summary: e.summary || e.snippet, received_at: e.received_at }));
        return Response.json({ answer, related, source });
      }
      // GET /api/waiting — compromisos reales (espero de otros / esperan de mí)
      if (pathname === "/api/waiting") {
        const db = combinedEnv.DB as GmailEnv["DB"];
        const { results } = await db.prepare(
          `SELECT id, sender, sender_email, subject, summary, snippet, promise, type, received_at
           FROM email ORDER BY received_at DESC`,
        ).all<{ id: string; sender: string; sender_email: string; subject: string; summary: string | null; snippet: string | null; promise: string | null; type: string | null; received_at: number }>();
        const fromOthers = results.filter((r) => r.promise).map((r) => ({
          id: r.id, person: r.sender, email: r.sender_email, what: r.promise, subject: r.subject, preview: r.snippet || r.summary || "", received_at: r.received_at,
        }));
        const fromMe = results.filter((r) => ["Importante", "Tramites", "Citas"].includes(r.type ?? "")).map((r) => ({
          id: r.id, person: r.sender, email: r.sender_email, what: r.summary || r.subject, subject: r.subject, preview: r.snippet || r.summary || "", type: r.type, received_at: r.received_at,
        }));
        return Response.json({ fromOthers, fromMe });
      }
      // GET /api/risks — radar real (riesgos / oportunidades / silencios)
      if (pathname === "/api/risks") {
        const db = combinedEnv.DB as GmailEnv["DB"];
        const { results } = await db.prepare(
          `SELECT id, sender, sender_email, subject, summary, promise, tone_warning, type, received_at
           FROM email ORDER BY received_at DESC`,
        ).all<{ id: string; sender: string; sender_email: string; subject: string; summary: string | null; promise: string | null; tone_warning: string | null; type: string | null; received_at: number }>();
        // Atención: posible phishing/estafa o tono manipulador/amenazante.
        const risks = results.filter((r) => r.tone_warning || r.type === "Sospechoso").map((r) => ({
          id: r.id, sender: r.sender, subject: r.subject, summary: r.summary, tone_warning: r.tone_warning, type: r.type, received_at: r.received_at,
        }));
        // Pendientes: trámites/facturas (posibles vencimientos) o correos con plazo (promise).
        const opportunities = results.filter((r) => r.type === "Tramites" || r.promise).slice(0, 10).map((r) => ({
          id: r.id, sender: r.sender, subject: r.subject, summary: r.summary, received_at: r.received_at,
        }));
        // Importantes sin atender: los más antiguos aún en bandeja.
        const silences = results.filter((r) => r.type === "Importante")
          .sort((a, b) => a.received_at - b.received_at).slice(0, 6).map((r) => ({
            id: r.id, sender: r.sender, subject: r.subject, summary: r.summary, received_at: r.received_at,
          }));
        return Response.json({ risks, opportunities, silences });
      }
      // GET /api/agenda — eventos reales (promesas, urgentes, reclamaciones) con su fecha
      if (pathname === "/api/agenda") {
        const db = combinedEnv.DB as GmailEnv["DB"];
        const { results } = await db.prepare(
          `SELECT id, sender, subject, summary, promise, type, received_at FROM email
           WHERE promise IS NOT NULL OR type IN ('Citas','Tramites') ORDER BY received_at DESC LIMIT 40`,
        ).all<{ id: string; sender: string; subject: string; summary: string | null; promise: string | null; type: string | null; received_at: number }>();
        const events = results.map((r) => {
          if (r.promise) {
            return { id: r.id, type: "promise", status: "warn", title: r.promise, source: r.sender, dateMs: r.received_at };
          }
          if (r.type === "Citas") {
            return { id: r.id, type: "followup", status: "ok", title: r.summary || r.subject, source: r.sender, dateMs: r.received_at };
          }
          return { id: r.id, type: "followup", status: "warn", title: r.summary || r.subject, source: r.sender, dateMs: r.received_at };
        });
        return Response.json({ events });
      }
      // GET /api/today — briefing real agregado desde D1
      if (pathname === "/api/today") {
        if (!combinedEnv.DB) {
          return Response.json({
            total: 0,
            todayCount: 0,
            counts: {},
            important: [],
            attention: [],
            pending: [],
            robot: { lastRunAt: null, runsToday: 0, syncedToday: 0, ruledToday: 0, aiToday: 0 },
          });
        }
        const db = combinedEnv.DB as GmailEnv["DB"];
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const dayMs = startOfDay.getTime();
        const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
        const { results } = await db.prepare(
          `SELECT id, type, tone_warning, promise, sender, subject, summary, snippet, received_at
           FROM email WHERE folder = 'inbox' OR folder IS NULL ORDER BY received_at DESC`,
        ).all<{ id: string; type: string | null; tone_warning: string | null; promise: string | null; sender: string; subject: string; summary: string | null; snippet: string; received_at: number }>();

        const counts: Record<string, number> = {};
        for (const r of results) { const k = r.type ?? "sinClasificar"; counts[k] = (counts[k] ?? 0) + 1; }
        const todayCount = results.filter((r) => r.received_at >= dayMs).length;
        const important = results.filter((r) => r.type === "Importante").slice(0, 6)
          .map((r) => ({ id: r.id, sender: r.sender, subject: r.subject, summary: r.summary || r.snippet }));
        const attention = results.filter((r) => r.type === "Sospechoso" || r.tone_warning).slice(0, 6)
          .map((r) => ({ id: r.id, sender: r.sender, subject: r.subject, reason: r.type === "Sospechoso" ? "phishing" : "tono" }));
        // Sin responder DE VERDAD: importantes recientes a los que NO has enviado
        // ninguna respuesta posterior (se cruza con la carpeta de enviados).
        const { results: pending } = await db.prepare(
          `SELECT e.id, e.sender, e.subject, e.received_at
           FROM email e
           WHERE (e.folder='inbox' OR e.folder IS NULL) AND e.type='Importante' AND e.received_at >= ?
             AND NOT EXISTS (
               SELECT 1 FROM email s
               WHERE s.folder='sent' AND lower(s.sender_email) = lower(e.sender_email) AND s.received_at > e.received_at
             )
           ORDER BY e.received_at DESC LIMIT 6`,
        ).bind(weekAgo).all<{ id: string; sender: string; subject: string; received_at: number }>();

        const { results: runs } = await db.prepare(
          "SELECT synced, ruled, ai_analyzed FROM robot_runs WHERE ran_at >= ?",
        ).bind(dayMs).all<{ synced: number; ruled: number; ai_analyzed: number }>();
        const lastRunRow = await db.prepare("SELECT ran_at FROM robot_runs ORDER BY ran_at DESC LIMIT 1").first<{ ran_at: number }>();
        const robot = {
          lastRunAt: lastRunRow?.ran_at ?? null,
          runsToday: runs.length,
          syncedToday: runs.reduce((s, r) => s + r.synced, 0),
          ruledToday: runs.reduce((s, r) => s + r.ruled, 0),
          aiToday: runs.reduce((s, r) => s + r.ai_analyzed, 0),
        };

        return Response.json({ total: results.length, todayCount, counts, important, attention, pending, robot });
      }
      // GET /api/control — datos del centro de control (categorías, ahorro de IA, reglas)
      if (pathname === "/api/control") {
        const db = combinedEnv.DB as GmailEnv["DB"];
        const { results: byType } = await db.prepare(
          `SELECT COALESCE(type,'(sin clasificar)') AS type, COUNT(*) AS n
           FROM email WHERE folder = 'inbox' OR folder IS NULL GROUP BY type`,
        ).all<{ type: string; n: number }>();
        const { results: byClass } = await db.prepare(
          `SELECT COALESCE(classified_by,'none') AS c, COUNT(*) AS n
           FROM email WHERE folder = 'inbox' OR folder IS NULL GROUP BY classified_by`,
        ).all<{ c: string; n: number }>();
        const rulesRow = await db.prepare("SELECT COUNT(*) AS n FROM router_rules").first<{ n: number }>();
        const total = byType.reduce((s, r) => s + r.n, 0);
        const suspicious = byType.find((r) => r.type === "Sospechoso")?.n ?? 0;
        const classMap: Record<string, number> = Object.fromEntries(byClass.map((r) => [r.c, r.n]));
        const ruleN = classMap.rule ?? 0;
        const aiN = classMap.ai ?? 0;
        const manualN = classMap.manual ?? 0;
        const freePct = ruleN + aiN > 0 ? Math.round((ruleN / (ruleN + aiN)) * 100) : 0;
        // Actividad del robot manager (últimas ejecuciones del orquestador).
        const { results: recentRuns } = await db.prepare(
          `SELECT ran_at, trigger, synced, ruled, ai_analyzed, embedded, duration_ms
           FROM robot_runs ORDER BY ran_at DESC LIMIT 8`,
        ).all<{ ran_at: number; trigger: string; synced: number; ruled: number; ai_analyzed: number; embedded: number; duration_ms: number }>();
        const runTot = await db.prepare(
          "SELECT COUNT(*) AS runs, COALESCE(SUM(synced),0) AS synced, COALESCE(SUM(ruled),0) AS ruled, COALESCE(SUM(ai_analyzed),0) AS ai FROM robot_runs",
        ).first<{ runs: number; synced: number; ruled: number; ai: number }>();
        // Reglas aprendidas (top por uso) para mostrarlas en el panel.
        const { results: topRules } = await db.prepare(
          "SELECT pattern, email_type, hits FROM router_rules ORDER BY hits DESC, updated_at DESC LIMIT 10",
        ).all<{ pattern: string; email_type: string; hits: number }>();
        return Response.json({
          total,
          suspicious,
          rulesLearned: rulesRow?.n ?? 0,
          freePct,
          byType,
          classified: { rule: ruleN, ai: aiN, manual: manualN, none: classMap.none ?? 0 },
          robot: {
            lastRunAt: recentRuns[0]?.ran_at ?? null,
            totalRuns: runTot?.runs ?? 0,
            totalSynced: runTot?.synced ?? 0,
            totalRuled: runTot?.ruled ?? 0,
            totalAi: runTot?.ai ?? 0,
            recentRuns,
          },
          topRules,
        });
      }
      // GET/POST /api/config — preferencias (auto-archivar categorías)
      if (pathname === "/api/config" && request.method === "GET") {
        const db = combinedEnv.DB as GmailEnv["DB"];
        const { results } = await db.prepare("SELECT key, value FROM app_config WHERE key LIKE 'auto_archive_%'").all<{ key: string; value: string }>();
        const autoArchive: Record<string, boolean> = {};
        for (const r of results) autoArchive[r.key.replace("auto_archive_", "")] = r.value === "true";
        return Response.json({ autoArchive });
      }
      if (pathname === "/api/config" && request.method === "POST") {
        const { category, enabled } = await request.json() as { category: string; enabled: boolean };
        const db = combinedEnv.DB as GmailEnv["DB"];
        await db.prepare(
          "INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        ).bind(`auto_archive_${category}`, enabled ? "true" : "false").run();
        return Response.json({ ok: true });
      }

      // POST /api/ai/chat — chatbot personal que CONSULTA y ACTÚA (Groq tool-calling).
      // Si no hay Groq, cae a respuesta de texto con Gemini (assistantChat).
      if (pathname === "/api/ai/chat" && request.method === "POST") {
        const { messages, lang } = await request.json() as { messages: { role: string; content: string }[]; lang?: string };
        const db = combinedEnv.DB as GmailEnv["DB"];
        const groqKey = (combinedEnv as AiEnv).GROQ_API_KEY?.trim();
        const isFr = lang === "fr";

        // Sin Groq → respuesta de solo texto con contexto (Gemini).
        if (!groqKey) {
          const { results } = await db.prepare(
            `SELECT sender, subject, summary, snippet, type FROM email WHERE folder='inbox' OR folder IS NULL ORDER BY received_at DESC LIMIT 30`,
          ).all<{ sender: string; subject: string; summary: string | null; snippet: string; type: string | null }>();
          const ctx = results.map((e, i) => `${i + 1}. [${e.type ?? "?"}] ${e.sender}: ${e.subject} — ${e.summary || e.snippet}`).join("\n");
          const answer = await assistantChat(combinedEnv as AiEnv, messages ?? [], ctx, isFr ? "fr" : "es");
          return Response.json({ answer: answer ?? (isFr ? "Je n'ai pas pu répondre." : "No he podido responder.") });
        }

        const CATS = "Importante, Tramites, Citas, Suscripciones, Promociones, Notificaciones, Sospechoso";
        const TOOLS = [
          { type: "function", function: { name: "list_emails", description: "Lista correos recientes de la bandeja, opcionalmente filtrados por categoría.", parameters: { type: "object", properties: { category: { type: "string", description: `Categoría a filtrar (una de: ${CATS}). Opcional.` }, limit: { type: "number" } } } } },
          { type: "function", function: { name: "counts", description: "Devuelve cuántos correos hay por categoría en la bandeja.", parameters: { type: "object", properties: {} } } },
          { type: "function", function: { name: "archive_by_category", description: "Archiva TODOS los correos de una categoría (los saca de la bandeja).", parameters: { type: "object", properties: { category: { type: "string" } }, required: ["category"] } } },
          { type: "function", function: { name: "archive_email", description: "Archiva un correo concreto por su id.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } },
          { type: "function", function: { name: "set_category", description: "Cambia la categoría de un correo (y enseña una regla para su remitente).", parameters: { type: "object", properties: { id: { type: "string" }, category: { type: "string" } }, required: ["id", "category"] } } },
        ];

        const execTool = async (name: string, args: any): Promise<string> => {
          try {
            if (name === "list_emails") {
              const lim = Math.min(Number(args.limit) || 20, 40);
              const rows = args.category
                ? (await db.prepare("SELECT id, sender, subject, type FROM email WHERE (folder='inbox' OR folder IS NULL) AND type=? ORDER BY received_at DESC LIMIT ?").bind(args.category, lim).all<any>()).results
                : (await db.prepare("SELECT id, sender, subject, type FROM email WHERE folder='inbox' OR folder IS NULL ORDER BY received_at DESC LIMIT ?").bind(lim).all<any>()).results;
              return JSON.stringify(rows);
            }
            if (name === "counts") {
              const { results } = await db.prepare("SELECT COALESCE(type,'(sin clasificar)') AS type, COUNT(*) AS n FROM email WHERE folder='inbox' OR folder IS NULL GROUP BY type").all<any>();
              return JSON.stringify(results);
            }
            if (name === "archive_by_category") {
              const { results } = await db.prepare("SELECT id FROM email WHERE (folder='inbox' OR folder IS NULL) AND type=?").bind(args.category).all<{ id: string }>();
              let n = 0;
              for (const r of results) { if (await archiveEmail(combinedEnv as GmailEnv, r.id)) { await db.prepare("DELETE FROM email WHERE id=?").bind(r.id).run(); n++; } }
              return JSON.stringify({ archived: n, category: args.category });
            }
            if (name === "archive_email") {
              const ok = await archiveEmail(combinedEnv as GmailEnv, args.id);
              if (ok) await db.prepare("DELETE FROM email WHERE id=?").bind(args.id).run();
              return JSON.stringify({ ok });
            }
            if (name === "set_category") {
              await db.prepare("UPDATE email SET type=?, classified_by='manual' WHERE id=?").bind(args.category, args.id).run();
              const row = await db.prepare("SELECT sender_email FROM email WHERE id=?").bind(args.id).first<{ sender_email: string | null }>();
              await learnRule({ DB: db }, row?.sender_email, args.category);
              return JSON.stringify({ ok: true });
            }
            return JSON.stringify({ error: "tool desconocida" });
          } catch (e) {
            return JSON.stringify({ error: String(e) });
          }
        };

        const sys = {
          role: "system",
          content: `Eres el asistente personal de una bandeja de correo. Puedes CONSULTAR y ACTUAR (archivar, reclasificar) con las herramientas. Responde de forma breve y natural en ${isFr ? "francés" : "español"}. Confirma lo que haces. Antes de archivar muchos correos, dilo. Categorías válidas: ${CATS}.`,
        };
        const msgs: any[] = [sys, ...(messages ?? [])];
        const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
        let modelIdx = 0;
        for (let i = 0; i < 6; i++) {
          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
            body: JSON.stringify({ model: GROQ_MODELS[modelIdx] ?? GROQ_MODELS[0], messages: msgs, tools: TOOLS, tool_choice: "auto", temperature: 0.2, max_tokens: 800 }),
          });
          if (res.status === 429 && modelIdx < GROQ_MODELS.length - 1) { modelIdx++; continue; }
          if (!res.ok) return Response.json({ answer: isFr ? "Erreur de l'IA, réessaie." : "Error de la IA, inténtalo de nuevo." });
          const data = await res.json() as any;
          const msg = data.choices?.[0]?.message;
          if (!msg) break;
          msgs.push(msg);
          if (!msg.tool_calls || msg.tool_calls.length === 0) {
            return Response.json({ answer: msg.content || (isFr ? "C'est fait." : "Hecho.") });
          }
          for (const tc of msg.tool_calls) {
            const result = await execTool(tc.function.name, JSON.parse(tc.function.arguments || "{}"));
            msgs.push({ role: "tool", tool_call_id: tc.id, content: result });
          }
        }
        return Response.json({ answer: isFr ? "Je n'ai pas pu terminer la demande." : "No he podido completar la solicitud." });
      }
      // GET /api/contact?email=... — contexto real del remitente desde D1
      if (pathname === "/api/contact") {
        const email = new URL(request.url).searchParams.get("email") ?? "";
        const db = combinedEnv.DB as GmailEnv["DB"];
        const stats = await db.prepare(
          `SELECT COUNT(*) as total, MIN(received_at) as first_at, MAX(received_at) as last_at
           FROM email WHERE sender_email = ?`,
        ).bind(email).first<{ total: number; first_at: number; last_at: number }>();
        const { results: recent } = await db.prepare(
          `SELECT subject, summary, promise, tone_warning, type, received_at
           FROM email WHERE sender_email = ? ORDER BY received_at DESC LIMIT 5`,
        ).bind(email).all<{ subject: string; summary: string; promise: string; tone_warning: string; type: string; received_at: number }>();
        const promises = recent.filter((r) => r.promise).map((r) => r.promise);
        const negative = recent.some((r) => r.tone_warning);
        return Response.json({
          email,
          total: stats?.total ?? 0,
          firstAt: stats?.first_at ?? null,
          lastAt: stats?.last_at ?? null,
          recent,
          promises,
          negative,
        });
      }
      // GET /api/email/:id — contenido completo
      const emailMatch = pathname.match(/^\/api\/email\/([^/]+)$/);
      if (emailMatch && request.method === "GET") {
        const detail = await getEmailDetail(combinedEnv as GmailEnv, emailMatch[1]);
        if (!detail) return new Response("Not found", { status: 404 });
        return Response.json(detail);
      }

      // POST /api/email/:id/archive|trash|spam|read — acciones individuales
      const actionMatch = pathname.match(/^\/api\/email\/([^/]+)\/(archive|trash|spam|read)$/);
      if (actionMatch && request.method === "POST") {
        const [, msgId, action] = actionMatch;
        const db = combinedEnv.DB as GmailEnv["DB"];
        let ok = false;
        if (action === "archive") ok = await archiveEmail(combinedEnv as GmailEnv, msgId);
        else if (action === "trash") ok = await trashEmail(combinedEnv as GmailEnv, msgId);
        else if (action === "spam") ok = await spamEmail(combinedEnv as GmailEnv, msgId);
        else if (action === "read") ok = await markRead(combinedEnv as GmailEnv, msgId);
        // Marca leído también en local (la fila sigue en la bandeja).
        if (action === "read") {
          await db.prepare("UPDATE email SET is_read = 1 WHERE id = ?").bind(msgId).run();
        }
        // Elimina de D1 si la acción fue correcta (ya no está en la bandeja)
        if (ok && action !== "read") {
          await db.prepare("DELETE FROM email WHERE id = ?").bind(msgId).run();
        }
        return Response.json({ ok });
      }

      // POST /api/email/bulk — acción en lote sobre varios correos
      if (pathname === "/api/email/bulk" && request.method === "POST") {
        const { ids, action } = await request.json() as { ids: string[]; action: string };
        const db = combinedEnv.DB as GmailEnv["DB"];
        let done = 0;
        for (const id of ids) {
          let ok = false;
          if (action === "archive") ok = await archiveEmail(combinedEnv as GmailEnv, id);
          else if (action === "trash") ok = await trashEmail(combinedEnv as GmailEnv, id);
          else if (action === "spam") ok = await spamEmail(combinedEnv as GmailEnv, id);
          if (ok) { await db.prepare("DELETE FROM email WHERE id = ?").bind(id).run(); done++; }
        }
        return Response.json({ done });
      }

      // POST /api/email/:id/type — corrige manualmente la clasificación
      const typeMatch = pathname.match(/^\/api\/email\/([^/]+)\/type$/);
      if (typeMatch && request.method === "POST") {
        const { type } = await request.json() as { type: string };
        const db = combinedEnv.DB as GmailEnv["DB"];
        await db.prepare("UPDATE email SET type = ?, classified_by = 'manual' WHERE id = ?").bind(type, typeMatch[1]).run();
        // Aprende: futuros correos de ese remitente/dominio se clasificarán solos (0 tokens).
        try {
          const row = await db.prepare("SELECT sender_email FROM email WHERE id = ?").bind(typeMatch[1]).first<{ sender_email: string | null }>();
          await learnRule({ DB: db }, row?.sender_email, type);
        } catch (e) { console.error(`[learnRule] ${e}`); }
        return Response.json({ ok: true });
      }

      // POST /api/email/:id/draft — genera borrador de respuesta con IA
      const draftMatch = pathname.match(/^\/api\/email\/([^/]+)\/draft$/);
      if (draftMatch && request.method === "POST") {
        const { tone, myStyle, lang } = await request.json() as { tone: string; myStyle?: boolean; lang?: string };
        const detail = await getEmailDetail(combinedEnv as GmailEnv, draftMatch[1]);
        if (!detail) return Response.json({ draft: null }, { status: 404 });
        // Cerebro de memoria: recupera historial relevante con este contacto/tema.
        let memory = "";
        try {
          const query = `${detail.from} ${detail.subject} ${detail.bodyText || detail.snippet || ""}`;
          const hits = await recall(combinedEnv as MemoryEnv, query, { topK: 5, excludeId: draftMatch[1] });
          memory = formatMemoryContext(hits, lang === "fr");
        } catch (e) {
          console.error(`[draft.recall] ${e}`);
        }
        const draft = await generateReply(env as AiEnv, {
          subject: detail.subject,
          body: detail.bodyText || detail.snippet || "",
          from: detail.from,
          tone,
          myStyle: !!myStyle,
          memory: memory || undefined,
        });
        return Response.json({ draft, memoryUsed: memory ? memory.split("\n").length : 0 });
      }

      // POST /api/email/:id/reply — enviar respuesta
      const replyMatch = pathname.match(/^\/api\/email\/([^/]+)\/reply$/);
      if (replyMatch && request.method === "POST") {
        const body = await request.json() as { to: string; subject: string; body: string; threadId: string; inReplyTo?: string };
        const ok = await sendReply(combinedEnv as GmailEnv, body);
        return Response.json({ ok });
      }
      // POST /api/email/send — enviar un correo nuevo (reenviar)
      if (pathname === "/api/email/send" && request.method === "POST") {
        const body = await request.json() as { to: string; subject: string; body: string };
        const ok = await sendNew(combinedEnv as GmailEnv, body);
        return Response.json({ ok });
      }
      if (pathname === "/api/inbox/diagnose" && request.method === "POST") {
        const aiEnv = env as AiEnv;
        const hasKey = !!aiEnv.GEMINI_API_KEY;
        const keyPrefix = aiEnv.GEMINI_API_KEY?.substring(0, 8) ?? "none";
        // Prueba real a Gemini
        let geminiStatus = "not_tested";
        let geminiError = "";
        if (aiEnv.GEMINI_API_KEY) {
          try {
            const r = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`,
              { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": aiEnv.GEMINI_API_KEY ?? "" },
                body: JSON.stringify({ contents: [{ parts: [{ text: "Di solo: OK" }] }], generationConfig: { maxOutputTokens: 10 } }) }
            );
            geminiStatus = r.ok ? "ok" : `error_${r.status}`;
            if (!r.ok) geminiError = await r.text();
          } catch (e) { geminiStatus = "exception"; geminiError = String(e); }
        }
        // Correos pendientes
        const { results: pending } = await (combinedEnv as GmailEnv).DB.prepare(
          "SELECT COUNT(*) as n FROM email WHERE analyzed_at IS NULL"
        ).all<{ n: number }>();
        return Response.json({ hasKey, keyPrefix, geminiStatus, geminiError, pendingEmails: pending[0]?.n ?? 0 });
      }
      // POST /api/inbox/reset-analysis — marca todos como sin analizar (para re-analizar)
      if (pathname === "/api/inbox/reset-analysis" && request.method === "POST") {
        const db = combinedEnv.DB as GmailEnv["DB"];
        await db.prepare("UPDATE email SET analyzed_at = NULL").run();
        const { results } = await db.prepare("SELECT COUNT(*) as n FROM email").all<{ n: number }>();
        return Response.json({ reset: results[0]?.n ?? 0 });
      }
      if (pathname === "/api/inbox/analyze" && request.method === "POST") {
        const aiEnv = env as AiEnv;
        const db = (combinedEnv as GmailEnv).DB;

        // Trae correos de la BANDEJA sin analizar (los enviados no se analizan)
        const { results: pendingAll } = await db.prepare(
          "SELECT id, sender, sender_email, subject, snippet FROM email WHERE analyzed_at IS NULL AND (folder = 'inbox' OR folder IS NULL) LIMIT 50",
        ).all<{ id: string; sender: string; sender_email: string | null; subject: string; snippet: string }>();

        if (pendingAll.length === 0) return Response.json({ analyzed: 0, pending: 0, ruled: 0 });

        let analyzed = 0;
        // Robots que aprenden: reglas a 0 tokens antes de la IA.
        const ruled = await applyRules({ DB: db }, pendingAll);
        if (ruled.size > 0) {
          const now = Date.now();
          for (const email of pendingAll) {
            const t = ruled.get(email.id);
            if (!t) continue;
            await db.prepare(
              `UPDATE email SET type=?, summary=COALESCE(summary, ?), effort=COALESCE(effort,'quick'), classified_by='rule', analyzed_at=? WHERE id=?`,
            ).bind(t, "Clasificado por una regla aprendida (sin IA).", now, email.id).run();
            analyzed++;
          }
        }
        const pending = pendingAll.filter((e) => !ruled.has(e.id));

        // Procesa el resto con IA en lotes de 8 (éxito parcial persiste).
        const BATCH = 8;
        const enginesUsed = new Set<string>();
        for (let i = 0; i < pending.length; i += BATCH) {
          const batch = pending.slice(i, i + BATCH);
          const { results, engine } = await analyzeBatch(aiEnv, batch);
          if (engine !== "none") enginesUsed.add(engine);
          const byId = new Map(results.map((r) => [String(r.id), r]));
          for (const email of batch) {
            const r = byId.get(String(email.id));
            if (!r || !r.type || !r.summary || !r.effort) continue;
            await db.prepare(
              `UPDATE email SET type=?, summary=?, promise=?, tone_warning=?, effort=?, classified_by='ai', analyzed_at=? WHERE id=?`,
            ).bind(r.type, r.summary, r.promise ?? null, r.tone_warning ?? null, r.effort, Date.now(), email.id).run();
            analyzed++;
          }
        }
        // Alimenta la memoria con lo recién analizado (+ enviados pendientes).
        let embedded = 0;
        try {
          embedded = await embedPending(combinedEnv as GmailEnv & MemoryEnv);
        } catch (e) {
          console.error(`[embedPending] ${e}`);
        }
        return Response.json({ analyzed, pending: pendingAll.length, ruled: ruled.size, engines: [...enginesUsed], embedded });
      }
      // POST /api/memory/backfill — indexa en la memoria todo el histórico pendiente (manual)
      if (pathname === "/api/memory/backfill" && request.method === "POST") {
        let embedded = 0;
        try {
          embedded = await embedPending(combinedEnv as GmailEnv & MemoryEnv, 200);
        } catch (e) {
          console.error(`[memory/backfill] ${e}`);
        }
        return Response.json({ embedded });
      }
      // GET /api/memory/stats — cuántos correos hay y cuántos ya están en la memoria
      if (pathname === "/api/memory/stats") {
        const db = combinedEnv.DB as GmailEnv["DB"];
        const { results } = await db.prepare(
          "SELECT COUNT(*) AS total, COUNT(embedded_at) AS embedded FROM email",
        ).all<{ total: number; embedded: number }>();
        const row = results[0] ?? { total: 0, embedded: 0 };
        const memEnv = env as MemoryEnv & AiEnv;
        return Response.json({ total: row.total, embedded: row.embedded, enabled: !!memEnv.MEMORY && !!memEnv.GEMINI_API_KEY });
      }
      return new Response("Not found", { status: 404 });
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
