-- Migrazione: aggiunge il rilevamento delle condizioni di fine partita
-- (pag. 7 del manuale). Esegui nel SQL Editor di Supabase — non tocca
-- le partite esistenti (restano tutte con final_round = false).

alter table games add column if not exists final_round boolean not null default false;
alter table games add column if not exists final_round_reason text;
alter table games add column if not exists final_round_trigger_player_id uuid;
