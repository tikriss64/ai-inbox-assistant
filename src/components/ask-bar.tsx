import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Search, Sparkles, X, Mail, ArrowRight, Loader2, Archive, Trash2, ShieldAlert } from "lucide-react";
import { EmailDetail } from "@/components/email-detail";

interface RelatedEmail {
  id: string;
  sender: string;
  subject: string;
  summary: string;
  time: string;
}

interface MockAnswer {
  answer: string;
  related: RelatedEmail[];
}

const SUGGESTIONS_ES = [
  "¿Qué correos importantes tengo?",
  "¿Quién espera respuesta?",
  "¿Hay correos sospechosos?",
  "Resume lo más importante de hoy",
  "¿Qué facturas o trámites tengo?",
];
const SUGGESTIONS_FR = [
  "Quels e-mails importants ai-je ?",
  "Qui attend une réponse ?",
  "Y a-t-il des e-mails suspects ?",
  "Résume l'essentiel d'aujourd'hui",
  "Quelles factures ou démarches ai-je ?",
];

export function AskBar() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || "es").slice(0, 2);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ q: string; data: MockAnswer } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);

  // Al abrir el buscador, enfoca y SELECCIONA el texto anterior → escribir lo reemplaza
  // directamente (sin tener que borrarlo a mano para hacer otra pregunta).
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => {
        modalInputRef.current?.focus();
        modalInputRef.current?.select();
      }, 30);
      return () => clearTimeout(id);
    }
  }, [open]);

  // Limpia la pregunta y el resultado → vuelve a mostrar las sugerencias, listo para otra.
  const clearSearch = () => {
    setQuery("");
    setResult(null);
    setLoading(false);
    modalInputRef.current?.focus();
  };

  // Acción directa sobre un correo encontrado (sin IA). Lo quita de la lista al hacerla.
  const doAction = async (id: string, action: "archive" | "trash" | "spam") => {
    try { await fetch(`/api/email/${id}/${action}`, { method: "POST" }); } catch {}
    setResult((r) =>
      r ? { ...r, data: { ...r.data, related: r.data.related.filter((e) => e.id !== id) } } : r,
    );
  };

  const suggestions = lang === "fr" ? SUGGESTIONS_FR : SUGGESTIONS_ES;

  // Cerrar al pulsar Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fmtTime = (ms: number) =>
    new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "es-ES", { day: "numeric", month: "short" }).format(new Date(ms));

  const ask = async (q: string) => {
    if (!q.trim()) return;
    setOpen(true);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/inbox/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q.trim(), lang }),
      });
      const d = (await res.json()) as {
        answer: string | null;
        related?: { id: string; sender: string; subject: string; summary: string; received_at: number }[];
      };
      const related: RelatedEmail[] = (d.related || []).map((e) => ({
        id: e.id,
        sender: e.sender,
        subject: e.subject,
        summary: e.summary,
        time: fmtTime(e.received_at),
      }));
      setResult({
        q: q.trim(),
        data: {
          answer: d.answer || (lang === "fr" ? "Je n'ai pas trouvé de réponse." : "No encontré respuesta."),
          related,
        },
      });
    } catch {
      setResult({
        q: q.trim(),
        data: { answer: lang === "fr" ? "Erreur de connexion." : "Error de conexión.", related: [] },
      });
    }
    setLoading(false);
  };

  const placeholder = t("ask.placeholder");

  const formattedAnswer = useMemo(() => {
    if (!result) return null;
    // Renderizar **bold** sencillo
    const parts = result.data.answer.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? (
        <strong key={i} className="text-foreground font-semibold">
          {p.slice(2, -2)}
        </strong>
      ) : (
        <span key={i}>{p}</span>
      ),
    );
  }, [result]);

  return (
    <>
      <div className="relative">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ask(query);
          }}
          placeholder={placeholder}
          className="h-9 w-36 sm:w-64 lg:w-96 pl-9 pr-3 rounded-full border border-border bg-background/70 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition"
        />
      </div>

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-20 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl bg-card border border-border shadow-soft overflow-hidden"
          >
            {/* Input */}
            <div className="flex items-center gap-2 px-4 h-14 border-b border-border">
              <Sparkles className="size-4 text-primary shrink-0" />
              <input
                ref={modalInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") ask(query);
                }}
                placeholder={placeholder}
                className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
              />
              {(query || result) && (
                <button
                  onClick={clearSearch}
                  title={lang === "fr" ? "Nouvelle question" : "Nueva pregunta"}
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground px-2 h-7 rounded-lg hover:bg-accent transition shrink-0"
                >
                  {lang === "fr" ? "Effacer" : "Limpiar"}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="size-7 rounded-lg hover:bg-accent grid place-items-center shrink-0"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[60vh] overflow-auto">
              {!result && !loading && (
                <div className="p-5">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
                    {t("ask.suggestionsTitle")}
                  </div>
                  <div className="space-y-1.5">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setQuery(s);
                          ask(s);
                        }}
                        className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent text-sm transition group"
                      >
                        <Search className="size-3.5 text-muted-foreground" />
                        <span className="flex-1">{s}</span>
                        <ArrowRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {loading && (
                <div className="p-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <Loader2 className="size-5 animate-spin text-primary" />
                  {t("ask.thinking")}
                </div>
              )}

              {result && !loading && (
                <div className="p-5 space-y-5">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                      {t("ask.questionLabel")}
                    </div>
                    <div className="text-sm font-medium">{result.q}</div>
                  </div>

                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-primary font-semibold mb-2">
                      <Sparkles className="size-3.5" />
                      {t("ask.aiAnswer")}
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">{formattedAnswer}</p>
                  </div>

                  {result.data.related.length > 0 && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                        {t("ask.relatedEmails")} · {result.data.related.length}
                      </div>
                      <div className="space-y-2">
                        {result.data.related.map((e) => (
                          <div
                            key={e.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setOpenId(e.id)}
                            onKeyDown={(ev) => { if (ev.key === "Enter") setOpenId(e.id); }}
                            className="relative isolate rounded-xl border border-border bg-background p-3 hover:border-primary/40 transition cursor-pointer"
                          >
                            <div className="flex items-start gap-3">
                              <div className="size-8 rounded-lg bg-accent grid place-items-center shrink-0">
                                <Mail className="size-4 text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold truncate">{e.sender}</span>
                                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{e.time}</span>
                                </div>
                                <div className="text-sm text-foreground truncate">{e.subject}</div>
                                <div className="text-xs text-muted-foreground truncate mt-0.5">{e.summary}</div>
                              </div>
                            </div>
                            {/* Acciones rápidas (sin IA) — siempre visibles para evitar confusión entre tarjetas */}
                            <div className="mt-2.5 pt-2.5 border-t border-border flex items-center gap-1.5">
                              <button
                                onClick={(ev) => { ev.stopPropagation(); setOpenId(e.id); }}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium transition"
                              >
                                <Mail className="size-3.5" />
                                {lang === "fr" ? "Ouvrir" : "Abrir"}
                              </button>
                              <div className="flex-1" />
                              <button
                                onClick={(ev) => { ev.stopPropagation(); doAction(e.id, "archive"); }}
                                title={lang === "fr" ? "Archiver" : "Archivar"}
                                className="size-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-accent transition"
                              >
                                <Archive className="size-4" />
                              </button>
                              <button
                                onClick={(ev) => { ev.stopPropagation(); doAction(e.id, "spam"); }}
                                title="Spam"
                                className="size-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-warn/20 hover:text-warn transition"
                              >
                                <ShieldAlert className="size-4" />
                              </button>
                              <button
                                onClick={(ev) => { ev.stopPropagation(); doAction(e.id, "trash"); }}
                                title={lang === "fr" ? "Corbeille" : "Papelera"}
                                className="size-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-danger/20 hover:text-danger transition"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-[11px] text-muted-foreground italic">
                    {t("ask.disclaimer")}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Visor de correo abierto desde un resultado de búsqueda */}
      <EmailDetail
        emailId={openId}
        onClose={() => setOpenId(null)}
        onAction={(id) => setResult((r) => (r ? { ...r, data: { ...r.data, related: r.data.related.filter((e) => e.id !== id) } } : r))}
      />
    </>
  );
}
