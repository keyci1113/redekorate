-- Foto de perfil: ruta a un archivo subido (/uploads/…).
alter table users add column if not exists avatar text;
