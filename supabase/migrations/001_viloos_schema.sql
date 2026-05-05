-- VILO CRM (ViloOS) — migración de referencia
--
-- El esquema completo vive en scripts numerados junto a esta carpeta:
--   supabase/01_schema.sql … supabase/25_agent_control.sql
--
-- Para una base nueva: ejecútalos en orden en el SQL Editor de Supabase
-- (o automatiza con tu pipeline). Este archivo existe para alinear el árbol
-- `supabase/migrations/` con el CLI; no sustituye aún todos los scripts legacy.
--
-- Siguiente paso recomendado: partir 01–25 en migraciones con timestamp
-- (`supabase migration new …`) si usas `supabase db push`.

SELECT 1;
