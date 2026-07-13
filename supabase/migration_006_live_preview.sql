-- Migrazione: aggiunge l'anteprima live della plancia/carte del turno in
-- corso, così gli avversari vedono in tempo reale dischi e cubi mentre
-- li piazzi, non solo dopo la conferma del turno. Esegui nel SQL Editor
-- di Supabase — non tocca le partite esistenti.

alter table players add column if not exists live_preview jsonb;
