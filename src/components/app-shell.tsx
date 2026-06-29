import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Sun,
  Moon,
  Sparkles,
  Sunrise,
  Inbox,
  Send,
  Clock,
  FileText,
  ShieldAlert,
  CalendarDays,
  LayoutDashboard,
  Menu,
  X,
} from "lucide-react";
import { PrivacyBadge } from "./privacy-badge";
import { ContextPanel } from "./context-panel";
import { LanguageToggle } from "./language-toggle";
import { AskBar } from "./ask-bar";
import { FocusToggle } from "./focus-toggle";
import { SettingsMenu } from "./settings-menu";
import { SidebarNotes } from "./sidebar-notes";
import { AssistantChat } from "./assistant-chat";

const navItems = [
  { to: "/", labelKey: "nav.hoy", icon: Sunrise },
  { to: "/bandeja", labelKey: "nav.bandeja", icon: Inbox },
  { to: "/enviados", labelKey: "nav.enviados", icon: Send },
  { to: "/agenda", labelKey: "nav.agenda", icon: CalendarDays },
  { to: "/esperando", labelKey: "nav.esperando", icon: Clock },
  { to: "/documentos", labelKey: "nav.documentos", icon: FileText },
  { to: "/riesgos", labelKey: "nav.riesgos", icon: ShieldAlert },
  { to: "/control", labelKey: "nav.control", icon: LayoutDashboard },
] as const;

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = (typeof localStorage !== "undefined" && localStorage.getItem("theme")) as
      | "light"
      | "dark"
      | null;
    // Dark-first: el modo oscuro es el protagonista (estilo Superhuman/Linear).
    // Solo se usa claro si el usuario lo eligió explícitamente antes.
    const initial = stored ?? "dark";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {}
  };

  return { theme, toggle };
}

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  // Cierra el menú móvil al cambiar de página.
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground overflow-x-hidden">
      {/* Fondo oscuro al abrir el menú en móvil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}
      <aside
        className={[
          "w-60 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col",
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200",
          "lg:static lg:z-auto lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        <div className="h-16 flex items-center gap-2 px-5 border-b border-sidebar-border">
          <div className="size-9 rounded-xl bg-gradient-to-br from-sky-400 via-indigo-400 to-violet-500 text-white grid place-items-center shadow-soft ring-1 ring-white/25">
            <Sparkles className="size-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-white tracking-tight">{t("shell.appName")}</div>
            <div className="text-[11px] font-medium text-sky-200/80">{t("shell.appSub")}</div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label={t("shell.themeToggle")}
            className="ml-auto lg:hidden size-8 rounded-lg grid place-items-center text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="pt-6 px-3 space-y-1.5">
          {navItems.map(({ to, labelKey, icon: Icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={[
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-sm"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground font-medium",
                ].join(" ")}
              >
                <Icon className="size-4" />
                <span>{t(labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex-1 min-h-6" />

        <div className="border-t border-sidebar-border pt-3">
          <SidebarNotes />
        </div>

        <div className="p-3 text-[11px] text-sidebar-foreground/55 border-t border-sidebar-border">
          {t("shell.version")}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border flex items-center justify-between px-4 sm:px-6 bg-background/80 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Menú"
              className="lg:hidden size-9 rounded-lg border border-border grid place-items-center hover:bg-accent transition-colors shrink-0"
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-semibold truncate">{t("shell.appTitle")}</h1>
              <p className="text-xs text-muted-foreground truncate hidden sm:block">{t("shell.appTagline")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* En móvil se ocultan (la cabecera no cabe): la búsqueda la cubre el chatbot. */}
            <div className="hidden sm:block"><FocusToggle /></div>
            <div className="hidden sm:block"><PrivacyBadge /></div>
            <div className="hidden lg:block"><AskBar /></div>
            <LanguageToggle />
            <SettingsMenu />
            <button
              onClick={toggle}
              aria-label={t("shell.themeToggle")}
              className="size-9 rounded-full border border-border hover:bg-accent grid place-items-center transition-colors"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <Link
              to="/ajustes"
              aria-label={t("settings.openFull")}
              title={t("settings.openFull")}
              className="size-9 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground text-sm font-medium shadow-soft hover:opacity-90 transition"
            >
              JL
            </Link>
          </div>
        </header>

        <div className="flex-1 flex min-h-0">
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-8 min-w-0 bg-[color-mix(in_oklab,var(--primary)_2.5%,var(--background))]">{children}</main>

          <aside className="w-80 shrink-0 border-l border-border bg-card/40 p-6 hidden lg:block overflow-auto">
            <ContextPanel />
          </aside>
        </div>
      </div>
      <AssistantChat />
    </div>
  );
}
