-- Migrazione: aggiunge il salvataggio dei dischi presi ma non ancora
-- piazzati, così un refresh a metà turno non li fa più "sparire".
-- Esegui nel SQL Editor di Supabase — non tocca le partite esistenti.

alter table players add column if not exists pending_take jsonb;
