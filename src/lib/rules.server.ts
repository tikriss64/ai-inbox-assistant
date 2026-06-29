// "Robots que aprenden" — reglas de clasificación a 0 tokens (sin IA).
// El usuario corrige el tipo de un correo → se aprende una regla por dominio del
// remitente. En el siguiente análisis, los correos de ese dominio se clasifican
// solos (gratis), y solo lo que no casa ninguna regla va a la IA.

import type { D1Like } from "./gmail-oauth.server";

export interface RuleEnv {
  DB: D1Like;
}

// Extrae el dominio del email del remitente (ej. "ofertas@amazon.es" → "amazon.es").
export function senderDomain(senderEmail: string | null | undefined): string | null {
  const m = /@([^>\s]+)/.exec((senderEmail || "").toLowerCase().trim());
  return m ? m[1] : null;
}

// Devuelve un Map id->tipo para los correos que casan una regla aprendida (0 tokens).
export async function applyRules(
  env: RuleEnv,
  emails: { id: string; sender_email?: string | null }[],
): Promise<Map<string, string>> {
  const hits = new Map<string, string>();
  const { results } = await env.DB.prepare(
    "SELECT pattern, email_type FROM router_rules WHERE pattern_type = 'domain'",
  ).all<{ pattern: string; email_type: string }>();
  if (!results || results.length === 0) return hits;
  const ruleMap = new Map(results.map((r) => [r.pattern, r.email_type]));
  for (const e of emails) {
    const d = senderDomain(e.sender_email);
    if (d && ruleMap.has(d)) hits.set(e.id, ruleMap.get(d)!);
  }
  return hits;
}

// Aprende/refuerza una regla cuando el usuario corrige el tipo de un correo.
// A prueba de fallos: nunca lanza (si algo va mal, la corrección manual ya se guardó).
export async function learnRule(
  env: RuleEnv,
  senderEmail: string | null | undefined,
  emailType: string,
): Promise<void> {
  const d = senderDomain(senderEmail);
  if (!d || !emailType) return;
  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO router_rules (pattern_type, pattern, email_type, hits, created_at, updated_at)
       VALUES ('domain', ?, ?, 1, ?, ?)
       ON CONFLICT(pattern_type, pattern) DO UPDATE SET
         email_type = excluded.email_type,
         hits = router_rules.hits + 1,
         updated_at = excluded.updated_at`,
    ).bind(d, emailType, now, now).run();
  } catch (e) {
    console.error(`[learnRule] ${e}`);
  }
}
