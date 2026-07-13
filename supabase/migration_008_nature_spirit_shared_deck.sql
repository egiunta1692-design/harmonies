-- Migrazione: il mazzo delle carte Spirito della Natura ora vive sulla
-- partita (condiviso), non più distribuito direttamente ai giocatori
-- all'avvio. Motivo: le regole di sicurezza (RLS) permettono a un
-- utente di scrivere SOLO sulla propria riga in "players" — chi cliccava
-- "Avvia partita" non riusciva a scrivere le carte per GLI ALTRI
-- giocatori (scrittura silenziosamente ignorata, nessun errore). Ogni
-- giocatore pesca ora le proprie 2 carte al suo turno, scrivendo solo
-- sulla propria riga + quella condivisa della partita.
-- Esegui nel SQL Editor di Supabase.

alter table games add column if not exists nature_spirit_deck jsonb;
