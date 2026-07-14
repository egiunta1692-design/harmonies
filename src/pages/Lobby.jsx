import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { joinGame } from '../lib/joinGame'
import { createInitialGameState } from '../game-engine'
import Loader from '../components/Loader'
import { page, cardWide, title, inputStyle, primaryButton, secondaryButton, errorText, linkText } from '../styles/theme'

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
  const [showFinished, setShowFinished] = useState(false)
  const navigate = useNavigate()

  // Le mie partite: si può giocare a più partite contemporaneamente,
  // quindi qui mostriamo tutte quelle a cui risulti seduto (in attesa,
  // in corso, o concluse — queste ultime in un elenco a parte, vedi
  // sotto), ognuna con un link diretto per rientrarci.
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
      setMyGames((data ?? []).map((row) => row.games).filter(Boolean))
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

  if (myGames === null) return <Loader message="Carico le tue stanze..." />

  const radioLabel = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.9rem', color: '#2c2417' }
  const sectionLabel = { fontWeight: 700, fontSize: '0.85rem', color: '#2c2417', margin: '0 0 8px' }

  const activeGames = myGames.filter((g) => g.status !== 'finished')
  const finishedGames = myGames.filter((g) => g.status === 'finished')

  const gameRow = (g) => (
    <div
      key={g.id}
      onClick={() => navigate(`/game/${g.id}`)}
      style={{
        border: '1px solid #e4ddcc',
        borderRadius: 14,
        padding: '10px 14px',
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
      <span style={{ fontSize: '0.8rem', color: '#5a5142' }}>
        {g.status === 'waiting' ? '⏳ in attesa' : g.status === 'finished' ? '🏆 conclusa' : `▶️ turno ${g.turn_count}`}
      </span>
    </div>
  )

  return (
    <div style={page}>
      <div style={{ ...cardWide, width: 680 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
          <h1 style={{ ...title, margin: 0, textAlign: 'left' }}>Harmonies online</h1>
          <button onClick={onSignOut} style={linkText}>
            Esci ({profile.nickname})
          </button>
        </div>

        <div style={{ display: 'flex', gap: 24 }}>
          {/* Colonna sinistra: creazione ed ingresso in una stanza */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={sectionLabel}>Nuova stanza</p>
            <label style={radioLabel}>
              <input type="radio" name="boardMode" checked={boardMode === 'standard'} onChange={() => setBoardMode('standard')} />
              Standard (lato A — punteggio Fiume)
            </label>
            <label style={radioLabel}>
              <input type="radio" name="boardMode" checked={boardMode === 'isole'} onChange={() => setBoardMode('isole')} />
              Isole (lato B — punteggio Isole)
            </label>
            <label style={{ ...radioLabel, marginBottom: '1rem' }}>
              <input type="checkbox" checked={natureSpiritExtension} onChange={(e) => setNatureSpiritExtension(e.target.checked)} />
              🌿 Carte Spirito della Natura (estensione)
            </label>

            <button onClick={handleCreate} disabled={loading} style={primaryButton}>
              ➕ Crea una nuova stanza
            </button>

            <hr style={{ border: 'none', borderTop: '1px solid #e4ddcc', margin: '1.25rem 0' }} />

            <p style={sectionLabel}>Entra in una stanza esistente</p>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Codice stanza"
              style={inputStyle}
            />
            <button onClick={handleJoin} disabled={loading} style={secondaryButton}>
              🚪 Entra in una stanza
            </button>

            {error && <p style={errorText}>{error}</p>}
          </div>

          {/* Colonna destra: le partite a cui partecipi già */}
          <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid #e4ddcc', paddingLeft: 24 }}>
            {activeGames.length === 0 && finishedGames.length === 0 && (
              <p style={{ color: '#5a5142', fontSize: '0.85rem' }}>Non hai ancora nessuna partita — creane una o entra in una stanza.</p>
            )}

            {activeGames.length > 0 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <p style={sectionLabel}>Le tue partite</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{activeGames.map(gameRow)}</div>
              </div>
            )}

            {finishedGames.length > 0 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <p onClick={() => setShowFinished(!showFinished)} style={{ ...sectionLabel, cursor: 'pointer', color: '#5a5142' }}>
                  {showFinished ? '▾' : '▸'} Partite concluse ({finishedGames.length})
                </p>
                {showFinished && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{finishedGames.map(gameRow)}</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
