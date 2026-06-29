-- Fase 5: "robot manager". Registro de cada ejecución del orquestador (cron/manual):
-- qué sincronizó, cuántos clasificó por regla (0 tokens) vs IA, y cuánto tardó.
-- Alimenta el centro de control (actividad de los robots).
CREATE TABLE IF NOT EXISTS robot_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at      INTEGER,
  trigger     TEXT,                 -- 'cron' | 'manual'
  synced      INTEGER DEFAULT 0,    -- correos nuevos traídos de Gmail
  ruled       INTEGER DEFAULT 0,    -- clasificados por regla aprendida (sin IA)
  ai_analyzed INTEGER DEFAULT 0,    -- clasificados con IA
  embedded    INTEGER DEFAULT 0,    -- indexados en memoria
  duration_ms INTEGER DEFAULT 0
);
