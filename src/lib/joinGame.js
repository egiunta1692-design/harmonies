import { supabase } from './supabaseClient'
import { createEmptyPlayerBoard } from '../game-engine'

// Entra in una partita con il profilo dell'utente autenticato. Con
// l'autenticazione via email, auth.uid() è stabile per sempre su
// quell'account — quindi "sei già in questa partita?" si riduce a un
// controllo diretto su (game_id, user_id).
export async function joinGame({ gameId, boardMode, profile }) {
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Non sei autenticato')

  const { data: existing } = await supabase
    .from('players')
    .select()
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .maybeSingle()

  // Chi era già seduto a questa partita può sempre rientrare, qualunque
  // sia lo stato attuale (in attesa, in corso, conclusa) — è un rientro,
  // non un nuovo ingresso.
  if (existing) return existing

  // Un NUOVO giocatore, invece, può entrare solo mentre la partita è
  // ancora in attesa: altrimenti resterebbe un "fantasma" con plancia
  // vuota, senza turno_order (fissato all'avvio) e quindi senza mai un
  // turno — e se la partita fosse già conclusa, sporcherebbe anche la
  // classifica finale.
  const { data: game, error: gameError } = await supabase.from('games').select('status').eq('id', gameId).single()
  if (gameError) throw gameError
  if (game.status !== 'waiting') {
    throw new Error('Questa partita è già iniziata: non puoi più entrare come nuovo giocatore.')
  }

  const { data: inserted, error } = await supabase
    .from('players')
    .insert({
      game_id: gameId,
      user_id: user.id,
      nickname: profile.nickname,
      board_state: createEmptyPlayerBoard(boardMode)
    })
    .select()
    .single()

  if (error) throw error
  return inserted
}
