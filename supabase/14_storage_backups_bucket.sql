-- Bucket privado para backups CSV (Edge Function `backup-daily`).
-- El cliente anon/authenticated no necesita políticas si solo el service_role escribe.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('backups', 'backups', false, 104857600, NULL)
ON CONFLICT (id) DO NOTHING;
