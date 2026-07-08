import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import HexBoard from '../components/HexBoard'
import HabitatIcon from '../components/HabitatIcon'
import ScoringReference from '../components/ScoringReference'
import FinalScoreboard from '../components/FinalScoreboard'
import CentralDiscPile from '../components/CentralDiscPile'
import { DISC_HEX } from '../components/DiscVisual'
import {
  createEmptyPlayerBoard,
  takeDiscsFromCentralBoard,
  refillCentralBoard,
  canPlaceDisc,
  placeDisc,
  getAnimalCard,
  findHabitatMatches,
  placeAnimalCube
} from '../game-engine'

// Ricostruisce la plancia "in bozza" applicando, in ordine, tutte le
// azioni (dischi E cubi) fatte in questo turno sopra la plancia
// confermata. Dischi e cubi condividono la stessa cronologia perché il
// regolamento permette di intercalarli liberamente (vedi l'esempio di
// Serena a pag. 6: piazza un disco, poi subito un cubo che quel disco
// ha appena reso possibile).
function rebuildBoardDraft(baseBoard, actions) {
  let board = baseBoard
  for (const action of actions) {
    try {
      board =
        action.type === 'disc'
          ? placeDisc(board, action.q, action.r, action.color)
          : placeAnimalCube(board, action.q, action.r, action.cardId)
    } catch {
      // Difesa contro una finestra di realtime già chiusa altrove (vedi
      // handleConfirmTurn): se per qualche motivo imprevisto un'azione
      // risultasse già applicata alla plancia base, la ignoriamo invece
      // di far crashare il render con un errore non gestito.
    }
  }
  return board
}

// Applica alla mano (carte Animale) solo i piazzamenti di cubi di questo
// turno, sopra alla mano REALE e aggiornata (non una fotografia presa a
// inizio turno): così se prendi una nuova carta a metà turno la vedi
// comparire subito, senza disallineamenti.
function applyHandDeltas(hand, actions) {
  let h = hand
  for (const action of actions) {
    if (action.type !== 'cube') continue
    h = h.map((c) =>
      c.cardId === action.cardId && c.cubesPlaced === action.cubesPlacedBefore
        ? { ...c, cubesPlaced: action.cubesPlacedBefore + 1 }
        : c
    )
  }
  return h
}

// Formatta una durata in ms come "mm:ss", o "h:mm:ss" se supera l'ora.
function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// Genera un breve "bip" via Web Audio API — nessun file audio esterno
// da caricare. Alcuni browser bloccano l'audio finché l'utente non ha
// interagito con la pagina almeno una volta: in quel caso ignoriamo
// l'errore silenziosamente, non è un problema bloccante.
function playTurnChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  } catch {
    // browser che blocca l'audio senza interazione utente: nessun problema
  }
}

