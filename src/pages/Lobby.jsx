import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, ensureAnonymousSession } from '../lib/supabaseClient'
import { createInitialGameState, createEmptyPlayerBoard, ANIMAL_CARDS } from '../game-engine'
import HabitatIcon from '../components/HabitatIcon'

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
  const [showAllCards, setShowAllCards] = useState(false) // debug: verifica visiva di tutte le carte
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
        background: '#fdfbf3'
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

      <hr />
      <button onClick={() => setShowAllCards(true)} style={{ width: '100%', fontSize: '0.8rem' }}>
        🔍 Verifica tutte le carte Animale (debug)
      </button>

      {showAllCards && (
        <div
          onClick={() => setShowAllCards(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 20,
              width: '100%',
              maxWidth: 900,
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 10px 40px rgba(0,0,0,0.35)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>Tutte le carte Animale ({ANIMAL_CARDS.length})</h2>
              <button onClick={() => setShowAllCards(false)}>Chiudi</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {ANIMAL_CARDS.map((card) => (
                <div key={card.id} style={{ border: '1px solid #ccc', borderRadius: 6, padding: 8, width: 110 }}>
                  <div style={{ fontWeight: 'bold', fontSize: 12 }}>{card.name}</div>
                  <div style={{ fontSize: 11, color: '#666' }}>{card.points.join('/')}</div>
                  <div style={{ fontSize: 10, color: '#999', marginBottom: 4 }}>{card.points.length} cubi</div>
                  <HabitatIcon habitat={card.habitat} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
