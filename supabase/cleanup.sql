-- ============================================================
-- Pulizia e allineamento per database ESISTENTI (creati prima della
-- versione consolidata di schema.sql). Se stai creando un progetto
-- Supabase da zero, non ti serve questo file: usa solo schema.sql.
--
-- Esegui UNA VOLTA nel SQL Editor di Supabase.
-- ============================================================

-- --- Correzione: grant mancante sulla tabella profiles ---------------
-- Senza questo, ogni lettura/scrittura del profilo (quindi l'intero
-- login) falliva con "permission denied" sui progetti Supabase creati
-- dopo il 30/05/2026.
grant select, insert, update on public.profiles to authenticated;

-- --- Rimozione: sistema di "reclamo per nickname" (migration_009) ---
-- Superato dall'autenticazione via email: auth.uid() è stabile di suo,
-- non serve più riassegnare righe player per nickname.
drop function if exists claim_player(uuid, text);
drop index if exists players_game_nickname_unique;

-- --- Rimozione: colonne mai lette né scritte dall'app ----------------
alter table players drop column if exists score;
alter table players drop column if exists joined_at;
alter table games drop column if exists updated_at;

-- --- Rimozione: tabella "moves" (log mai implementato) ---------------
-- Era pensata per debug/replay futuro ma non è mai stata scritta né
-- letta da nessuna parte dell'app.
drop table if exists moves;
