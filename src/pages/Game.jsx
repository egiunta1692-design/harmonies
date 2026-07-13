import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import HexBoard from '../components/HexBoard'
import HabitatIcon from '../components/HabitatIcon'
import ScoringReference from '../components/ScoringReference'
import FinalScoreboard from '../components/FinalScoreboard'
import CentralDiscPile from '../components/CentralDiscPile'
import { SingleDiscIcon } from '../components/DiscVisual'
import {
  createEmptyPlayerBoard,
  takeDiscsFromCentralBoard,
  refillCentralBoard,
  refillAnimalRow,
  canPlaceDisc,
  placeDisc,
  getAnimalCard,
  ANIMAL_CARDS,
  getNatureSpiritCard,
  NATURE_SPIRIT_CARDS,
  dealNatureSpiritChoices,
  scoreNatureSpiritCard,
  shuffle,
  findHabitatMatches,
  placeAnimalCube
} from '../game-engine'

// Trova la definizione di una carta indipendentemente dal tipo
// (Animale o Spirito della Natura) — il motore di piazzamento cubi
// non distingue le due, quindi l'interfaccia non deve farlo a mano
// in ogni punto in cui serve leggere nome/punti/habitat di una carta.
function getCardDef(cardId) {
  return getAnimalCard(cardId) ?? getNatureSpiritCard(cardId)
}

