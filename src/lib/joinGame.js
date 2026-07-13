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

  if (existing) return existing

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
