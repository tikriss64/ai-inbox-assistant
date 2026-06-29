-- Auditoría: índices para acelerar las consultas frecuentes de la bandeja,
-- el análisis y el panel (D1/SQLite no los crea solo).
CREATE INDEX IF NOT EXISTS idx_email_received ON email(received_at);
CREATE INDEX IF NOT EXISTS idx_email_type ON email(type);
CREATE INDEX IF NOT EXISTS idx_email_analyzed ON email(analyzed_at);
CREATE INDEX IF NOT EXISTS idx_email_folder ON email(folder);
CREATE INDEX IF NOT EXISTS idx_email_sender ON email(sender_email);
CREATE INDEX IF NOT EXISTS idx_runs_ran_at ON robot_runs(ran_at);
CREATE INDEX IF NOT EXISTS idx_rules_pattern ON router_rules(pattern_type, pattern);
