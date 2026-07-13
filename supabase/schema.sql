-- ============================================================
-- Schema Harmonies Online — versione consolidata
-- Da eseguire UNA VOLTA sola nel SQL Editor di Supabase per creare
-- l'intero database da zero (comprende gioco base + espansione Carte
-- Spirito della Natura + autenticazione via email). Sostituisce tutte
-- le vecchie migrazioni incrementali: se stai creando un progetto
-- nuovo, ti basta questo unico file.
--
-- Se hai invece già un database esistente creato PRIMA di questa
-- versione consolidata, usa `cleanup.sql` per allinearlo (aggiunge
-- solo ciò che manca, toglie ciò che è stato rimosso).
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- PROFILES: identità dell'account (autenticazione via email).
-- Il nickname è l'identificativo dell'ACCOUNT, unico in tutta l'app,
-- scelto una volta alla registrazione — è anche il nickname usato in
-- tutte le partite (niente più nickname libero per stanza).
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_nickname_unique on profiles (lower(trim(nickname)));

-- ============================================================
-- GAMES: stato condiviso della partita (plancia centrale, sacchetto, turno)
-- ============================================================
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,                      -- codice a 4-6 lettere per invitare gli amici
  status text not null default 'waiting',               -- waiting | playing | finished
  central_board jsonb not null default '[]'::jsonb,     -- 5 caselle x 3 dischi
  bag jsonb not null default '[]'::jsonb,                -- dischi rimanenti da pescare
  animal_deck jsonb not null default '[]'::jsonb,        -- mazzo di pesca carte Animale
  animal_row jsonb not null default '[]'::jsonb,         -- 5 carte Animale scoperte
  turn_order uuid[] not null default '{}',               -- ordine dei player_id (mescolato all'avvio)
  current_turn_index int not null default 0,
  turn_count int not null default 0,                     -- contatore progressivo dei turni giocati
  started_at timestamptz,                                -- valorizzato quando la partita passa a "playing"
  board_mode text not null default 'standard',           -- 'standard' (Fiume) oppure 'isole'
  final_round boolean not null default false,            -- pag. 7: è scattato l'ultimo giro?
  final_round_reason text,                               -- 'plancia' oppure 'sacchetto'
  final_round_trigger_player_id uuid,                    -- chi l'ha fatto scattare
  nature_spirit_extension boolean not null default false, -- espansione "Carte Spirito della Natura" attiva per questa partita
  nature_spirit_deck jsonb,                              -- mazzo condiviso: ogni giocatore pesca le proprie 2 carte al SUO primo turno
  created_at timestamptz not null default now()
);

-- ============================================================
-- PLAYERS: plancia personale di ogni giocatore in una partita
-- ============================================================
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid not null,                            -- da supabase auth (auth.users.id)
  nickname text not null,                            -- copiato da profiles al momento dell'ingresso
  board_state jsonb not null default '{}'::jsonb,    -- griglia esagonale con i dischi piazzati
  animal_cards jsonb not null default '[]'::jsonb,   -- carte Animale in mano + cubi piazzati
  nature_spirit_card jsonb,                          -- { cardId, cubesPlaced } la carta Spirito della Natura scelta (0 o 1 cubo)
  nature_spirit_choices jsonb,                       -- [cardIdA, cardIdB] le 2 carte coperte, finché non scegli (poi torna null)
  pending_take jsonb,                                -- { slotIndex, discs, remaining } dischi presi non ancora confermati (sopravvive a un refresh)
  pending_animal_card jsonb,                         -- { cardId, slotIndex } carta Animale presa non ancora confermata (sopravvive a un refresh)
  live_preview jsonb,                                -- { board_state, animal_cards } anteprima live delle mosse del turno in corso, per gli avversari
  unique (game_id, user_id)
);

-- ============================================================
-- REALTIME: abilita il push automatico ai client sottoscritti
-- ============================================================
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table players;

-- ============================================================
-- ROW LEVEL SECURITY
-- Chiunque sia autenticato può leggere tutto (serve per vedere le
-- plance degli altri giocatori) e scrivere solo le proprie righe.
-- ============================================================
alter table profiles enable row level security;
alter table games enable row level security;
alter table players enable row level security;

create policy "profiles: lettura per autenticati" on profiles
  for select using (auth.role() = 'authenticated');
create policy "profiles: insert solo proprio profilo" on profiles
  for insert with check (auth.uid() = id);
create policy "profiles: update solo proprio profilo" on profiles
  for update using (auth.uid() = id);

create policy "games: lettura pubblica" on games
  for select using (true);
create policy "games: creazione da autenticati" on games
  for insert with check (auth.uid() is not null);
create policy "games: aggiornamento da autenticati" on games
  for update using (auth.uid() is not null);

create policy "players: lettura pubblica" on players
  for select using (true);
create policy "players: un utente crea solo la propria riga" on players
  for insert with check (auth.uid() = user_id);
create policy "players: un utente aggiorna solo la propria riga" on players
  for update using (auth.uid() = user_id);

-- ============================================================
-- GRANT: dal 30/05/2026 i nuovi progetti Supabase NON espongono più le
-- tabelle alla Data API per default. Senza questi GRANT, supabase-js
-- riceve un errore 42501 "permission denied" ancora prima che le
-- policy RLS qui sopra vengano valutate.
-- ============================================================
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.games to authenticated;
grant select, insert, update on public.players to authenticated;
