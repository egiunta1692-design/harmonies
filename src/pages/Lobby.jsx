import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { joinGame } from '../lib/joinGame'
import { createInitialGameState } from '../game-engine'

function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // niente caratteri ambigui
  let code = ''
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export default function Lobby({ profile, onSignOut }) {
  const [joinCode, setJoinCode] = useState('')
  const [boardMode, setBoardMode] = useState('standard')
  const [natureSpiritExtension, setNatureSpiritExtension] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [myGames, setMyGames] = useState(null) // null = ancora in caricamento
  const navigate = useNavigate()

  // Le mie partite: si può giocare a più partite contemporaneamente,
  // quindi qui mostriamo tutte quelle a cui risulti seduto (in attesa
  // o in corso), ognuna con un link diretto per rientrarci.
  useEffect(() => {
    let cancelled = false
    async function loadMyGames() {
      const {
        data: { user }
      } = await supabase.auth.getUser()
      if (!user) return

      const { data, error: gamesError } = await supabase
        .from('players')
        .select('game_id, games(id, room_code, status, board_mode, nature_spirit_extension, turn_count, created_at)')
        .eq('user_id', user.id)
        .order('created_at', { referencedTable: 'games', ascending: false })

      if (cancelled) return
      if (gamesError) {
        setMyGames([])
        return
      }
      // Filtro le partite finite: non servono più link diretti per
      // quelle, e teniamo la lista corta e utile.
      setMyGames((data ?? []).map((row) => row.games).filter((g) => g && g.status !== 'finished'))
    }
    loadMyGames()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleCreate() {
    setLoading(true)
    setError(null)
    try {
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
          board_mode: boardMode,
          nature_spirit_extension: natureSpiritExtension
        })
        .select()
        .single()
      if (gameError) throw gameError

      await joinGame({ gameId: game.id, boardMode, profile })

      navigate(`/game/${game.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return setError('Inserisci il codice stanza')
    setLoading(true)
    setError(null)
    try {
      const { data: game, error: gameError } = await supabase
        .from('games')
        .select()
        .eq('room_code', joinCode.trim().toUpperCase())
        .single()
      if (gameError) throw new Error('Stanza non trovata')

      await joinGame({ gameId: game.id, boardMode: game.board_mode, profile })

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
        maxWidth: 420,
        margin: '4rem auto',
        fontFamily: 'sans-serif',
        border: '1px solid #4a3f2f',
        borderRadius: 8,
        padding: '1.5rem',
        background: '#fdfbf3'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Harmonies online</h1>
        <button onClick={onSignOut} style={{ fontSize: '0.8rem' }}>
          Esci ({profile.nickname})
        </button>
      </div>

      {myGames === null && <p style={{ color: '#666' }}>Carico le tue partite...</p>}

      {myGames !== null && myGames.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontWeight: 'bold', margin: '0 0 6px' }}>Le tue partite:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {myGames.map((g) => (
              <div
                key={g.id}
                onClick={() => navigate(`/game/${g.id}`)}
                style={{
                  border: '1px solid #ccc',
                  borderRadius: 6,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#fff'
                }}
              >
                <span>
                  <strong>{g.room_code}</strong> · {g.board_mode === 'isole' ? 'Isole' : 'Standard'}
                  {g.nature_spirit_extension ? ' · 🌿' : ''}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#666' }}>
                  {g.status === 'waiting' ? '⏳ in attesa' : `▶️ turno ${g.turn_count}`}
                </span>
              </div>
            ))}
          </div>
          <hr style={{ margin: '1rem 0' }} />
        </div>
      )}

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

      <label style={{ display: 'block', marginBottom: '1rem' }}>
        <input
          type="checkbox"
          checked={natureSpiritExtension}
          onChange={(e) => setNatureSpiritExtension(e.target.checked)}
        />{' '}
        🌿 Carte Spirito della Natura (estensione)
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
