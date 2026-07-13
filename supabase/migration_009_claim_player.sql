-- Migrazione: gestione corretta del rientro in partita quando la
-- sessione anonima precedente è andata persa (es. tab chiusa in
-- incognito, storage del browser svuotato) o quando si rientra da un
-- dispositivo/browser diverso.
--
-- Prima: l'identità di un giocatore era legata SOLO all'auth.uid()
-- della sessione anonima. Se quella sessione si perdeva, non c'era
-- modo di "tornare" quel giocatore — o restava tutto bloccato
-- (link diretto /game/xxx senza sessione) o si creava per errore un
-- secondo giocatore con lo stesso nickname (rientro dalla Lobby).
--
-- Ora: una funzione SECURITY DEFINER cerca un giocatore in quella
-- stanza con quel nickname (case-insensitive) e, se lo trova, ne
-- riassegna la riga alla sessione ANONIMA CORRENTE di chi chiama —
-- mai a un'identità diversa da chi sta effettivamente chiamando la
-- funzione (auth.uid() viene letto internamente, non passato come
-- parametro, quindi non è falsificabile dal client).
--
-- Esegui nel SQL Editor di Supabase.

-- Vincolo di unicità: due giocatori nella STESSA stanza non possono
-- avere lo stesso nickname (case-insensitive) — necessario perché il
-- meccanismo di "reclamo" per nickname (claim_player, sotto) sia
-- sempre inequivocabile: un nickname individua al massimo un
-- giocatore per stanza, mai due persone diverse che potrebbero
-- "rubarsi" a vicenda la riga a ogni rientro.
create unique index if not exists players_game_nickname_unique
  on players (game_id, lower(trim(nickname)));

create or replace function claim_player(p_game_id uuid, p_nickname text)
returns players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player players;
begin
  select * into v_player
  from players
  where game_id = p_game_id
    and lower(trim(nickname)) = lower(trim(p_nickname))
  limit 1;

  if v_player.id is null then
    return null; -- nessun giocatore con questo nickname in questa stanza: il client farà un insert normale
  end if;

  update players
  set user_id = auth.uid()
  where id = v_player.id
  returning * into v_player;

  return v_player;
end;
$$;

grant execute on function claim_player(uuid, text) to authenticated, anon;
