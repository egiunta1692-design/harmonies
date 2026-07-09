import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, ensureAnonymousSession } from '../lib/supabaseClient'
import { createInitialGameState, createEmptyPlayerBoard } from '../game-engine'

function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // niente caratteri ambigui
  let code = ''
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export default function Lobby() {
  const [nickname, setNickname] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [boardMode, setBoardMode] = useState('standard')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleCreate() {
    if (!nickname.trim()) return setError('Inserisci un nickname')
    setLoading(true)
    setError(null)
    try {
      const session = await ensureAnonymousSession()
      const initial = createInitialGameState()

      const { data: game, error: gameError } = await supabase
        .from('games')
        .insert({
          room_code: randomRoomCode(),
          status: 'waiting',
          central_board: initial.centralBoard,
          bag: initial.bag,
          animal_deck: initial.animalDeck,
          animal_row: initial.animalRow,
          board_mode: boardMode
        })
        .select()
        .single()
      if (gameError) throw gameError

      const { error: playerError } = await supabase.from('players').insert({
        game_id: game.id,
        user_id: session.user.id,
        nickname,
        board_state: createEmptyPlayerBoard(boardMode)
      })
      if (playerError) throw playerError

      navigate(`/game/${game.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (!nickname.trim()) return setError('Inserisci un nickname')
    if (!joinCode.trim()) return setError('Inserisci il codice stanza')
    setLoading(true)
    setError(null)
    try {
      const session = await ensureAnonymousSession()

      const { data: game, error: gameError } = await supabase
        .from('games')
        .select()
        .eq('room_code', joinCode.trim().toUpperCase())
        .single()
      if (gameError) throw new Error('Stanza non trovata')

      // Se questo utente (stesso login anonimo, es. dopo un refresh della
      // pagina) è già seduto in questa stanza, non tento un altro insert
      // (fallirebbe per via del vincolo di unicità game_id+user_id): lo
      // riporto semplicemente dentro alla partita.
      const { data: existing } = await supabase
        .from('players')
        .select()
        .eq('game_id', game.id)
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (!existing) {
        const { error: playerError } = await supabase.from('players').insert({
          game_id: game.id,
          user_id: session.user.id,
          nickname,
          board_state: createEmptyPlayerBoard(game.board_mode)
        })
        if (playerError) throw playerError
      }

      navigate(`/game/${game.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        maxWidth: 360,
        margin: '4rem auto',
        fontFamily: 'sans-serif',
        border: '1px solid #4a3f2f',
        borderRadius: 8,
        padding: '1.5rem',
        background:
          '#fdfbf3 url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 200 200\'%3E%3Cpolygon points=\'100,10 182,55 182,145 100,190 18,145 18,55\' fill=\'none\' stroke=\'%236b8e5a\' stroke-width=\'3\' opacity=\'0.18\'/%3E%3Cpolygon points=\'100,45 152,72.5 152,127.5 100,155 48,127.5 48,72.5\' fill=\'none\' stroke=\'%23a97c50\' stroke-width=\'2\' opacity=\'0.18\'/%3E%3C/svg%3E") no-repeat bottom right / 160px 160px'
      }}
    >
      <h1>Harmonies online</h1>

      <label>
        Nickname
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '1rem' }} />
      </label>

      <p style={{ marginBottom: 4 }}>Modalità plancia (solo per chi crea la stanza):</p>
      <label style={{ display: 'block', marginBottom: 4 }}>
        <input
          type="radio"
          name="boardMode"
          value="standard"
          checked={boardMode === 'standard'}
          onChange={() => setBoardMode('standard')}
        />{' '}
        Standard (lato A — punteggio Fiume)
      </label>
      <label style={{ display: 'block', marginBottom: '1rem' }}>
        <input
          type="radio"
          name="boardMode"
          value="isole"
          checked={boardMode === 'isole'}
          onChange={() => setBoardMode('isole')}
        />{' '}
        Isole (lato B — punteggio Isole)
      </label>

      <button onClick={handleCreate} disabled={loading} style={{ width: '100%', marginBottom: '1rem' }}>
        ➕ Crea una nuova stanza
      </button>

      <hr />

      <label>
        Codice stanza
        <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '1rem' }} />
      </label>
      <button onClick={handleJoin} disabled={loading} style={{ width: '100%' }}>
        🚪 Entra in una stanza
      </button>

      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}
