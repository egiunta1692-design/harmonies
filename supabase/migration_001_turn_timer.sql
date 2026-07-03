-- Migrazione: aggiunge il timestamp di inizio partita e il contatore
-- turni a un database già creato con lo schema precedente.
-- Esegui questo script UNA VOLTA nel SQL Editor di Supabase — non tocca
-- le partite/righe esistenti, aggiunge solo le due colonne mancanti.

alter table games add column if not exists started_at timestamptz;
alter table games add column if not exists turn_count int not null default 0;
