-- Versión publicada de cada estudio: lo que ven los participantes. El builder edita blocks/settings como
-- borrador y "Publicar cambios" copia el borrador a la versión publicada. Así nadie a medio flujo se interrumpe.
alter table studies add column if not exists published_blocks jsonb;
alter table studies add column if not exists published_settings jsonb;
alter table studies add column if not exists published_version integer not null default 0;
update studies set published_blocks = blocks, published_settings = settings, published_version = 1
 where status in ('live', 'closed') and published_blocks is null;
-- Cada sesión recuerda con qué versión empezó.
alter table sessions add column if not exists study_version integer;
