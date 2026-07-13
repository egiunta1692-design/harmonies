// ============================================================
// MOTORE DI GIOCO — modulo JS puro, nessuna dipendenza da React
// o da Supabase. Deve poter girare identico nel browser (per
// l'anteprima istantanea del client) e in una Edge Function Deno
// (per la validazione autorevole lato server, fase 2).
//
// Stato: il piazzamento dischi (pag. 4-5 del manuale) è implementato
// in rules.js. Habitat delle carte Animale e punteggio finale sono
// ancora placeholder — vedi in fondo a questo file.
// ============================================================

import { ANIMAL_CARDS } from './animalCards.js'

// Composizione del sacchetto dischi (manuale, pag. 2)
export const DISC_COUNTS = {
  grey: 23,
  blue: 23,
  brown: 21,
  green: 19,
  yellow: 19,
  red: 15
}

export const TOTAL_DISCS = Object.values(DISC_COUNTS).reduce((a, b) => a + b, 0) // 120

// Crea il sacchetto come array piatto di colori, es. ['grey','grey',...]
export function createBag() {
  const bag = []
  for (const [color, count] of Object.entries(DISC_COUNTS)) {
    for (let i = 0; i < count; i++) bag.push(color)
  }
  return shuffle(bag)
}

export function shuffle(array) {
  const a = [...array]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Stato iniziale di una partita nuova
export function createInitialGameState() {
  const bag = createBag()
  const centralBoard = [[], [], [], [], []].map(() => {
    return bag.splice(0, 3) // 3 dischi pescati casualmente per ognuna delle 5 caselle
  })

  const animalDeck = shuffle(ANIMAL_CARDS.map((c) => c.id))
  const animalRow = animalDeck.splice(0, 5)

  return {
    status: 'waiting',
    centralBoard,   // [[colore,colore,colore], ...] x5 caselle
    bag,            // dischi rimanenti
    animalDeck,      // id delle carte nel mazzo di pesca (coperte)
    animalRow,       // id delle 5 carte scoperte
    turnOrder: [],
    currentTurnIndex: 0
  }
}

// Piazzamento dischi: implementato in rules.js (regole pag. 4-5)
export { createEmptyPlayerBoard, canPlaceDisc, placeDisc } from './rules.js'

// Coordinate esagonali e forma della plancia (dipende dalla modalità:
// vedi hexGrid.js). boardCells legge la forma direttamente da una
// plancia giocatore reale, così è sempre coerente con come è stata creata.
export { createBoardShape, boardCells } from './hexGrid.js'

// Carte e cubi Animale
export { ANIMAL_CARDS, getAnimalCard } from './animalCards.js'
export { findHabitatMatches, placeAnimalCube } from './habitat.js'

// Carte Spirito della Natura (espansione) — usano lo stesso motore di
// riconoscimento pattern/piazzamento cubo delle carte Animale sopra.
// Il mazzo (NATURE_SPIRIT_CARDS) è condiviso via games.nature_spirit_deck:
// ogni giocatore pesca le proprie 2 carte da solo, al proprio primo
// turno (vedi Game.jsx) — niente distribuzione centralizzata, che
// richiederebbe scritture incrociate tra righe player bloccate da RLS.
export { NATURE_SPIRIT_CARDS, getNatureSpiritCard } from './natureSpiritCards.js'
export { scoreNatureSpiritCard } from './natureSpiritScoring.js'

// Prende i 3 dischi da una casella della plancia centrale.
// Ritorna { discs, centralBoard } con la casella svuotata.
export function takeDiscsFromCentralBoard(centralBoard, slotIndex) {
  const discs = centralBoard[slotIndex]
  if (!discs || discs.length === 0) {
    throw new Error('Casella della plancia centrale vuota')
  }
  const newCentralBoard = centralBoard.map((slot, i) => (i === slotIndex ? [] : slot))
  return { discs, centralBoard: newCentralBoard }
}

// Fine turno (pag. 4): pesca 3 dischi dal sacchetto e rifornisce
// ogni casella vuota della plancia centrale.
export function refillCentralBoard(centralBoard, bag) {
  let remainingBag = [...bag]
  const newCentralBoard = centralBoard.map((slot) => {
    if (slot.length > 0) return slot
    const drawn = remainingBag.splice(0, 3)
    return drawn
  })
  return { centralBoard: newCentralBoard, bag: remainingBag }
}

// Fine turno (pag. 4, riassunto): rifornisce la fila di carte Animale
// in modo che ci siano sempre 5 carte scoperte. Prendere una carta
// lascia la casella vuota (null) durante il turno; questa funzione la
// colma pescando dal mazzo, SOLO alla conferma del turno — non subito
// al momento della presa.
export function refillAnimalRow(animalRow, animalDeck) {
  let remainingDeck = [...animalDeck]
  const newRow = animalRow.map((cardId) => {
    if (cardId) return cardId
    return remainingDeck.shift() ?? null
  })
  return { animalRow: newRow, animalDeck: remainingDeck }
}

// Punteggio finale (Alberi, Montagne, Campi, Edifici, Acqua, carte Animale)
export { scorePlayerBoard } from './scoring.js'
