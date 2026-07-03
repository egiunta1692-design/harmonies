-- Migrazione: aggiunge la modalità plancia (Standard/Fiume vs Isole) a
-- un database già creato. Esegui nel SQL Editor di Supabase — non tocca
-- le partite esistenti (restano tutte "standard" per default).

alter table games add column if not exists board_mode text not null default 'standard';