export default function Game() {
  const { gameId } = useParams()
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [myUserId, setMyUserId] = useState(null)

  // Stato del turno in corso (solo locale finché non viene confermato).
  const [takenSlotIndex, setTakenSlotIndex] = useState(null)
  const [turnDiscsTaken, setTurnDiscsTaken] = useState([])
  const [remainingDiscs, setRemainingDiscs] = useState([])
  const [selectedColor, setSelectedColor] = useState(null)
  // Cronologia unica di questo turno: dischi e cubi Animale, nell'ordine
  // in cui sono stati piazzati. Vedi rebuildBoardDraft/applyHandDeltas.
  const [turnActions, setTurnActions] = useState([])

  // Carta Animale presa in questo turno (al massimo 1): tengo traccia di
  // dove è stata presa e cosa l'ha sostituita, per poterla rimettere a
  // posto se il giocatore cambia idea prima di confermare il turno.
  const [animalCardTurn, setAnimalCardTurn] = useState(null)
  const [selectedCardForCube, setSelectedCardForCube] = useState(null)

  const [error, setError] = useState(null)
  const [confirmingTurn, setConfirmingTurn] = useState(false)

  // Aggiorna ogni secondo, solo per far scorrere il timer di partita.
  // Si ferma da solo a partita finita, così il tempo resta congelato
  // al momento della fine invece di continuare a scorrere all'infinito.
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (game?.status === 'finished') return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [game?.status])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id))
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadInitial() {
      const { data: gameData } = await supabase.from('games').select().eq('id', gameId).single()
      if (!cancelled) setGame(gameData)

      const { data: playersData } = await supabase.from('players').select().eq('game_id', gameId)
      if (!cancelled) setPlayers(playersData ?? [])
    }
    loadInitial()

    // Nome canale univoco per ogni "montaggio" del componente: evita il
    // conflitto "cannot add postgres_changes callbacks after subscribe()"
    // che si presenta in React StrictMode (il componente viene montato,
    // smontato e rimontato subito dopo, in sviluppo).
    const channelName = `game:${gameId}:${Math.random().toString(36).slice(2)}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          if (!cancelled) setGame(payload.new)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
        () => {
          supabase
            .from('players')
            .select()
            .eq('game_id', gameId)
            .then(({ data }) => {
              if (!cancelled) setPlayers(data ?? [])
            })
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [gameId])

  const myPlayer = players.find((p) => p.user_id === myUserId)
  const otherPlayers = players.filter((p) => p.user_id !== myUserId)

  // Auto-riparazione: se la mia riga è rimasta con una plancia incompleta
  // (capitato con una versione precedente del codice, per via della RLS
  // che blocca l'aggiornamento della riga di un altro giocatore), la
  // sistemo qui. Aggiorno solo la MIA riga, quindi è sempre permesso.
  // NOTA: questo hook deve stare PRIMA di qualsiasi return anticipato,
  // altrimenti React lo chiamerebbe un numero variabile di volte tra
  // un render e l'altro (violazione delle Rules of Hooks).
  useEffect(() => {
    if (myPlayer && !myPlayer.board_state?.cells) {
      supabase.from('players').update({ board_state: createEmptyPlayerBoard(game?.board_mode) }).eq('id', myPlayer.id)
    }
  }, [myPlayer?.id, myPlayer?.board_state, game?.board_mode])

  // Calcolato qui (con optional chaining, sicuro anche prima che "game"
  // sia caricato) perché serve all'effetto sonoro qui sotto, che deve
  // stare prima di qualsiasi return anticipato (Rules of Hooks).
  const isMyTurn =
    game?.status === 'playing' && game?.turn_order?.[game.current_turn_index] === myPlayer?.id

  // Suono di avviso quando diventa il tuo turno (transizione false -> true).
  // Non riproduce nulla se il turno passa a un altro giocatore: ognuno
  // sente il suono solo quando tocca a lui, non a ogni turno di chiunque.
  const wasMyTurnRef = useRef(false)
  useEffect(() => {
    if (isMyTurn && !wasMyTurnRef.current) {
      playTurnChime()
    }
    wasMyTurnRef.current = isMyTurn
  }, [isMyTurn])

  // Se dopo un refresh trovo dischi presi ma non ancora confermati (pag.
  // 4: "presi" e "piazzati" sono azioni separate, il tempo in mezzo non
  // è mai stato salvato da nessuna parte prima d'ora), li recupero qui.
  // Eventuali piazzamenti fatti prima del refresh sono persi (turnActions
  // non viene salvato in tempo reale), ma i DISCHI restano disponibili
  // per essere ripiazzati — prima del fix sparivano del tutto.
  const restoredPendingTakeRef = useRef(false)
  useEffect(() => {
    if (restoredPendingTakeRef.current) return
    if (!myPlayer || !isMyTurn) return
    if (takenSlotIndex !== null || turnDiscsTaken.length > 0) return // stato locale già inizializzato

    if (myPlayer.pending_take) {
      const { slotIndex, discs } = myPlayer.pending_take
      setTakenSlotIndex(slotIndex)
      setTurnDiscsTaken(discs)
      setRemainingDiscs(discs)
      setSelectedColor(discs[0] ?? null)
    }
    restoredPendingTakeRef.current = true
  }, [myPlayer, isMyTurn, takenSlotIndex, turnDiscsTaken.length])

  if (!game || !myUserId) return <p>Caricamento partita...</p>

  // "committedHand" = quello che è davvero salvato su Supabase in questo
  // momento (si aggiorna da solo se prendi una carta, via realtime).
  // "currentHand"/"currentBoard" = committed + le azioni di questo turno
  // non ancora confermate. Il resto dell'interfaccia usa SEMPRE queste
  // ultime due, mai direttamente myPlayer.board_state/animal_cards.
  const committedHand = myPlayer?.animal_cards ?? []
  const currentBoard = myPlayer?.board_state ? rebuildBoardDraft(myPlayer.board_state, turnActions) : undefined
  const currentHand = applyHandDeltas(committedHand, turnActions)
  const myActiveCards = currentHand.filter((c) => c.cubesPlaced < getAnimalCard(c.cardId).points.length)
  const hasPlacedDiscThisTurn = turnActions.some((a) => a.type === 'disc')

  async function handleStartGame() {
    const turnOrder = players.map((p) => p.id)
    await supabase
      .from('games')
      .update({
        status: 'playing',
        turn_order: turnOrder,
        current_turn_index: 0,
        turn_count: 1,
        started_at: new Date().toISOString()
      })
      .eq('id', game.id)
  }

  // Prende dischi da una casella della plancia centrale. Se avevi già
  // preso da un'altra casella ma non hai ancora piazzato nessun disco,
  // puoi cambiare idea: i dischi tornano al loro posto e ne prendi di
  // nuovi (eventuali cubi Animale già piazzati in questo turno restano).
  async function handleTakeSlot(slotIndex) {
    setError(null)
    if (!isMyTurn) return setError('Non è il tuo turno')
    if (slotIndex === takenSlotIndex) return

    if (turnDiscsTaken.length > 0) {
      if (hasPlacedDiscThisTurn) {
        return setError('Hai già piazzato dei dischi: completa o annulla il piazzamento prima di cambiare casella')
      }
      try {
        const restored = game.central_board.map((slot, i) => (i === takenSlotIndex ? turnDiscsTaken : slot))
        const { discs, centralBoard } = takeDiscsFromCentralBoard(restored, slotIndex)
        setTakenSlotIndex(slotIndex)
        setTurnDiscsTaken(discs)
        setRemainingDiscs(discs)
        setSelectedColor(discs[0])
        setSelectedCardForCube(null)
        await supabase.from('games').update({ central_board: centralBoard }).eq('id', game.id)
        await supabase.from('players').update({ pending_take: { slotIndex, discs } }).eq('id', myPlayer.id)
      } catch (err) {
        setError(err.message)
      }
      return
    }

    try {
      const { discs, centralBoard } = takeDiscsFromCentralBoard(game.central_board, slotIndex)
      setTakenSlotIndex(slotIndex)
      setTurnDiscsTaken(discs)
      setRemainingDiscs(discs)
      setSelectedColor(discs[0])
      setSelectedCardForCube(null)
      await supabase.from('games').update({ central_board: centralBoard }).eq('id', game.id)
      await supabase.from('players').update({ pending_take: { slotIndex, discs } }).eq('id', myPlayer.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleCancelTake() {
    setError(null)
    if (!isMyTurn) return
    if (turnDiscsTaken.length === 0) return
    if (hasPlacedDiscThisTurn) return setError('Hai già piazzato dei dischi: usa "Annulla ultima azione" per la plancia')

    const restored = game.central_board.map((slot, i) => (i === takenSlotIndex ? turnDiscsTaken : slot))
    await supabase.from('games').update({ central_board: restored }).eq('id', game.id)
    await supabase.from('players').update({ pending_take: null }).eq('id', myPlayer.id)

    setTakenSlotIndex(null)
    setTurnDiscsTaken([])
    setRemainingDiscs([])
    setSelectedColor(null)
    setSelectedCardForCube(null)
  }

  function handleSelectColor(color) {
    setError(null)
    setSelectedColor(color)
    setSelectedCardForCube(null)
  }

  // Un solo gestore di click sulla plancia: decide se stai piazzando un
  // disco oppure un cubo Animale in base a cosa hai selezionato.
  function handleCellClick(q, r) {
    if (selectedCardForCube) return handlePlaceAnimalCubeAt(q, r)
    if (remainingDiscs.length > 0) return handlePlaceDisc(q, r)
  }

  function handlePlaceDisc(q, r) {
    setError(null)
    if (!isMyTurn) return
    if (!selectedColor) return setError('Seleziona prima un disco dalla tua mano')

    const check = canPlaceDisc(currentBoard, q, r, selectedColor)
    if (!check.ok) return setError(check.reason)

    const idx = remainingDiscs.indexOf(selectedColor)
    const newRemaining = [...remainingDiscs.slice(0, idx), ...remainingDiscs.slice(idx + 1)]

    setTurnActions([...turnActions, { type: 'disc', q, r, color: selectedColor }])
    setRemainingDiscs(newRemaining)
    setSelectedColor(newRemaining.length === 1 ? newRemaining[0] : null)
  }

  // Annulla l'ultima azione di questo turno, sia essa un disco o un
  // cubo Animale — un'unica cronologia, un unico "indietro" coerente.
  function handleUndoLastAction() {
    setError(null)
    if (!isMyTurn) return
    if (turnActions.length === 0) return

    const last = turnActions[turnActions.length - 1]
    setTurnActions(turnActions.slice(0, -1))
    setSelectedCardForCube(null)

    if (last.type === 'disc') {
      setRemainingDiscs([...remainingDiscs, last.color])
      setSelectedColor(last.color)
    }
  }

  // "Tutto il turno" significa davvero tutto: dischi, cubi, E la carta
  // Animale presa in questo turno (se c'è), non solo la plancia.
  async function handleUndoAllActions() {
    setError(null)
    if (!isMyTurn) return

    const remainingActions = await undoAnimalCardTake(turnActions)
    setTurnActions(remainingActions)
    setRemainingDiscs(turnDiscsTaken)
    setSelectedColor(turnDiscsTaken[0] ?? null)
    setSelectedCardForCube(null)
  }

  async function handleConfirmTurn() {
    setError(null)
    if (!isMyTurn) return
    if (confirmingTurn) return // già in corso: ignora un secondo click rapido
    if (turnDiscsTaken.length === 0) return setError('Devi prima prendere 3 dischi dalla plancia centrale')
    if (remainingDiscs.length > 0) return setError('Devi piazzare tutti i dischi prima di confermare')

    setConfirmingTurn(true)
    try {
      await supabase
        .from('players')
        .update({ board_state: currentBoard, animal_cards: currentHand, pending_take: null })
        .eq('id', myPlayer.id)

      // Azzero lo stato locale QUI, prima di endTurn (che fa altre
      // chiamate asincrone al server). La plancia appena salvata è già
      // quella corretta e completa: se aspettassi la fine di endTurn per
      // azzerare turnActions, un aggiornamento realtime della plancia
      // potrebbe arrivare nel frattempo e la interfaccia riapplicherebbe
      // le stesse mosse sopra una plancia che le ha già (bug osservato:
      // "casella non vuota" o "altezza massima" su mosse in realtà corrette).
      setTakenSlotIndex(null)
      setTurnDiscsTaken([])
      setRemainingDiscs([])
      setSelectedColor(null)
      setTurnActions([])
      setAnimalCardTurn(null)
      setSelectedCardForCube(null)

      await endTurn()
    } finally {
      setConfirmingTurn(false)
    }
  }

  async function endTurn() {
    const { data: freshGame } = await supabase.from('games').select().eq('id', game.id).single()

    // Condizione 1 (pag. 7): il sacchetto è vuoto proprio quando serve
    // rifornire la plancia centrale (anche una sola casella vuota basta).
    const needsRefill = freshGame.central_board.some((slot) => slot.length === 0)
    const bagEmptyAtRefill = needsRefill && freshGame.bag.length === 0

    const { centralBoard, bag } = refillCentralBoard(freshGame.central_board, freshGame.bag)
    const nextIndex = (freshGame.current_turn_index + 1) % freshGame.turn_order.length

    const updates = {
      central_board: centralBoard,
      bag,
      current_turn_index: nextIndex,
      turn_count: (freshGame.turn_count ?? 0) + 1
    }

    // L'ultimo giro scatta una sola volta: se è già attivo non lo si
    // "ri-attiva" con un motivo diverso.
    let finalRoundActive = freshGame.final_round
    let triggerPlayerId = freshGame.final_round_trigger_player_id

    if (!finalRoundActive) {
      // Condizione 2 (pag. 7): alla fine del TUO turno, la tua plancia
      // ha 2 caselle o meno non occupate.
      const emptyCells = Object.values(currentBoard.cells).filter((c) => c.discs.length === 0).length

      if (emptyCells <= 2 || bagEmptyAtRefill) {
        finalRoundActive = true
        triggerPlayerId = myPlayer.id
        updates.final_round = true
        updates.final_round_reason = emptyCells <= 2 ? 'plancia' : 'sacchetto'
        updates.final_round_trigger_player_id = myPlayer.id
      }
    }

    // Il giro finale è completo (tutti hanno giocato lo stesso numero di
    // turni) quando il prossimo turno tornerebbe a chi l'ha fatto
    // scattare: a quel punto la partita finisce, quel giocatore non
    // gioca un turno in più.
    if (finalRoundActive && triggerPlayerId) {
      const triggerIndex = freshGame.turn_order.indexOf(triggerPlayerId)
      if (nextIndex === triggerIndex) {
        updates.status = 'finished'
      }
    }

    await supabase.from('games').update(updates).eq('id', game.id)
  }

  // --- Carte Animale ---

  async function handleTakeAnimalCard(cardId) {
    setError(null)
    if (!isMyTurn) return setError('Non è il tuo turno')
    if (animalCardTurn) return setError('Puoi prendere solo 1 carta Animale per turno')
    if (myActiveCards.length >= 4) return setError('Hai già 4 carte Animale attive')

    const idx = game.animal_row.indexOf(cardId)
    if (idx === -1) return

    const newDeck = [...game.animal_deck]
    const replacement = newDeck.shift() ?? null
    const newRow = game.animal_row.map((id, i) => (i === idx ? replacement : id))
    const newHand = [...committedHand, { cardId, cubesPlaced: 0 }]

    await supabase.from('players').update({ animal_cards: newHand }).eq('id', myPlayer.id)
    await supabase.from('games').update({ animal_row: newRow, animal_deck: newDeck }).eq('id', game.id)
    setAnimalCardTurn({ cardId, slotIndex: idx, replacementId: replacement })
  }

  // Rimette la carta presa in questo turno al suo posto. Se nel
  // frattempo hai già piazzato uno o più cubi da questa carta, li
  // annulliamo a cascata insieme alla presa: la carta torna sulla riga
  // centrale, i cubi tornano "in mano" e le caselle si liberano di
  // nuovo — un solo gesto invece di doverlo fare a mano cubo per cubo.
  // Riusata sia dal pulsante dedicato sia da "Annulla tutto il turno".
  async function undoAnimalCardTake(actionsBeforeUndo) {
    if (!animalCardTurn) return actionsBeforeUndo

    const remainingActions = actionsBeforeUndo.filter(
      (a) => !(a.type === 'cube' && a.cardId === animalCardTurn.cardId)
    )

    const { data: freshGame } = await supabase.from('games').select().eq('id', game.id).single()
    const newRow = freshGame.animal_row.map((id, i) => (i === animalCardTurn.slotIndex ? animalCardTurn.cardId : id))
    const newDeck = animalCardTurn.replacementId
      ? [animalCardTurn.replacementId, ...freshGame.animal_deck]
      : freshGame.animal_deck
    const newHand = committedHand.filter((c) => !(c.cardId === animalCardTurn.cardId && c.cubesPlaced === 0))

    await supabase.from('games').update({ animal_row: newRow, animal_deck: newDeck }).eq('id', game.id)
    await supabase.from('players').update({ animal_cards: newHand }).eq('id', myPlayer.id)
    setAnimalCardTurn(null)
    return remainingActions
  }

  async function handleUndoAnimalCard() {
    setError(null)
    if (!isMyTurn) return
    const remainingActions = await undoAnimalCardTake(turnActions)
    setTurnActions(remainingActions)
  }

  function handleSelectCardForCube(handEntry) {
    setError(null)
    if (!isMyTurn) return
    if (selectedCardForCube === handEntry) {
      setSelectedCardForCube(null) // clic sulla stessa carta: deseleziona
      return
    }
    const cardDef = getAnimalCard(handEntry.cardId)
    if (!cardDef.habitat) {
      return setError(`Il pattern Habitat di "${cardDef.name}" non è ancora disponibile in questa versione`)
    }
    setSelectedCardForCube(handEntry)
  }

  // Il cubo può usare qualunque habitat formato sulla plancia FINO A
  // QUESTO MOMENTO del turno, inclusi i dischi appena piazzati (pag. 6
  // del manuale: le azioni facoltative si intercalano liberamente col
  // piazzamento dei dischi). Per questo il controllo usa currentBoard,
  // non la plancia già confermata.
  async function handlePlaceAnimalCubeAt(q, r) {
    setError(null)
    if (!isMyTurn) return
    const cardDef = getAnimalCard(selectedCardForCube.cardId)
    const matches = findHabitatMatches(currentBoard, cardDef)
    const match = matches.find((m) => m.cubeQ === q && m.cubeR === r)
    if (!match) return setError("Qui non si forma l'habitat richiesto da questa carta")

    setTurnActions([
      ...turnActions,
      { type: 'cube', q, r, cardId: cardDef.id, cubesPlacedBefore: selectedCardForCube.cubesPlaced }
    ])
    setSelectedCardForCube(null)
  }

  const cubeTargetCells = selectedCardForCube
    ? findHabitatMatches(currentBoard, getAnimalCard(selectedCardForCube.cardId)).map((m) => ({
        q: m.cubeQ,
        r: m.cubeR
      }))
    : []

  const cardBoxStyle = (selected) => ({
    border: selected ? '2px solid #d97706' : '1px solid #ccc',
    borderRadius: 6,
    padding: 6,
    minWidth: 92,
    flexShrink: 0
  })

  const panelStyle = { border: '1px solid #333', borderRadius: 8, padding: '10px 14px', boxSizing: 'border-box' }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: '10px 20px',
        boxSizing: 'border-box',
        fontFamily: 'sans-serif',
        overflow: 'hidden',
        gap: 12
      }}
    >
      {/* Pannello superiore, diviso in due colonne orizzontali */}
      <div style={{ ...panelStyle, flexShrink: 0, display: 'flex', gap: 16 }}>
        {/* Colonna sinistra: header, giocatori, plancia centrale, carte disponibili */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Stanza {game.room_code}</h1>
            <span style={{ color: '#666', fontSize: '0.85rem' }}>
              Modalità: {game.board_mode === 'isole' ? 'Isole' : 'Standard (Fiume)'}
            </span>
            {(game.status === 'playing' || game.status === 'finished') && (
              <span style={{ color: '#666', fontSize: '0.85rem' }}>
                {game.started_at ? `Tempo: ${formatDuration(now - new Date(game.started_at).getTime())} · ` : ''}
                Turno: {game.turn_count || '—'}
              </span>
            )}
          </div>

          {game.status === 'playing' && game.final_round && (
            <p
              style={{
                margin: '6px 0 0',
                padding: '4px 10px',
                background: '#fef3c7',
                border: '1px solid #d97706',
                borderRadius: 6,
                fontSize: '0.85rem',
                fontWeight: 'bold',
                display: 'inline-block'
              }}
            >
              ⚠️ Ultimo giro! (
              {game.final_round_reason === 'sacchetto'
                ? 'il sacchetto dei dischi è vuoto'
                : 'una plancia ha 2 o meno caselle libere'}
              ) — la partita finisce quando tutti avranno giocato lo stesso numero di turni.
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '6px 0' }}>
            {players.map((p) => {
              const isCurrent = game.status === 'playing' && game.turn_order?.[game.current_turn_index] === p.id
              return (
                <div
                  key={p.id}
                  style={{
                    padding: isCurrent ? '6px 16px' : '3px 10px',
                    borderRadius: 999,
                    background: isCurrent ? '#fef3c7' : '#f1efe8',
                    border: isCurrent ? '2px solid #d97706' : '1px solid #ccc',
                    fontWeight: isCurrent ? 'bold' : 'normal',
                    fontSize: isCurrent ? '1.1rem' : '0.85rem'
                  }}
                >
                  {p.nickname}
                </div>
              )
            })}
          </div>

          {game.status === 'waiting' && (
            <button onClick={handleStartGame}>Avvia partita ({players.length} giocatori)</button>
          )}

          {game.status === 'finished' && <FinalScoreboard players={players} boardMode={game.board_mode} />}

          {game.status === 'playing' && (
            <>
              <div style={{ fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>Plancia centrale:</strong>
                  {game.central_board.map((slot, i) => (
                    <div
                      key={i}
                      onClick={() => handleTakeSlot(i)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: 4,
                        border: i === takenSlotIndex ? '2px solid #333' : '1px solid #ccc',
                        borderRadius: 6,
                        cursor: isMyTurn ? 'pointer' : 'default',
                        opacity: slot.length === 0 ? 0.3 : 1
                      }}
                    >
                      <CentralDiscPile discs={slot} />
                    </div>
                  ))}

                  {isMyTurn && turnActions.length > 0 && (
                    <>
                      <button onClick={handleUndoLastAction}>Annulla ultima azione</button>
                      <button onClick={handleUndoAllActions}>Annulla tutto il turno</button>
                    </>
                  )}
                </div>

                {isMyTurn && turnDiscsTaken.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                    <span>In mano:</span>
                    {remainingDiscs.map((c, i) => (
                      <span
                        key={i}
                        onClick={() => handleSelectColor(c)}
                        style={{
                          display: 'inline-block',
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          background: DISC_HEX[c],
                          cursor: 'pointer',
                          outline: selectedColor === c ? '3px solid #333' : 'none',
                          outlineOffset: 2
                        }}
                      />
                    ))}
                    {remainingDiscs.length === 0 && <span style={{ color: '#888' }}>tutti piazzati</span>}
                    <button onClick={handleCancelTake} disabled={hasPlacedDiscThisTurn}>
                      Rinuncia alla presa
                    </button>
                    <button onClick={handleConfirmTurn} disabled={remainingDiscs.length > 0 || confirmingTurn}>
                      {confirmingTurn ? 'Confermo...' : 'Conferma turno'}
                    </button>
                  </div>
                )}
              </div>

              <div style={{ margin: '6px 0 0' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.85rem', flexShrink: 0 }}>Carte Animale:</strong>
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                    {game.animal_row.map((cardId) => {
                      if (!cardId) return null
                      const card = getAnimalCard(cardId)
                      return (
                        <div
                          key={cardId}
                          onClick={() => handleTakeAnimalCard(cardId)}
                          style={{ ...cardBoxStyle(false), cursor: isMyTurn ? 'pointer' : 'default' }}
                        >
                          <div style={{ fontWeight: 'bold', fontSize: 12 }}>{card.name}</div>
                          <div style={{ fontSize: 11, color: '#666' }}>{card.points.join('/')}</div>
                          <HabitatIcon habitat={card.habitat} />
                        </div>
                      )
                    })}
                  </div>
                  {animalCardTurn && (
                    <button onClick={handleUndoAnimalCard} style={{ flexShrink: 0, fontSize: '0.8rem' }}>
                      {turnActions.some((a) => a.type === 'cube' && a.cardId === animalCardTurn.cardId)
                        ? 'Annulla presa carta (+ cubi)'
                        : 'Annulla presa carta'}
                    </button>
                  )}
                </div>
              </div>

              {error && <p style={{ color: 'red', margin: '4px 0 0', fontSize: '0.85rem' }}>{error}</p>}
              {selectedCardForCube && (
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#d97706' }}>
                  Cubo Animale selezionato ({getAnimalCard(selectedCardForCube.cardId).name}): clicca una casella
                  gialla sulla plancia, oppure clicca di nuovo la carta per annullare.
                </p>
              )}
            </>
          )}
        </div>

        {/* Colonna destra: riassunto punteggi, allineato in alto */}
        {(game.status === 'playing' || game.status === 'finished') && (
          <div style={{ flexShrink: 0, width: 300 }}>
            <ScoringReference boardMode={game.board_mode} />
          </div>
        )}
      </div>

      {(game.status === 'playing' || game.status === 'finished') && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16 }}>
          {/* Pannello sinistro: il giocatore loggato */}
          <div style={{ ...panelStyle, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h2 style={{ fontSize: '1.3rem', margin: 0 }}>{myPlayer?.nickname}</h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#666' }}>La tua plancia</p>
            <p style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 'bold' }}>
              Le tue carte ({myActiveCards.length}/4 attive)
            </p>

            <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>
              {/* Griglia carte, a sinistra: scorre in verticale se non entrano */}
              <div
                style={{
                  width: '30%',
                  minWidth: 140,
                  flexShrink: 0,
                  height: '100%',
                  overflowY: 'auto',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                  gridAutoRows: 'min-content',
                  gap: 6,
                  alignContent: 'start'
                }}
              >
                {currentHand.map((entry, i) => {
                  const card = getAnimalCard(entry.cardId)
                  const completed = entry.cubesPlaced >= card.points.length
                  const currentPoints = entry.cubesPlaced === 0 ? 0 : card.points[entry.cubesPlaced - 1]
                  return (
                    <div
                      key={i}
                      onClick={() => !completed && handleSelectCardForCube(entry)}
                      style={{
                        ...cardBoxStyle(selectedCardForCube === entry),
                        minWidth: 0,
                        opacity: completed ? 0.6 : 1,
                        cursor: completed ? 'default' : 'pointer'
                      }}
                    >
                      <div style={{ fontWeight: 'bold', fontSize: 12 }}>{card.name}</div>
                      <div style={{ fontSize: 11, color: '#666' }}>{card.points.join('/')}</div>
                      <div style={{ fontSize: 10, color: '#999' }}>
                        {entry.cubesPlaced}/{card.points.length} — {currentPoints} pt
                      </div>
                      <HabitatIcon habitat={card.habitat} />
                    </div>
                  )
                })}
                {currentHand.length === 0 && (
                  <span style={{ color: '#888', fontSize: '0.85rem', gridColumn: '1 / -1' }}>nessuna carta presa</span>
                )}
              </div>

              {/* Plancia, a destra della griglia carte */}
              <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'flex-start' }}>
                <HexBoard
                  boardState={currentBoard}
                  onCellClick={isMyTurn ? handleCellClick : undefined}
                  highlightable={isMyTurn && (remainingDiscs.length > 0 || !!selectedCardForCube)}
                  highlightCells={cubeTargetCells}
                  maxHeightVh={62}
                />
              </div>
            </div>
          </div>

          {/* Pannello destro: gli avversari, plancia a sinistra e nome+carte a destra per ognuno */}
          {otherPlayers.length > 0 && (
            <div style={{ ...panelStyle, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <h2 style={{ fontSize: '1.3rem', margin: '0 0 6px' }}>Plance degli altri giocatori</h2>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {otherPlayers.map((p) => (
                  <div key={p.id} style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flexShrink: 0, width: 260 }}>
                      <HexBoard boardState={p.board_state} compact maxHeightVh={26} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <p style={{ margin: '0 0 4px', fontWeight: 'bold', fontSize: '0.95rem' }}>{p.nickname}</p>
                      <div
                        style={{
                          maxHeight: '22vh',
                          overflowY: 'auto',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                          gridAutoRows: 'min-content',
                          gap: 4,
                          alignContent: 'start'
                        }}
                      >
                        {(p.animal_cards ?? []).map((entry, i) => {
                          const card = getAnimalCard(entry.cardId)
                          const currentPoints = entry.cubesPlaced === 0 ? 0 : card.points[entry.cubesPlaced - 1]
                          return (
                            <div key={i} style={{ ...cardBoxStyle(false), minWidth: 0 }}>
                              <div style={{ fontWeight: 'bold', fontSize: 12 }}>{card.name}</div>
                              <div style={{ fontSize: 11, color: '#666' }}>{card.points.join('/')}</div>
                              <div style={{ fontSize: 10, color: '#999' }}>
                                {entry.cubesPlaced}/{card.points.length} — {currentPoints} pt
                              </div>
                              <HabitatIcon habitat={card.habitat} />
                            </div>
                          )
                        })}
                        {(p.animal_cards ?? []).length === 0 && (
                          <span style={{ color: '#888', fontSize: 11 }}>nessuna carta presa</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
