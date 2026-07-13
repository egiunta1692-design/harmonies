-- Migrazione: passaggio da login anonimo a registrazione via email.
--
-- Prima: ogni "sessione anonima" del browser era un'identità a sé, mai
-- stabile tra un dispositivo/browser e l'altro — da qui i problemi di
-- rientro in partita gestiti nella migrazione precedente (claim_player).
--
-- Ora: ogni persona si registra con email+password una volta sola.
-- auth.uid() resta stabile per sempre per quell'account, su qualunque
-- dispositivo/browser (basta rifare login) — risolve alla radice il
-- problema del rientro, in modo più robusto del "reclamo per nickname"
-- di prima (che resta comunque utile come rete di sicurezza per le
-- vecchie partite create con login anonimo).
--
-- Il nickname ora è un identificativo dell'ACCOUNT (unico in tutta
-- l'app, non solo per stanza), scelto una volta alla registrazione.
--
-- Esegui nel SQL Editor di Supabase.

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_nickname_unique on profiles (lower(trim(nickname)));

alter table profiles enable row level security;

-- Tutti gli utenti autenticati possono leggere i nickname altrui
-- (servono per mostrare i nomi degli altri giocatori in partita).
create policy "profiles: lettura per autenticati" on profiles
  for select using (auth.role() = 'authenticated');

-- Solo il proprietario può creare/aggiornare il PROPRIO profilo.
create policy "profiles: insert solo proprio profilo" on profiles
  for insert with check (auth.uid() = id);

create policy "profiles: update solo proprio profilo" on profiles
  for update using (auth.uid() = id);
