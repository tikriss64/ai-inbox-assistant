import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X, Loader2, User, Calendar, Mail, ExternalLink, Archive, Trash2, ShieldAlert, Reply, Send, Sparkles, Check, ChevronDown, MoreHorizontal } from "lucide-react";

interface EmailDetail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  fromEmail: string;
  to: string;
  date: string;
  bodyHtml: string | null;
  bodyText: string | null;
  snippet: string;
}

interface Props {
  emailId: string | null;
  onClose: () => void;
  onAction?: (id: string, action: "archive" | "trash" | "spam") => void;
  mode?: "reply" | "forward";
}

export function EmailDetail({ emailId, onClose, onAction, mode = "reply" }: Props) {
  const isForward = mode === "forward";
  const { i18n } = useTranslation();
  const fr = i18n.language === "fr";
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [acting, setActing] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [sent, setSent] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [forwardTo, setForwardTo] = useState(""); // destinatario al reenviar

  const doAction = async (action: "archive" | "trash" | "spam") => {
    if (!emailId) return;
    setActing(true);
    try { await fetch(`/api/email/${emailId}/${action}`, { method: "POST" }); } catch {}
    onAction?.(emailId, action);
    setActing(false);
    onClose();
  };

  // Borrador de respuesta con IA (rellena el cuadro de texto).
  const draftReply = async () => {
    if (!emailId) return;
    setDrafting(true);
    try {
      const r = await fetch(`/api/email/${emailId}/draft`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone: "neutro", myStyle: false, lang: i18n.language }),
      });
      const d = await r.json() as { draft: string | null };
      if (d.draft) setReplyText(d.draft);
    } catch {}
    setDrafting(false);
  };

  // Envía: respuesta (en el hilo) o reenvío (correo nuevo a otro destinatario).
  const sendReply = async () => {
    if (!emailId || !detail || !replyText.trim()) return;
    if (isForward && !forwardTo.trim()) return;
    setSending(true);
    try {
      const r = isForward
        ? await fetch(`/api/email/send`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: forwardTo.trim(), subject: detail.subject.startsWith("Fwd:") ? detail.subject : `Fwd: ${detail.subject}`, body: replyText }),
          })
        : await fetch(`/api/email/${emailId}/reply`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: detail.fromEmail, subject: detail.subject, body: replyText, threadId: detail.threadId }),
          });
      const d = await r.json() as { ok: boolean };
      if (d.ok) { setSent(true); setReplyText(""); setForwardTo(""); setReplyOpen(false); setTimeout(() => setSent(false), 3000); }
    } catch {}
    setSending(false);
  };

  useEffect(() => {
    if (!emailId) { setDetail(null); return; }
    setLoading(true);
    setError(false);
    setReplyOpen(false); setReplyText(""); setSent(false); setMetaOpen(false); setActionsMenuOpen(false); setForwardTo("");
    fetch(`/api/email/${emailId}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d: EmailDetail) => setDetail(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    // Marcar como leído en Gmail al abrir (fire-and-forget)
    fetch(`/api/email/${emailId}/read`, { method: "POST" }).catch(() => {});
  }, [emailId]);

  if (!emailId) return null;
  if (typeof document === "undefined") return null;

  // Fecha corta para la cabecera compacta (ej. "15 jun · 21:53").
  const shortDate = detail?.date
    ? (() => {
        const d = new Date(detail.date);
        if (isNaN(d.getTime())) return detail.date.slice(0, 16);
        return (
          d.toLocaleDateString(fr ? "fr-FR" : "es-ES", { day: "2-digit", month: "short" }) +
          " · " +
          d.toLocaleTimeString(fr ? "fr-FR" : "es-ES", { hour: "2-digit", minute: "2-digit" })
        );
      })()
    : "";

  return createPortal(
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[60] animate-fade-in"
        onClick={onClose}
      />
      {/* Modal: pantalla completa en móvil, centrado en escritorio */}
      <div className="fixed inset-0 z-[61] flex items-stretch sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
      <div className="pointer-events-auto w-full h-full sm:h-auto sm:max-w-4xl sm:max-h-[88vh] flex flex-col bg-background shadow-2xl border-0 sm:border border-border rounded-none sm:rounded-2xl overflow-hidden animate-scale-in">
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-4 px-4 sm:px-6 py-4 border-b border-border bg-background/95 backdrop-blur shrink-0">
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="h-6 w-48 rounded-lg bg-muted animate-pulse" />
            ) : (
              <h2 className="text-base font-semibold text-foreground leading-snug">
                {detail?.subject ?? (i18n.language === "fr" ? "Chargement…" : "Cargando…")}
              </h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={i18n.language === "fr" ? "Fermer" : "Cerrar"}
            className="shrink-0 size-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Metadatos (compactos + plegables) */}
        {detail && !loading && (
          <div className="px-4 sm:px-6 py-3 border-b border-border bg-card/50 shrink-0">
            <button
              type="button"
              onClick={() => setMetaOpen((o) => !o)}
              className="flex items-center gap-2 w-full text-left"
            >
              <User className="size-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium text-sm text-foreground truncate flex-1 min-w-0">{detail.from}</span>
              {shortDate && <span className="text-[11px] text-muted-foreground shrink-0">{shortDate}</span>}
              <ChevronDown className={`size-4 text-muted-foreground shrink-0 transition-transform ${metaOpen ? "rotate-180" : ""}`} />
            </button>
            {metaOpen && (
              <div className="mt-2 ml-5 space-y-1 text-xs text-muted-foreground">
                {detail.fromEmail && detail.fromEmail !== detail.from && (
                  <div className="flex items-center gap-2"><Mail className="size-3.5 shrink-0" /><span className="truncate">{detail.fromEmail}</span></div>
                )}
                {detail.to && (
                  <div className="flex items-center gap-2"><User className="size-3.5 shrink-0" /><span className="truncate">{fr ? "À : " : "Para: "}{detail.to}</span></div>
                )}
                {detail.date && (
                  <div className="flex items-center gap-2"><Calendar className="size-3.5 shrink-0" /><span>{detail.date}</span></div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Cuerpo */}
        <div className="flex-1 min-h-0 overflow-auto px-4 sm:px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-sm">{i18n.language === "fr" ? "Chargement du message…" : "Cargando mensaje…"}</span>
            </div>
          )}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <p className="text-sm">{i18n.language === "fr" ? "Impossible de charger ce message. Reconnecte ton compte Gmail dans Réglages." : "No se pudo cargar este mensaje. Reconecta tu cuenta Gmail en Ajustes."}</p>
            </div>
          )}
          {detail && !loading && (
            detail.bodyHtml ? (
              // Email en iframe aislado. Si trae ancho fijo (Groupon/LinkedIn) y no cabe,
              // se mide su ancho real y se ESCALA para que entre — su propio CSS ya no importa.
              <div className="w-full overflow-hidden">
                <iframe
                  srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="only light"><style>
                    html,body{background:#ffffff;color:#1a1a1a;}
                    body{font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;margin:0;padding:0;word-break:break-word;overflow-wrap:anywhere;color-scheme:light;-webkit-text-size-adjust:100%;}
                    a{color:#6366f1;}img{max-width:100%;height:auto;}
                  </style></head><body>${detail.bodyHtml}</body></html>`}
                  className="border-0 rounded-xl bg-white block"
                  style={{ width: "100%", minHeight: "300px" }}
                  onLoad={(e) => {
                    const iframe = e.currentTarget;
                    const doc = iframe.contentDocument;
                    const wrap = iframe.parentElement as HTMLElement | null;
                    if (!doc) return;
                    // Reinicia para medir el ancho natural del correo.
                    iframe.style.transform = "none";
                    iframe.style.width = "100%";
                    if (wrap) wrap.style.height = "";
                    const container = iframe.clientWidth || 1;
                    const natural = Math.max(doc.documentElement.scrollWidth, doc.body.scrollWidth);
                    if (natural > container + 4) {
                      // Correo más ancho que el visor → escalar para que quepa.
                      const scale = container / natural;
                      iframe.style.width = natural + "px";
                      iframe.style.transformOrigin = "top left";
                      iframe.style.transform = `scale(${scale})`;
                      const h = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
                      iframe.style.height = h + "px";
                      if (wrap) wrap.style.height = Math.ceil(h * scale + 8) + "px";
                    } else {
                      const h = doc.body.scrollHeight || doc.documentElement.scrollHeight;
                      iframe.style.height = (h + 24) + "px";
                    }
                  }}
                  sandbox="allow-same-origin"
                  title={detail.subject}
                />
              </div>
            ) : detail.bodyText ? (
              <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                {detail.bodyText}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                {i18n.language === "fr" ? "Pas de contenu lisible dans ce message." : "Este mensaje no tiene contenido legible."}
              </p>
            )
          )}
        </div>

        {/* Composer de respuesta / reenvío */}
        {detail && replyOpen && (
          <div className="px-4 sm:px-6 py-3 border-t border-border bg-card/30 shrink-0 space-y-2">
            {isForward && (
              <input
                type="email"
                value={forwardTo}
                onChange={(e) => setForwardTo(e.target.value)}
                placeholder={fr ? "Destinataire (e-mail)…" : "Destinatario (correo)…"}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            )}
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={5}
              placeholder={isForward ? (fr ? "Ajoute un message (optionnel)…" : "Añade un mensaje (opcional)…") : (fr ? "Écris ta réponse…" : "Escribe tu respuesta…")}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="flex items-center gap-2">
              {!isForward && (
                <button
                  onClick={draftReply}
                  disabled={drafting}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium transition disabled:opacity-50"
                >
                  {drafting ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  {fr ? "Brouillon IA" : "Borrador IA"}
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={() => { setReplyOpen(false); setReplyText(""); }}
                className="h-8 px-3 rounded-lg border border-border hover:bg-accent text-xs font-medium transition"
              >
                {fr ? "Annuler" : "Cancelar"}
              </button>
              <button
                onClick={sendReply}
                disabled={sending || !replyText.trim() || (isForward && !forwardTo.trim())}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium transition disabled:opacity-50"
              >
                {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                {fr ? "Envoyer" : "Enviar"}
              </button>
            </div>
          </div>
        )}

        {/* Pie: acciones */}
        {detail && (
          <div className="px-4 sm:px-6 py-3 border-t border-border bg-card/50 shrink-0 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {/* Responder / Reenviar: siempre visible */}
              <button
                onClick={() => {
                  // Al abrir el reenvío, precarga el contenido original citado.
                  if (isForward && !replyOpen && detail) {
                    setReplyText(`\n\n--- ${fr ? "Message transféré" : "Mensaje reenviado"} ---\n${detail.bodyText || detail.snippet || ""}`);
                  }
                  setReplyOpen((o) => !o);
                }}
                disabled={acting}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium transition disabled:opacity-50"
              >
                {sent ? <Check className="size-3.5" /> : <Reply className="size-3.5" />}
                {sent ? (fr ? "Envoyé" : "Enviado") : isForward ? (fr ? "Transférer" : "Reenviar") : (fr ? "Répondre" : "Responder")}
              </button>

              {/* Escritorio: acciones en línea */}
              <button onClick={() => doAction("archive")} disabled={acting} className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border hover:bg-accent text-xs font-medium transition disabled:opacity-50">
                <Archive className="size-3.5" /> {fr ? "Archiver" : "Archivar"}
              </button>
              <button onClick={() => doAction("spam")} disabled={acting} className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border hover:bg-warn/15 hover:text-warn text-xs font-medium transition disabled:opacity-50">
                <ShieldAlert className="size-3.5" /> Spam
              </button>
              <button onClick={() => doAction("trash")} disabled={acting} className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border hover:bg-danger/15 hover:text-danger text-xs font-medium transition disabled:opacity-50">
                <Trash2 className="size-3.5" /> {fr ? "Corbeille" : "Papelera"}
              </button>

              {/* Móvil: desplegable "Más" con el resto de acciones */}
              <div className="relative sm:hidden">
                <button
                  type="button"
                  onClick={() => setActionsMenuOpen((o) => !o)}
                  disabled={acting}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-border hover:bg-accent text-xs font-medium transition disabled:opacity-50"
                >
                  <MoreHorizontal className="size-4" /> {fr ? "Plus" : "Más"}
                </button>
                {actionsMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-[62]" onClick={() => setActionsMenuOpen(false)} />
                    <div className="absolute bottom-full left-0 mb-2 z-[63] min-w-[190px] rounded-xl border border-border bg-background shadow-xl py-1">
                      <button onClick={() => { setActionsMenuOpen(false); doAction("archive"); }} disabled={acting} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent text-left disabled:opacity-50">
                        <Archive className="size-3.5" /> {fr ? "Archiver" : "Archivar"}
                      </button>
                      <button onClick={() => { setActionsMenuOpen(false); doAction("spam"); }} disabled={acting} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-warn/15 hover:text-warn text-left disabled:opacity-50">
                        <ShieldAlert className="size-3.5" /> Spam
                      </button>
                      <button onClick={() => { setActionsMenuOpen(false); doAction("trash"); }} disabled={acting} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-danger/15 hover:text-danger text-left disabled:opacity-50">
                        <Trash2 className="size-3.5" /> {fr ? "Corbeille" : "Papelera"}
                      </button>
                      <div className="my-1 border-t border-border" />
                      <a href={`https://mail.google.com/mail/u/0/#inbox/${detail.id}`} target="_blank" rel="noreferrer" onClick={() => setActionsMenuOpen(false)} className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent text-left">
                        <ExternalLink className="size-3" /> {fr ? "Ouvrir dans Gmail" : "Abrir en Gmail"}
                      </a>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Escritorio: enlace a Gmail a la derecha */}
            <a
              href={`https://mail.google.com/mail/u/0/#inbox/${detail.id}`}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs text-primary hover:underline shrink-0"
            >
              <ExternalLink className="size-3" />
              {fr ? "Ouvrir dans Gmail" : "Abrir en Gmail"}
            </a>
          </div>
        )}
      </div>
      </div>
    </>,
    document.body,
  );
}
