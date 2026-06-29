import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useEffect, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/i18n";
import { Sparkles, Plug, ShieldAlert, Star, Inbox, Bot, Clock, Mail, Zap, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hoy · AI Inbox Assistant" },
      { name: "description", content: "Tu resumen del día en el correo." },
    ],
  }),
  component: HoyPage,
});

interface TodayData {
  total: number;
  todayCount: number;
  counts: Record<string, number>;
  important: { id: string; sender: string; subject: string; summary: string }[];
  attention: { id: string; sender: string; subject: string; reason: string }[];
  pending: { id: string; sender: string; subject: string; received_at: number }[];
  robot: { lastRunAt: number | null; runsToday: number; syncedToday: number; ruledToday: number; aiToday: number };
}

const TYPE_COLORS: Record<string, string> = {
  Importante: "#6366f1",
  Tramites: "#0284c7",
  Citas: "#059669",
  Suscripciones: "#64748b",
  Promociones: "#f59e0b",
  Notificaciones: "#8b5cf6",
  Sospechoso: "#e11d48",
};

function HoyPage() {
  const { t, i18n } = useTranslation();
  const fr = i18n.language === "fr";
  const [today, setToday] = useState<TodayData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/today")
      .then((r) => r.json())
      .then((d: TodayData) => setToday(d))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const now = new Date();
  const dateText = formatDate(now, i18n.resolvedLanguage || i18n.language || "es");
  const dateCap = dateText.charAt(0).toUpperCase() + dateText.slice(1);
  const typeLabel = (k: string) => (k === "sinClasificar" ? (fr ? "Sans catégorie" : "Sin clasificar") : t(`bandeja.types.${k}`, { defaultValue: k }));

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <div>
          <p className="text-sm text-muted-foreground">{dateCap}</p>
          <h2 className="text-3xl font-semibold tracking-tight mt-1">{t("hoy.greeting")}</h2>
        </div>

        {!loaded ? (
          <div className="rounded-2xl border border-border bg-card p-6 h-40 animate-pulse" />
        ) : !today || today.total === 0 ? (
          <GettingStarted />
        ) : (
          <>
            {/* Resumen del robot manager */}
            <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary mb-2">
                <Bot className="size-4" /> {fr ? "Résumé du jour" : "Resumen del día"}
              </div>
              <p className="text-lg leading-relaxed">
                {fr
                  ? `Aujourd'hui, ${today.todayCount} e-mail(s) sont arrivés. Tu as ${today.important.length} important(s)${today.attention.length ? ` et ${today.attention.length} à surveiller` : ""}${today.pending.length ? `, ${today.pending.length} en attente de réponse` : ""}.`
                  : `Hoy han llegado ${today.todayCount} correo(s). Tienes ${today.important.length} importante(s)${today.attention.length ? ` y ${today.attention.length} que requieren atención` : ""}${today.pending.length ? `, ${today.pending.length} esperando respuesta` : ""}.`}
              </p>
              <div className="flex flex-wrap gap-3 mt-4">
                <Stat icon={Inbox} label={fr ? "Dans la boîte" : "En bandeja"} value={today.total} />
                <Stat icon={Mail} label={fr ? "Reçus aujourd'hui" : "Recibidos hoy"} value={today.todayCount} />
                <Stat icon={Star} label={fr ? "Importants" : "Importantes"} value={today.important.length} tone="primary" />
                <Stat icon={ShieldAlert} label={fr ? "Attention" : "Atención"} value={today.attention.length} tone="danger" />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Importantes */}
              <Card title={fr ? "Importants pour toi" : "Importantes para ti"} icon={Star} to="/bandeja">
                {today.important.length === 0 ? (
                  <Empty text={fr ? "Rien d'important pour l'instant." : "Nada importante por ahora."} />
                ) : (
                  <ItemList items={today.important.map((e) => ({ id: e.id, top: e.sender, bottom: e.subject }))} />
                )}
              </Card>

              {/* Atención */}
              <Card title={fr ? "À surveiller" : "Atención"} icon={ShieldAlert} tone="danger" to="/riesgos">
                {today.attention.length === 0 ? (
                  <Empty text={fr ? "Aucun e-mail suspect. 👍" : "Ningún correo sospechoso. 👍"} />
                ) : (
                  <ItemList
                    items={today.attention.map((e) => ({
                      id: e.id,
                      top: e.sender,
                      bottom: e.subject,
                      badge: e.reason === "phishing" ? "phishing" : (fr ? "ton" : "tono"),
                    }))}
                  />
                )}
              </Card>

              {/* Esperan respuesta */}
              <Card title={fr ? "En attente de réponse" : "Esperan respuesta"} icon={Clock} tone="warn" to="/esperando">
                {today.pending.length === 0 ? (
                  <Empty text={fr ? "Tu es à jour. 🎉" : "Estás al día. 🎉"} />
                ) : (
                  <ItemList items={today.pending.map((e) => ({ id: e.id, top: e.sender, bottom: e.subject }))} />
                )}
              </Card>

              {/* Trabajo de los robots */}
              <Card title={fr ? "Travail des robots" : "Trabajo de los robots"} icon={Bot} to="/control">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {today.robot.runsToday === 0
                    ? (fr ? "Les robots n'ont pas encore tourné aujourd'hui." : "Los robots aún no se han ejecutado hoy.")
                    : fr
                      ? `Les robots ont tourné ${today.robot.runsToday} fois aujourd'hui : ${today.robot.syncedToday} synchronisés, ${today.robot.ruledToday} classés par règle (0 token) et ${today.robot.aiToday} par IA.`
                      : `Los robots se ejecutaron ${today.robot.runsToday} vez(ces) hoy: ${today.robot.syncedToday} sincronizados, ${today.robot.ruledToday} clasificados por regla (0 tokens) y ${today.robot.aiToday} por IA.`}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <MiniStat icon={Mail} value={today.robot.syncedToday} label={fr ? "synchro" : "sincro"} />
                  <MiniStat icon={Zap} value={today.robot.ruledToday} label={fr ? "règles" : "reglas"} tone="ok" />
                  <MiniStat icon={Sparkles} value={today.robot.aiToday} label="IA" tone="primary" />
                </div>
                {today.robot.lastRunAt && (
                  <p className="text-[11px] text-muted-foreground mt-3">
                    {fr ? "Dernière exécution : " : "Última ejecución: "}
                    {new Date(today.robot.lastRunAt).toLocaleString(fr ? "fr-FR" : "es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </Card>
            </div>

            {/* Distribución por categoría */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-3">{fr ? "Ta boîte par catégorie" : "Tu bandeja por categoría"}</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(today.counts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, n]) => (
                    <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs">
                      <span className="size-2.5 rounded-full" style={{ background: TYPE_COLORS[k] ?? "#94a3b8" }} />
                      {typeLabel(k)} <b className="tabular-nums">{n}</b>
                    </span>
                  ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: ComponentType<{ className?: string }>; label: string; value: number; tone?: "primary" | "danger" }) {
  const c = tone === "danger" ? "text-danger" : tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="flex items-center gap-2 rounded-xl bg-background/70 border border-border px-3 py-2">
      <Icon className={`size-4 ${c}`} />
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function MiniStat({ icon: Icon, value, label, tone }: { icon: ComponentType<{ className?: string }>; value: number; label: string; tone?: "ok" | "primary" }) {
  const c = tone === "ok" ? "text-emerald-600" : tone === "primary" ? "text-primary" : "text-muted-foreground";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted/50 px-2.5 py-1 text-xs">
      <Icon className={`size-3.5 ${c}`} /> <b className="tabular-nums">{value}</b> {label}
    </span>
  );
}

function Card({ title, icon: Icon, tone, to, children }: { title: string; icon: ComponentType<{ className?: string }>; tone?: "danger" | "warn"; to?: string; children: React.ReactNode }) {
  const c = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-primary";
  const inner = (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Icon className={`size-4 ${c}`} /> {title}
        </h3>
        {to && <ChevronRight className="size-4 text-muted-foreground" />}
      </div>
      {children}
    </>
  );
  return to ? (
    <Link to={to} className="block rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition-colors">
      {inner}
    </Link>
  ) : (
    <div className="rounded-2xl border border-border bg-card p-5">{inner}</div>
  );
}

function ItemList({ items }: { items: { id: string; top: string; bottom: string; badge?: string }[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.id} className="flex items-center gap-2 text-sm">
          <span className="size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="font-medium truncate block">{it.top}</span>
            <span className="text-xs text-muted-foreground truncate block">{it.bottom}</span>
          </span>
          {it.badge && <span className="shrink-0 rounded-full bg-danger/10 text-danger text-[10px] px-2 py-0.5">{it.badge}</span>}
        </li>
      ))}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function GettingStarted() {
  const { i18n } = useTranslation();
  const fr = i18n.language === "fr";
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-soft animate-fade-in">
      <div className="mx-auto size-12 rounded-2xl bg-primary/10 text-primary grid place-items-center">
        <Sparkles className="size-6" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">
        {fr ? "Bienvenue ! Connecte ta boîte mail" : "¡Bienvenido! Conecta tu correo"}
      </h3>
      <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
        {fr
          ? "Connecte ton compte Gmail dans Réglages, puis synchronise ta boîte depuis l'onglet Boîte. L'IA analysera tes e-mails automatiquement."
          : "Conecta tu cuenta de Gmail en Ajustes y luego sincroniza desde la pestaña Bandeja. La IA analizará tus correos automáticamente."}
      </p>
      <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
        <Link to="/ajustes" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plug className="size-4" />
          {fr ? "Connecter mon e-mail" : "Conectar mi correo"}
        </Link>
        <Link to="/bandeja" className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors">
          {fr ? "Aller à la boîte" : "Ir a la bandeja"}
        </Link>
      </div>
    </div>
  );
}
