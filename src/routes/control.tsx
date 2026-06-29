import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { useEffect, useState, type ReactNode, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, ShieldAlert, Sparkles, Bot, Mail } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Cell, Tooltip, ResponsiveContainer, PieChart, Pie, Legend } from "recharts";

interface RunRow {
  ran_at: number;
  trigger: string;
  synced: number;
  ruled: number;
  ai_analyzed: number;
  embedded: number;
  duration_ms: number;
}

interface ControlData {
  total: number;
  suspicious: number;
  rulesLearned: number;
  freePct: number;
  byType: { type: string; n: number }[];
  classified: { rule: number; ai: number; manual: number; none: number };
  robot: {
    lastRunAt: number | null;
    totalRuns: number;
    totalSynced: number;
    totalRuled: number;
    totalAi: number;
    recentRuns: RunRow[];
  };
  topRules: { pattern: string; email_type: string; hits: number }[];
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
const FALLBACK_COLOR = "#94a3b8";

function fmtDate(ts: number, fr: boolean): string {
  try {
    return new Date(ts).toLocaleString(fr ? "fr-FR" : "es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function Kpi({ icon: Icon, label, value, tone }: { icon: ComponentType<{ className?: string }>; label: string; value: number | string; tone?: "danger" | "ok" }) {
  const toneCls = tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : "text-primary";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className={`size-4 ${toneCls}`} /> {label}
      </div>
      <div className="text-2xl font-semibold mt-2 tabular-nums">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ControlPage() {
  const { t, i18n } = useTranslation();
  const fr = i18n.language === "fr";
  const [data, setData] = useState<ControlData | null>(null);
  const [loading, setLoading] = useState(true);

  const [autoArchive, setAutoArchive] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/control")
      .then((r) => r.json())
      .then((d: ControlData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    fetch("/api/config")
      .then((r) => r.json())
      .then((d: { autoArchive: Record<string, boolean> }) => setAutoArchive(d.autoArchive || {}))
      .catch(() => {});
  }, []);

  const toggleAuto = (cat: string) => {
    const next = !autoArchive[cat];
    setAutoArchive((s) => ({ ...s, [cat]: next }));
    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: cat, enabled: next }),
    }).catch(() => {});
  };

  const typeLabel = (ty: string) =>
    ty === "(sin clasificar)" ? (fr ? "Sans catégorie" : "Sin clasificar") : t(`bandeja.types.${ty}`, { defaultValue: ty });

  const barData = (data?.byType ?? [])
    .map((r) => ({ name: typeLabel(r.type), value: r.n, color: TYPE_COLORS[r.type] ?? FALLBACK_COLOR }))
    .sort((a, b) => b.value - a.value);