// Le carte Animale hanno da 2 a 5 cubi; le carte Spirito della Natura
// ne hanno sempre e solo 1 (vedi natureSpiritCards.js — non hanno un
// array "points" perché il punteggio si calcola a fine partita, non
// per cubo piazzato). Difensivo: se cardDef non si risolve (dato
// corrotto/cardId sconosciuto), ritorna 1 invece di far crashare la
// pagina — non deve mai più succedere quello che è successo.
function cardCubeCount(cardDef) {
  return cardDef?.points ? cardDef.points.length : 1
}

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
  const [zoomedCard, setZoomedCard] = useState(null) // { card, entry? } per il popup di ingrandimento
  const [showAllCards, setShowAllCards] = useState(false) // debug: verifica visiva di tutte le carte
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
  // turn_order è fissato una sola volta all'avvio partita e non cambia
  // mai: lo uso per un ordinamento stabile, dato che Supabase non
  // garantisce lo stesso ordine di riga tra un refetch e l'altro (e ne
  // facciamo uno a ogni cambio turno).
  const otherPlayers = players
    .filter((p) => p.user_id !== myUserId)
    .sort((a, b) => (game?.turn_order ?? []).indexOf(a.id) - (game?.turn_order ?? []).indexOf(b.id))

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

      // Rete di sicurezza: rileggo direttamente la mia riga dal server
      // invece di fidarmi solo dell'ultimo aggiornamento realtime
      // arrivato — capitava che, con più giocatori, la scrittura delle
      // carte Spirito della Natura di un giocatore "successivo" non
      // arrivasse in tempo al suo stesso client, facendogli saltare il
      // popup di scelta al primo turno.
      if (myPlayer?.id) {
        supabase
          .from('players')
          .select()
          .eq('id', myPlayer.id)
          .single()
          .then(({ data }) => {
            if (data) setPlayers((prev) => prev.map((p) => (p.id === data.id ? data : p)))
          })
      }
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

  // Stesso discorso per la carta Animale presa ma non ancora confermata:
  // senza questo, un refresh permetteva di prenderne una seconda nello
  // stesso turno (il controllo "solo 1 per turno" viveva solo nello
  // stato locale, andato perso col refresh).
  const restoredPendingCardRef = useRef(false)
  useEffect(() => {
    if (restoredPendingCardRef.current) return
    if (!myPlayer || !isMyTurn) return
    if (animalCardTurn) return // stato locale già inizializzato

    if (myPlayer.pending_animal_card) {
      setAnimalCardTurn(myPlayer.pending_animal_card)
    }
    restoredPendingCardRef.current = true
  }, [myPlayer, isMyTurn, animalCardTurn])

  if (!game || !myUserId) return <p>Caricamento partita...</p>

  // "committedHand" = quello che è davvero salvato su Supabase in questo
  // momento (si aggiorna da solo se prendi una carta, via realtime).
  // "currentHand"/"currentBoard" = committed + le azioni di questo turno
  // non ancora confermate. Il resto dell'interfaccia usa SEMPRE queste
  // ultime due, mai direttamente myPlayer.board_state/animal_cards.
  // "committedHand" combina le carte Animale con l'eventuale carta
  // Spirito della Natura scelta (vivono in due colonne separate sul
  // database, ma per il resto della logica di turno — conteggio 4
  // attive, piazzamento cubo, annullamenti — si comportano allo stesso
  // modo, quindi le tratto come un'unica "mano" qui in avanti).
  const committedHand = [
    ...(myPlayer?.animal_cards ?? []),
    ...(myPlayer?.nature_spirit_card ? [myPlayer.nature_spirit_card] : [])
  ]
  const currentBoard = myPlayer?.board_state ? rebuildBoardDraft(myPlayer.board_state, turnActions) : undefined
  const currentHand = applyHandDeltas(committedHand, turnActions).filter((c) => getCardDef(c.cardId))
  const myActiveCards = currentHand.filter((c) => c.cubesPlaced < cardCubeCount(getCardDef(c.cardId)))
  const hasPlacedDiscThisTurn = turnActions.some((a) => a.type === 'disc')

  // Conta le carte Animale attive di un qualsiasi giocatore: per me
  // stesso uso currentHand (include le mosse di questo turno non ancora
  // confermate), per gli avversari i dati committati che ho via realtime.
  // Cubi Animale usciti dalla riserva (66 in totale, pag. 2 del manuale):
  // per regolamento (pag. 5) si prendono TUTTI i cubi di una carta appena
  // la si prende, non uno alla volta man mano che li si piazza sul
  // paesaggio — quindi conta card.points.length per ogni carta in mano
  // a chiunque, indipendentemente da cubesPlaced.
  const cubesUsed = players.reduce(
    (sum, p) => sum + (p.animal_cards ?? []).reduce((s, c) => s + (getAnimalCard(c.cardId)?.points.length ?? 0), 0),
    0
  )

  const bagCounts = (game?.bag ?? []).reduce((acc, color) => {
    acc[color] = (acc[color] || 0) + 1
    return acc
  }, {})

  // Trasmette agli avversari un'anteprima live delle mosse di questo
  // turno non ancora confermate (dischi piazzati + cubi Animale).
  // Richiamata esplicitamente da ogni gestore che modifica turnActions,
  // con il valore delle azioni appena calcolato (mai lo stato React,
  // che si aggiorna in modo asincrono ed è disponibile solo al
  // prossimo render).
  async function syncLivePreview(actions) {
    if (!myPlayer?.board_state) return
    const preview =
      actions.length === 0
        ? null
        : {
            board_state: rebuildBoardDraft(myPlayer.board_state, actions),
            animal_cards: applyHandDeltas(myPlayer.animal_cards ?? [], actions)
          }
    const { error: syncError } = await supabase.from('players').update({ live_preview: preview }).eq('id', myPlayer.id)
    if (syncError) console.error("Errore nel sincronizzare l'anteprima live:", syncError)
  }

  function activeCardCount(p) {
    const hand =
      p.id === myPlayer?.id
        ? currentHand
        : [...(p.live_preview?.animal_cards ?? p.animal_cards ?? []), ...(p.nature_spirit_card ? [p.nature_spirit_card] : [])].filter(
            (c) => getCardDef(c.cardId)
          )
    return hand.filter((c) => c.cubesPlaced < cardCubeCount(getCardDef(c.cardId))).length
  }

  async function handleStartGame() {
    const turnOrder = shuffle(players.map((p) => p.id))

    // Preparazione espansione (pag. 1 manuale espansione): 2 carte
    // Spirito della Natura coperte a ogni giocatore, scritte PRIMA di
    // aprire la partita — altrimenti c'è una finestra in cui il primo
    // giocatore si vede già "in turno" (status passato a "playing")
    // ma senza ancora le carte, e il popup di scelta non compare.
    if (game.nature_spirit_extension) {
      const choices = dealNatureSpiritChoices(turnOrder)
      const results = await Promise.all(
        players.map((p) => supabase.from('players').update({ nature_spirit_choices: choices[p.id] }).eq('id', p.id))
      )
      const failed = results.find((r) => r.error)
      if (failed) {
        setError('Errore nella distribuzione delle carte Spirito della Natura: ' + failed.error.message)
        return
      }
    }

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
        await supabase.from('players').update({ pending_take: { slotIndex, discs, remaining: discs } }).eq('id', myPlayer.id)
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
      await supabase.from('players').update({ pending_take: { slotIndex, discs, remaining: discs } }).eq('id', myPlayer.id)
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

  async function handlePlaceDisc(q, r) {
    setError(null)
    if (!isMyTurn) return
    if (!selectedColor) return setError('Seleziona prima un disco dalla tua mano')

    const check = canPlaceDisc(currentBoard, q, r, selectedColor)
    if (!check.ok) return setError(check.reason)

    const idx = remainingDiscs.indexOf(selectedColor)
    const newRemaining = [...remainingDiscs.slice(0, idx), ...remainingDiscs.slice(idx + 1)]

    const newActions = [...turnActions, { type: 'disc', q, r, color: selectedColor }]
    setTurnActions(newActions)
    setRemainingDiscs(newRemaining)
    setSelectedColor(newRemaining[0] ?? null)

    // "remaining" (a differenza di "discs", che resta l'elenco originale
    // per il recupero dopo un refresh) si aggiorna a ogni piazzamento:
    // è quello che mostriamo agli avversari accanto al loro contatore
    // carte, per vedere live quanti dischi hanno ancora da piazzare.
    await supabase
      .from('players')
      .update({ pending_take: { slotIndex: takenSlotIndex, discs: turnDiscsTaken, remaining: newRemaining } })
      .eq('id', myPlayer.id)
    await syncLivePreview(newActions)
  }

  // Annulla l'ultima azione di questo turno, sia essa un disco o un
  // cubo Animale — un'unica cronologia, un unico "indietro" coerente.
  async function handleUndoLastAction() {
    setError(null)
    if (!isMyTurn) return
    if (turnActions.length === 0) return

    const last = turnActions[turnActions.length - 1]
    let newActions = turnActions.slice(0, -1)
    setSelectedCardForCube(null)

    if (last.type === 'disc') {
      const newRemaining = [...remainingDiscs, last.color]
      setRemainingDiscs(newRemaining)
      setSelectedColor(last.color)
      if (turnDiscsTaken.length > 0) {
        await supabase
          .from('players')
          .update({ pending_take: { slotIndex: takenSlotIndex, discs: turnDiscsTaken, remaining: newRemaining } })
          .eq('id', myPlayer.id)
      }
    }

    // Se questa carta (completata prima) torna "attiva" annullando il
    // cubo, e questo supera il limite di 4 carte attive — perché nel
    // frattempo, approfittando dello slot liberato, avevi preso una
    // nuova carta — quella nuova presa va annullata a cascata insieme
    // ai suoi eventuali cubi, altrimenti resteresti con 5 carte attive.
    if (animalCardTurn) {
      const hand = applyHandDeltas(committedHand, newActions)
      const activeCount = hand.filter((c) => c.cubesPlaced < cardCubeCount(getCardDef(c.cardId))).length
      if (activeCount > 4) {
        newActions = await undoAnimalCardTake(newActions)
      }
    }

    setTurnActions(newActions)
    await syncLivePreview(newActions)
  }

  // "Tutto il turno" significa davvero tutto: dischi, cubi, E la carta
  // Animale presa in questo turno (se c'è), non solo la plancia.
  async function handleUndoAllActions() {
    setError(null)
    if (!isMyTurn) return

    // "Tutto" significa davvero tutto: dischi E cubi, sempre azzerati.
    // Se c'era anche una carta Animale presa in questo turno, la
    // ripristiniamo a parte (scrive sul server), ma il risultato non
    // deve mai condizionare l'azzeramento di turnActions qui sotto —
    // prima capitava che, senza una carta di mezzo, turnActions restasse
    // invariato (i dischi restavano piazzati sulla plancia) mentre i
    // dischi tornavano comunque "in mano": la causa della duplicazione.
    if (animalCardTurn) {
      await undoAnimalCardTake(turnActions)
    }

    setTurnActions([])
    setRemainingDiscs(turnDiscsTaken)
    setSelectedColor(turnDiscsTaken[0] ?? null)
    setSelectedCardForCube(null)

    if (turnDiscsTaken.length > 0) {
      await supabase
        .from('players')
        .update({ pending_take: { slotIndex: takenSlotIndex, discs: turnDiscsTaken, remaining: turnDiscsTaken } })
        .eq('id', myPlayer.id)
    }

    await syncLivePreview([])
  }

  async function handleConfirmTurn() {
    setError(null)
    if (!isMyTurn) return
    if (confirmingTurn) return // già in corso: ignora un secondo click rapido
    if (turnDiscsTaken.length === 0) return setError('Devi prima prendere 3 dischi dalla plancia centrale')
    if (remainingDiscs.length > 0) return setError('Devi piazzare tutti i dischi prima di confermare')

    setConfirmingTurn(true)
    try {
      const finalAnimalCards = currentHand.filter((c) => getAnimalCard(c.cardId))
      const finalNatureSpirit = currentHand.find((c) => getNatureSpiritCard(c.cardId)) ?? null

      await supabase
        .from('players')
        .update({
          board_state: currentBoard,
          animal_cards: finalAnimalCards,
          nature_spirit_card: finalNatureSpirit,
          pending_take: null,
          pending_animal_card: null,
          live_preview: null
        })
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
    const { animalRow, animalDeck } = refillAnimalRow(freshGame.animal_row, freshGame.animal_deck)
    const nextIndex = (freshGame.current_turn_index + 1) % freshGame.turn_order.length

    const updates = {
      central_board: centralBoard,
      bag,
      animal_row: animalRow,
      animal_deck: animalDeck,
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

  // Scelta della carta Spirito della Natura (espansione, pag. 1): al
  // primo turno, tra le 2 carte coperte, se ne tiene 1 e l'altra torna
  // nella scatola per sempre. È definitiva — non esiste un pulsante
  // "annulla" per questa scelta, a differenza delle carte Animale.
  async function handleChooseNatureSpirit(cardId) {
    if (!isMyTurn || !myPlayer?.nature_spirit_choices) return
    await supabase
      .from('players')
      .update({
        nature_spirit_card: { cardId, cubesPlaced: 0 },
        nature_spirit_choices: null
      })
      .eq('id', myPlayer.id)
  }

  async function handleTakeAnimalCard(cardId) {
    setError(null)
    if (!isMyTurn) return setError('Non è il tuo turno')
    if (animalCardTurn) return setError('Puoi prendere solo 1 carta Animale per turno')
    if (myActiveCards.length >= 4) return setError('Hai già 4 carte Animale attive')

    const cardDef = getAnimalCard(cardId)
    if (66 - cubesUsed < cardDef.points.length) {
      return setError('Non ci sono abbastanza cubi Animale rimasti in riserva per questa carta')
    }

    const idx = game.animal_row.indexOf(cardId)
    if (idx === -1) return

    const newRow = game.animal_row.map((id, i) => (i === idx ? null : id))
    const newHand = [...(myPlayer.animal_cards ?? []), { cardId, cubesPlaced: 0 }]

    await supabase.from('players').update({ animal_cards: newHand, pending_animal_card: { cardId, slotIndex: idx } }).eq('id', myPlayer.id)
    await supabase.from('games').update({ animal_row: newRow }).eq('id', game.id)
    setAnimalCardTurn({ cardId, slotIndex: idx })
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
    const newHand = (myPlayer.animal_cards ?? []).filter((c) => !(c.cardId === animalCardTurn.cardId && c.cubesPlaced === 0))

    await supabase.from('games').update({ animal_row: newRow }).eq('id', game.id)
    await supabase.from('players').update({ animal_cards: newHand, pending_animal_card: null }).eq('id', myPlayer.id)
    setAnimalCardTurn(null)
    return remainingActions
  }

  async function handleUndoAnimalCard() {
    setError(null)
    if (!isMyTurn) return
    const remainingActions = await undoAnimalCardTake(turnActions)
    setTurnActions(remainingActions)
    await syncLivePreview(remainingActions)
  }

  function handleSelectCardForCube(handEntry) {
    setError(null)
    if (!isMyTurn) return
    if (selectedCardForCube === handEntry) {
      setSelectedCardForCube(null) // clic sulla stessa carta: deseleziona
      return
    }
    const cardDef = getCardDef(handEntry.cardId)
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
    const cardDef = getCardDef(selectedCardForCube.cardId)
    const matches = findHabitatMatches(currentBoard, cardDef)
    const match = matches.find((m) => m.cubeQ === q && m.cubeR === r)
    if (!match) return setError("Qui non si forma l'habitat richiesto da questa carta")

    const newActions = [
      ...turnActions,
      { type: 'cube', q, r, cardId: cardDef.id, cubesPlacedBefore: selectedCardForCube.cubesPlaced }
    ]
    setTurnActions(newActions)
    setSelectedCardForCube(null)
    await syncLivePreview(newActions)
  }

  const cubeTargetCells = selectedCardForCube
    ? findHabitatMatches(currentBoard, getCardDef(selectedCardForCube.cardId)).map((m) => ({
        q: m.cubeQ,
        r: m.cubeR
      }))
    : []

  const cardBoxStyle = (selected) => ({
    border: selected ? '2px solid #d97706' : '1px solid #ccc',
    borderRadius: 6,
    padding: 6,
    minWidth: 92,
    flexShrink: 0,
    background: '#fff',
    position: 'relative'
  })

  // Lente di ingrandimento su ogni carta: stopPropagation evita di
  // innescare il click della carta sottostante (presa carta / selezione
  // per il cubo). "entry" è opzionale, solo per le carte in mano
  // (mostra i cubi già piazzati nel popup).
  function CardZoomButton({ card, entry }) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          setZoomedCard({ card, entry })
        }}
        title="Ingrandisci"
        style={{
          position: 'absolute',
          top: 2,
          right: 2,
          width: 20,
          height: 20,
          padding: 0,
          border: '1px solid #ccc',
          background: 'rgba(255,255,255,0.9)',
          borderRadius: '50%',
          fontSize: 11,
          lineHeight: '18px',
          cursor: 'pointer'
        }}
      >
        🔍
      </button>
    )
  }

  const turnBadgeStyle = (isCurrent) => ({
    display: 'inline-block',
    padding: isCurrent ? '4px 12px' : '1px 6px',
    borderRadius: 999,
    background: isCurrent ? '#fef3c7' : 'transparent',
    border: isCurrent ? '2px solid #d97706' : '1px solid transparent',
    fontWeight: isCurrent ? 'bold' : 'normal'
  })

  const panelStyle = {
    border: '1px solid #4a3f2f',
    borderRadius: 8,
    padding: '10px 14px',
    boxSizing: 'border-box',
    background: '#fdfbf3'
  }

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
              {game.nature_spirit_extension ? ' · 🌿 (estensione)' : ''}
            </span>
            {(game.status === 'playing' || game.status === 'finished') && (
              <span style={{ color: '#666', fontSize: '0.85rem' }}>
                {game.started_at ? `Tempo: ${formatDuration(now - new Date(game.started_at).getTime())} · ` : ''}
                Turno: {game.turn_count || '—'}
              </span>
            )}
            {game.status === 'playing' && (
              <span style={{ color: '#666', fontSize: '0.8rem' }}>
                👝{game.bag.length} (🔴{bagCounts.red || 0} · 🟡{bagCounts.yellow || 0} · 🟢{bagCounts.green || 0} · 🟤
                {bagCounts.brown || 0} · 🔘{bagCounts.grey || 0} · 🔵{bagCounts.blue || 0}) ·{' '}
                <span onClick={() => setShowAllCards(true)} style={{ cursor: 'pointer', textDecoration: 'underline dotted' }} title="Vedi tutte le carte Animale">
                  🎴{game.animal_deck.length}
                </span>{' '}
                · 🟨{66 - cubesUsed}
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

          {game.status === 'waiting' && (
            <div>
              <p style={{ margin: '0 0 6px', fontWeight: 'bold' }}>Giocatori in stanza:</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {players.map((p) => (
                  <span
                    key={p.id}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 999,
                      background: '#f1efe8',
                      border: '1px solid #ccc',
                      fontSize: '0.9rem'
                    }}
                  >
                    {p.nickname}
                  </span>
                ))}
              </div>
              <button onClick={handleStartGame}>▶️ Avvia partita ({players.length} giocatori)</button>
            </div>
          )}

          {game.status === 'finished' && <FinalScoreboard players={players} boardMode={game.board_mode} />}

          {game.status === 'playing' && (
            <>
              <div style={{ fontSize: '0.85rem', display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
                {/* Plancia centrale */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
                        opacity: slot.length === 0 ? 0.3 : 1,
                        background: '#fff'
                      }}
                    >
                      <CentralDiscPile discs={slot} />
                    </div>
                  ))}
                </div>

                {/* Carte Animale a terra */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                    {game.animal_row.map((cardId, i) => {
                      if (!cardId) return <div key={i} style={{ ...cardBoxStyle(false), opacity: 0.3 }} />
                      const card = getAnimalCard(cardId)
                      return (
                        <div
                          key={cardId}
                          onClick={() => handleTakeAnimalCard(cardId)}
                          style={{ ...cardBoxStyle(false), cursor: isMyTurn ? 'pointer' : 'default' }}
                        >
                          <CardZoomButton card={card} />
                          <div style={{ fontWeight: 'bold', fontSize: 12 }}>{card.name}</div>
                          <div style={{ fontSize: 11, color: '#666' }}>{card.points.join('/')}</div>
                          <HabitatIcon habitat={card.habitat} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Azioni del turno: tutte insieme in un'unica riga sotto, che
                  compare/scompare senza mai spostare la riga di dischi/carte sopra. */}
              {isMyTurn && (turnDiscsTaken.length > 0 || turnActions.length > 0 || animalCardTurn) && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6, fontSize: '0.85rem' }}>
                  {turnDiscsTaken.length > 0 && (
                    <>
                      <span>In mano:</span>
                      {[...remainingDiscs].reverse().map((c, i) => (
                        <span
                          key={i}
                          onClick={() => handleSelectColor(c)}
                          style={{
                            display: 'inline-flex',
                            cursor: 'pointer',
                            borderRadius: 6,
                            outline: selectedColor === c ? '3px solid #333' : 'none',
                            outlineOffset: 1
                          }}
                        >
                          <SingleDiscIcon color={c} size={26} />
                        </span>
                      ))}
                      {remainingDiscs.length === 0 && <span style={{ color: '#888' }}>tutti piazzati</span>}
                    </>
                  )}

                  {turnActions.length > 0 && (
                    <>
                      <button onClick={handleUndoLastAction}>↩️ Annulla ultima azione</button>
                      <button onClick={handleUndoAllActions}>⏮️ Annulla tutto il turno</button>
                    </>
                  )}

                  {animalCardTurn && (
                    <button onClick={handleUndoAnimalCard}>
                      {turnActions.some((a) => a.type === 'cube' && a.cardId === animalCardTurn.cardId)
                        ? '🗑️ Annulla presa carta (+ cubi)'
                        : '🗑️ Annulla presa carta'}
                    </button>
                  )}

                  {turnDiscsTaken.length > 0 && (
                    <>
                      <button onClick={handleCancelTake} disabled={hasPlacedDiscThisTurn}>
                        🙅 Rinuncia alla presa
                      </button>
                      <button onClick={handleConfirmTurn} disabled={remainingDiscs.length > 0 || confirmingTurn}>
                        {confirmingTurn ? 'Confermo...' : '✅ Conferma turno'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {error && <p style={{ color: 'red', margin: '4px 0 0', fontSize: '0.85rem' }}>{error}</p>}
              {selectedCardForCube && (
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#d97706' }}>
                  Cubo Animale selezionato ({getCardDef(selectedCardForCube.cardId).name}): clicca una casella
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
          <div
            style={{
              ...panelStyle,
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              background: game.board_mode === 'isole' ? '#cfe8f5' : panelStyle.background
            }}
          >
            <h2 style={{ fontSize: '1.3rem', margin: '0 0 8px' }}>
              <span style={turnBadgeStyle(isMyTurn)}>{myPlayer?.nickname}</span>{' '}
              <span style={{ fontSize: '0.7em', fontWeight: 'normal', color: '#666' }}>🎴{myActiveCards.length}/4</span>
            </h2>

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
                  const card = getCardDef(entry.cardId)
                  const totalCubes = cardCubeCount(card)
                  const completed = entry.cubesPlaced >= totalCubes
                  const isNatureSpirit = !card.points
                  const currentPoints = !isNatureSpirit && entry.cubesPlaced > 0 ? card.points[entry.cubesPlaced - 1] : null
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
                      <CardZoomButton card={card} entry={entry} />
                      <div style={{ fontWeight: 'bold', fontSize: 12 }}>
                        {card.name}
                        {isNatureSpirit ? ' 🌿' : ''}
                      </div>
                      <div style={{ fontSize: 11, color: '#666' }}>
                        {isNatureSpirit ? 'punteggio a fine partita' : card.points.join('/')}
                      </div>
                      <div style={{ fontSize: 10, color: '#999' }}>
                        {entry.cubesPlaced}/{totalCubes}
                        {currentPoints !== null ? ` — ${currentPoints} pt` : ''}
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
            <div
              style={{
                ...panelStyle,
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                background: game.board_mode === 'isole' ? '#cfe8f5' : panelStyle.background
              }}
            >
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {otherPlayers.map((p) => (
                  <div key={p.id} style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flexShrink: 0, width: 260 }}>
                      <HexBoard boardState={p.live_preview?.board_state ?? p.board_state} compact maxHeightVh={26} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <p style={{ margin: '0 0 4px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={turnBadgeStyle(game.turn_order?.[game.current_turn_index] === p.id)}>{p.nickname}</span>
                        <span style={{ fontSize: '0.8em', color: '#666' }}>🎴{activeCardCount(p)}/4</span>
                        {p.pending_take?.remaining?.length > 0 && (
                          <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
                            {p.pending_take.remaining.map((c, i) => (
                              <SingleDiscIcon key={i} color={c} size={16} />
                            ))}
                          </span>
                        )}
                      </p>
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
                        {[
                          ...(p.live_preview?.animal_cards ?? p.animal_cards ?? []),
                          ...(p.nature_spirit_card ? [p.nature_spirit_card] : [])
                        ]
                          .filter((entry) => getCardDef(entry.cardId))
                          .map((entry, i) => {
                          const card = getCardDef(entry.cardId)
                          const totalCubes = cardCubeCount(card)
                          const isNatureSpirit = !card.points
                          const currentPoints = !isNatureSpirit && entry.cubesPlaced > 0 ? card.points[entry.cubesPlaced - 1] : null
                          return (
                            <div key={i} style={{ ...cardBoxStyle(false), minWidth: 0 }}>
                            <CardZoomButton card={card} entry={entry} />
                            <div style={{ fontWeight: 'bold', fontSize: 12 }}>
                              {card.name}
                              {isNatureSpirit ? ' 🌿' : ''}
                            </div>
                            <div style={{ fontSize: 11, color: '#666' }}>
                              {isNatureSpirit ? 'punteggio a fine partita' : card.points.join('/')}
                            </div>
                            <div style={{ fontSize: 10, color: '#999' }}>
                              {entry.cubesPlaced}/{totalCubes}
                              {currentPoints !== null ? ` — ${currentPoints} pt` : ''}
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

      {zoomedCard && (
        <div
          onClick={() => setZoomedCard(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: '24px 32px',
              width: 340,
              maxWidth: '90vw',
              textAlign: 'center',
              boxShadow: '0 10px 40px rgba(0,0,0,0.35)'
            }}
          >
            <h2 style={{ margin: '0 0 6px' }}>{zoomedCard.card.name}</h2>
            {zoomedCard.card.points ? (
              <>
                <p style={{ fontSize: '1.2rem', color: '#666', margin: '0 0 4px' }}>{zoomedCard.card.points.join(' / ')}</p>
                <p style={{ fontSize: '0.9rem', color: '#999', margin: '0 0 12px' }}>{zoomedCard.card.points.length} cubi</p>
              </>
            ) : (
              <p style={{ fontSize: '1rem', color: '#666', margin: '0 0 12px' }}>
                🌿 Spirito della Natura — punteggio a fine partita, vedi regolamento
              </p>
            )}
            {zoomedCard.entry && (
              <p style={{ fontWeight: 'bold', margin: '0 0 12px' }}>
                {zoomedCard.entry.cubesPlaced}/{cardCubeCount(zoomedCard.card)} cubi piazzati
                {zoomedCard.card.points && zoomedCard.entry.cubesPlaced > 0
                  ? ` — ${zoomedCard.card.points[zoomedCard.entry.cubesPlaced - 1]} pt`
                  : ''}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '30px 0 110px' }}>
              <div style={{ transform: 'scale(3)' }}>
                <HabitatIcon habitat={zoomedCard.card.habitat} />
              </div>
            </div>
            <button onClick={() => setZoomedCard(null)} style={{ position: 'relative', zIndex: 1 }}>
              Chiudi
            </button>
          </div>
        </div>
      )}

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

      {/* Scelta Spirito della Natura: bloccante, niente sfondo cliccabile
          né pulsante Chiudi. Compare da sola (anche dopo un refresh)
          finché non hai scelto — la condizione dipende solo dai dati
          del server (nature_spirit_choices), mai da uno stato locale. */}
      {isMyTurn && myPlayer?.nature_spirit_choices?.length === 2 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: 20
          }}
        >
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 480, textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 8px' }}>🌿 Scegli la tua carta Spirito della Natura</h2>
            <p style={{ color: '#666', margin: '0 0 20px' }}>
              Tieni una delle due carte coperte, l'altra torna nella scatola per sempre — questa scelta è
              definitiva e non si può annullare.
            </p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              {myPlayer.nature_spirit_choices.map((cardId) => {
                const card = getNatureSpiritCard(cardId)
                return (
                  <div
                    key={cardId}
                    onClick={() => handleChooseNatureSpirit(cardId)}
                    style={{
                      border: '2px solid #ccc',
                      borderRadius: 10,
                      padding: 14,
                      width: 150,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: 'bold', marginBottom: 6 }}>{card.name}</div>
                    <HabitatIcon habitat={card.habitat} />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
