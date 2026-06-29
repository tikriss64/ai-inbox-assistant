import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Send, Loader2, Sparkles } from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

// Chatbot personal flotante. Habla con Gemini/Groq (vía /api/ai/chat) con el
// contexto de la bandeja. Disponible en todas las páginas.
export function AssistantChat() {
  const { i18n } = useTranslation();
  const fr = i18n.language === "fr";
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ gemini: boolean; groq: boolean } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Semáforo: comprueba (de verdad) qué IAs están conectadas al abrir el chat.
  useEffect(() => {
    if (!open || status) return;
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d: { gemini: boolean; groq: boolean }) => setStatus(d))
      .catch(() => setStatus({ gemini: false, groq: false }));
  }, [open, status]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const r = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, lang: i18n.language }),
      });
      const d = (await r.json()) as { answer?: string };
      setMessages((m) => [...m, { role: "assistant", content: d.answer || (fr ? "…" : "…") }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: fr ? "Erreur de connexion." : "Error de conexión." }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = fr
    ? ["Résume mes e-mails importants", "Y a-t-il des e-mails suspects ?", "Archive les promotions"]
    : ["Resume mis correos importantes", "¿Hay correos sospechosos?", "Archiva las promociones"];

  return (
    <>
      {/* Botón flotante (asistente IA) */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={fr ? "Assistant" : "Asistente"}
        className="group fixed bottom-5 right-5 z-[70] size-14 rounded-full grid place-items-center text-white ring-1 ring-white/25 bg-gradient-to-br from-sky-400 via-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/50 hover:scale-105 active:scale-95 transition-all duration-200"
      >
        {open ? (
          <X className="size-6" />
        ) : (
          <Sparkles className="size-6 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
        )}
        {!open && <span className="pointer-events-none absolute -inset-1 rounded-full bg-indigo-500/30 blur-md -z-10 animate-pulse" />}
      </button>

      {/* Panel de chat */}
      {open && (
        <div className="fixed bottom-24 right-5 z-[70] w-[min(92vw,400px)] h-[min(70vh,560px)] flex flex-col rounded-2xl border border-border bg-background shadow-2xl overflow-hidden animate-scale-in">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card/60 shrink-0">
            <Sparkles className="size-4 text-primary" />
            <span className="text-sm font-semibold">{fr ? "Assistant" : "Asistente IA"}</span>
            <span className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1" title={status ? (status.gemini ? "Gemini conectado" : "Gemini sin conexión") : "Comprobando…"}>
                <span className={`size-2 rounded-full ${status == null ? "bg-muted-foreground/40 animate-pulse" : status.gemini ? "bg-emerald-500" : "bg-rose-500"}`} />
                Gemini
              </span>
              <span className="flex items-center gap-1" title={status ? (status.groq ? "Groq conectado" : "Groq sin conexión") : "Comprobando…"}>
                <span className={`size-2 rounded-full ${status == null ? "bg-muted-foreground/40 animate-pulse" : status.groq ? "bg-emerald-500" : "bg-rose-500"}`} />
                Groq
              </span>
            </span>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground px-1">
                  {fr ? "Pose-moi une question sur ta boîte mail :" : "Pregúntame sobre tu bandeja:"}
                </p>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setInput(s); setTimeout(send, 0); }}
                    className="block w-full text-left rounded-xl border border-border px-3 py-2 text-xs hover:bg-accent transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3 py-2 bg-card border border-border">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          <div className="p-2 border-t border-border shrink-0 flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder={fr ? "Écris ton message…" : "Escribe tu mensaje…"}
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={send}
              disabled={loading || !input.trim()}
              className="size-9 shrink-0 rounded-xl grid place-items-center bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
