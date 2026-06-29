-- Estado leído/no leído de cada correo (0 = no leído, 1 = leído).
-- Se sincroniza con la etiqueta UNREAD de Gmail y se marca al abrir el correo.
ALTER TABLE email ADD COLUMN is_read INTEGER DEFAULT 0;
