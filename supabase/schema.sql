-- Schema Harmonies Online — da eseguire nel SQL Editor di Supabase
-- Modello: 1 riga "games" per partita, N righe "players" per giocatore,
-- N righe "moves" come log (utile per debug/replay, non obbligatorio da leggere runtime).

create extension if not exists pgcrypto;

-- ============================================================
-- GAMES: stato condiviso della partita (plancia centrale, sacchetto, turno)
-- ============================================================
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,               -- codice a 4-6 lettere per invitare gli amici
  status text not null default 'waiting',        -- waiting | playing | finished
  central_board jsonb not null default '[]'::jsonb,   -- 5 caselle x 3 dischi
  bag jsonb not null default '[]'::jsonb,              -- dischi rimanenti da pescare
  animal_deck jsonb not null default '[]'::jsonb,      -- mazzo di pesca carte Animale
  animal_row jsonb not null default '[]'::jsonb,       -- 5 carte Animale scoperte
  turn_order uuid[] not null default '{}',             -- ordine dei player_id
  current_turn_index int not null default 0,
  turn_count int not null default 0,             -- contatore progressivo dei turni giocati
  started_at timestamptz,                        -- valorizzato quando la partita passa a "playing"
  board_mode text not null default 'standard',   -- 'standard' (Fiume) oppure 'isole'
  final_round boolean not null default false,          -- pag. 7: è scattato l'ultimo giro?
  final_round_reason text,                             -- 'plancia' oppure 'sacchetto'
  final_round_trigger_player_id uuid,                   -- chi l'ha fatto scattare
  nature_spirit_extension boolean not null default false, -- espansione "Carte Spirito della Natura" attiva per questa partita
  nature_spirit_deck jsonb,                                -- mazzo condiviso, mescolato all'avvio: ogni giocatore pesca le proprie 2 carte al SUO primo turno (mai scritture incrociate tra giocatori, bloccate da RLS)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PLAYERS: plancia personale di ogni giocatore in una partita
-- ============================================================
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid not null,                          -- da supabase auth (anche anonimo)
  nickname text not null,
  board_state jsonb not null default '{}'::jsonb,  -- griglia esagonale con i dischi piazzati
  animal_cards jsonb not null default '[]'::jsonb, -- carte in mano + cubi rimasti da piazzare
  nature_spirit_card jsonb,                        -- { cardId, cubesPlaced } la carta Spirito della Natura scelta (0 o 1 cubo, mai di più)
  nature_spirit_choices jsonb,                      -- [cardIdA, cardIdB] le 2 carte coperte, finché non scegli (poi torna null)
  pending_take jsonb,                               -- { slotIndex, discs, remaining } se hai preso dischi non ancora confermati (sopravvive a un refresh, remaining è live per gli avversari)
  pending_animal_card jsonb,                         -- { cardId, slotIndex } se hai preso una carta Animale non ancora confermata (sopravvive a un refresh)
  live_preview jsonb,                                -- { board_state, animal_cards } anteprima delle mosse di questo turno non ancora confermate, per farle vedere live agli avversari
  score int,
  joined_at timestamptz not null default now(),
  unique (game_id, user_id)
);
create unique index if not exists players_game_nickname_unique on players (game_id, lower(trim(nickname)));

-- ============================================================
-- MOVES: log delle azioni (utile per debug, undo, replay futuro)
-- ============================================================
create table if not exists moves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  action jsonb not null,     -- { type: 'place_disc' | 'take_animal_card' | 'place_animal_cube', ... }
  created_at timestamptz not null default now()
);

-- ============================================================
-- REALTIME: abilita il push automatico ai client sottoscritti
-- ============================================================
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table moves;

-- ============================================================
-- ROW LEVEL SECURITY: livello base per l'MVP.
-- Chiunque sia autenticato (anche in modo anonimo) può leggere tutto
-- (serve per vedere le plance degli altri giocatori) e scrivere le
-- proprie mosse. Non impedisce di barare via devtools: la vera
-- validazione anti-cheat arriverà con la Edge Function nella fase 2.
-- ============================================================
alter table games enable row level security;
alter table players enable row level security;
alter table moves enable row level security;

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

create policy "moves: lettura pubblica" on moves
  for select using (true);
create policy "moves: scrittura da autenticati" on moves
  for insert with check (auth.uid() is not null);

-- ============================================================
-- GRANT: dal 30/05/2026 i nuovi progetti Supabase NON espongono
-- più le tabelle alla Data API per default. Senza questi GRANT,
-- supabase-js riceve un errore 42501 "permission denied" ancora
-- prima che le policy RLS qui sopra vengano valutate.
-- I nostri utenti (anche quelli anonimi) usano il ruolo
-- "authenticated", quindi non serve concedere nulla al ruolo "anon".
-- ============================================================
grant select, insert, update on public.games to authenticated;
grant select, insert, update on public.players to authenticated;
grant select, insert on public.moves to authenticated;
