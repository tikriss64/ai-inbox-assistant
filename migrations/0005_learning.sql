-- Fase 3: "robots que aprenden". Reglas de clasificación aprendidas de las
-- correcciones del usuario. Permiten clasificar correos a 0 tokens (sin IA).
CREATE TABLE IF NOT EXISTS router_rules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_type TEXT NOT NULL,            -- 'domain' | 'sender'
  pattern      TEXT NOT NULL,            -- dominio (ej. 'amazon.es') o email del remitente
  email_type   TEXT NOT NULL,            -- categoría personal aprendida
  hits         INTEGER NOT NULL DEFAULT 1, -- veces que se ha confirmado/aplicado
  created_at   INTEGER,
  updated_at   INTEGER,
  UNIQUE(pattern_type, pattern)
);

-- Cómo se clasificó cada correo: 'rule' (0 tokens) o 'ai'. Para el panel de ahorro.
ALTER TABLE email ADD COLUMN classified_by TEXT;