  const pieData = data
    ? [
        { name: fr ? "Règle (0 token)" : "Regla (0 tokens)", value: data.classified.rule, color: "#059669" },
        { name: "IA", value: data.classified.ai, color: "#6366f1" },
        { name: fr ? "Manuel" : "Manual", value: data.classified.manual, color: "#f59e0b" },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-8">
        <PageHeader
          icon={LayoutDashboard}
          title={fr ? "Centre de contrôle" : "Centro de control"}
          subtitle={fr ? "Ta boîte en chiffres : catégories, économie d'IA et apprentissage." : "Tu bandeja en números: categorías, ahorro de IA y aprendizaje."}
        />

        {loading ? (
          <p className="text-sm text-muted-foreground">{fr ? "Chargement…" : "Cargando…"}</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">{fr ? "Impossible de charger les statistiques." : "No se pudieron cargar las estadísticas."}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Kpi icon={Mail} label={fr ? "E-mails" : "Correos"} value={data.total} />
              <Kpi icon={ShieldAlert} label={fr ? "Suspects" : "Sospechosos"} value={data.suspicious} tone="danger" />
              <Kpi icon={Bot} label={fr ? "Règles apprises" : "Reglas aprendidas"} value={data.rulesLearned} />
              <Kpi icon={Sparkles} label={fr ? "Classés sans IA" : "Clasificados sin IA"} value={`${data.freePct}%`} tone="ok" />
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <ChartCard title={fr ? "Par catégorie" : "Por categoría"}>
                {barData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{fr ? "Pas encore de données." : "Aún no hay datos."}</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 16, top: 4, bottom: 4 }}>
                      <XAxis type="number" allowDecimals={false} hide />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                      <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                        {barData.map((e, i) => (
                          <Cell key={i} fill={e.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title={fr ? "Comment c'est classé" : "Cómo se ha clasificado"}>
                {pieData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{fr ? "Pas encore de données." : "Aún no hay datos."}</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                        {pieData.map((e, i) => (
                          <Cell key={i} fill={e.color} />
                        ))}
                      </Pie>
                      <Legend />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Actividad del robot manager */}
              <ChartCard title={fr ? "Activité des robots" : "Actividad de los robots"}>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground mb-3">
                  <span>{fr ? "Exécutions" : "Ejecuciones"}: <b className="text-foreground">{data.robot.totalRuns}</b></span>
                  <span>{fr ? "Synchronisés" : "Sincronizados"}: <b className="text-foreground">{data.robot.totalSynced}</b></span>
                  <span>{fr ? "Par règle" : "Por regla"}: <b className="text-foreground">{data.robot.totalRuled}</b></span>
                  <span>{fr ? "Par IA" : "Por IA"}: <b className="text-foreground">{data.robot.totalAi}</b></span>
                </div>
                {data.robot.recentRuns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{fr ? "Le robot n'a pas encore tourné." : "El robot aún no se ha ejecutado."}</p>
                ) : (
                  <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                    {data.robot.recentRuns.map((r, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs rounded-lg border border-border px-2.5 py-1.5">
                        <span className="text-muted-foreground shrink-0">{fmtDate(r.ran_at, fr)}</span>
                        <span className="flex gap-2 flex-wrap justify-end">
                          <span title={fr ? "Synchronisés" : "Sincronizados"}>📥 {r.synced}</span>
                          <span className="text-emerald-600" title={fr ? "Par règle (0 token)" : "Por regla (0 tokens)"}>⚙️ {r.ruled}</span>
                          <span className="text-primary" title="IA">🧠 {r.ai_analyzed}</span>
                          <span className="text-muted-foreground">{(r.duration_ms / 1000).toFixed(1)}s</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </ChartCard>

              {/* Reglas aprendidas */}
              <ChartCard title={fr ? "Règles apprises" : "Reglas aprendidas"}>
                {data.topRules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {fr ? "Aucune règle encore. Corrige la catégorie d'un e-mail pour en créer une." : "Aún no hay reglas. Corrige la categoría de un correo para crear una."}
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                    {data.topRules.map((r, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs rounded-lg border border-border px-2.5 py-1.5">
                        <span className="font-medium truncate">{r.pattern}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="rounded-full bg-muted px-2 py-0.5">{typeLabel(r.email_type)}</span>
                          <span className="text-muted-foreground">×{r.hits}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </ChartCard>
            </div>

            {/* Auto-acciones */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-1">{fr ? "Actions automatiques" : "Auto-acciones"}</h3>
              <p className="text-xs text-muted-foreground mb-3">
                {fr ? "Archiver automatiquement ces catégories dès leur classement." : "Archivar automáticamente estas categorías en cuanto se clasifican."}
              </p>
              <div className="grid sm:grid-cols-3 gap-2">
                {["Promociones", "Notificaciones", "Suscripciones"].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleAuto(cat)}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 hover:bg-accent/40 transition-colors text-left"
                    aria-pressed={!!autoArchive[cat]}
                  >
                    <span className="flex items-center gap-2 text-sm min-w-0">
                      <span className="size-2.5 rounded-full shrink-0" style={{ background: TYPE_COLORS[cat] }} />
                      <span className="truncate">{typeLabel(cat)}</span>
                    </span>
                    <span className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${autoArchive[cat] ? "bg-primary" : "bg-muted"}`}>
                      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${autoArchive[cat] ? "left-[18px]" : "left-0.5"}`} />
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {fr
                ? "« Classés sans IA » = e-mails étiquetés par une règle apprise, sans dépenser de tokens. Corrige une catégorie pour apprendre une nouvelle règle."
                : "«Clasificados sin IA» = correos etiquetados por una regla aprendida, sin gastar tokens. Corrige una categoría para enseñar una regla nueva."}
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}

export const Route = createFileRoute("/control")({ component: ControlPage });
