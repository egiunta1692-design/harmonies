-- Migrazione: aggiunge il supporto per l'espansione "Carte Spirito
-- della Natura". Esegui nel SQL Editor di Supabase — non tocca le
-- partite esistenti (restano tutte con l'espansione disattivata).

alter table games add column if not exists nature_spirit_extension boolean not null default false;
alter table players add column if not exists nature_spirit_choices jsonb;
-- nature_spirit_card esiste già dallo schema iniziale (era un placeholder
-- per questa fase avanzata): se il tuo database è stato creato prima di
-- questa espansione ma DOPO lo schema iniziale, potrebbe già esserci.
alter table players add column if not exists nature_spirit_card jsonb;
