-- Migrazione: salva anche la carta Animale presa ma non ancora
-- confermata, così un refresh non permette più di prenderne una seconda
-- nello stesso turno. Esegui nel SQL Editor di Supabase.

alter table players add column if not exists pending_animal_card jsonb;
