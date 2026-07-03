// ============================================================
// COORDINATE ESAGONALI (sistema assiale "q,r")
// Riferimento: https://www.redblobgames.com/grids/hexagons/
// Ogni cella è identificata da una coppia (q, r). La usiamo per:
// - definire la forma della plancia giocatore
// - calcolare i vicini (per Campi/Edifici che richiedono adiacenza)
// - ruotare un pattern Habitat in tutte le direzioni (pag. 7 del manuale)
// ============================================================

export function key(q, r) {
  return `${q},${r}`
}

export function parseKey(k) {
  const [q, r] = k.split(',').map(Number)
  return { q, r }
}

// Ricava l'elenco di caselle {q,r} direttamente da una plancia giocatore
// reale (playerBoard.cells), invece che da una forma fissa condivisa:
// così la forma corretta (Standard 25 caselle o Isole 32) è sempre
// quella con cui QUELLA plancia è stata creata, letta dai suoi dati.
export function boardCells(playerBoard) {
  return Object.keys(playerBoard.cells).map(parseKey)
}

// Le 6 direzioni esagonali "flat-top", in ordine orario
const DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 }
]

export function neighbors(q, r) {
  return DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }))
}

export function hexDistance(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2
}

// Ruota una coordinata attorno all'origine di 60° * steps (steps 0-5).
// Serve per provare un pattern Habitat in tutte le 6 orientazioni,
// come richiesto a pag. 7 ("può essere orientato in qualsiasi direzione").
// Usa coordinate cubiche (x,y,z) con x+y+z=0: una rotazione di 60° in
// senso orario è (x,y,z) -> (-z,-x,-y).
export function rotate60(q, r, steps) {
  let x = q
  let z = r
  let y = -x - z
  const n = ((steps % 6) + 6) % 6
  for (let i = 0; i < n; i++) {
    const nx = -z
    const ny = -x
    const nz = -y
    x = nx
    y = ny
    z = nz
  }
  return { q: x, r: z }
}

// Forma della plancia giocatore, ricostruita dai conteggi ESATTI forniti
// dall'utente colonna per colonna sulle plance fisiche:
// - Standard (Fiume): 7 colonne alternate 4,3,4,3,4,3,4 = 25 caselle
// - Isole: 7 colonne alternate 5,4,5,4,5,4,5 = 32 caselle
//
// Le colonne "corte" si incastrano naturalmente a metà altezza tra due
// caselle della colonna adiacente "alta" grazie alla formula assiale
// flat-top di HexBoard — ma quella stessa formula fa anche "scivolare"
// ogni colonna un po' più in basso della precedente (la coordinata y
// dipende anche da q). Su 7 colonne questa deriva si accumula e crea un
// parallelogramma inclinato invece della sagoma verticale della foto.
// La correggiamo spostando la coordinata r di ogni colonna di
// -floor(colonna/2): così le colonne con lo stesso numero di esagoni
// (0&2&4&6, oppure 1&3&5) restano allo stesso livello, mentre
// l'incastro a metà altezza tra colonne adiacenti resta corretto (è
// solo un cambio di origine per colonna, non tocca le adiacenze).
export function createBoardShape(mode = 'standard') {
  const tall = mode === 'isole' ? 5 : 4
  const short = mode === 'isole' ? 4 : 3
  const cells = []
  for (let col = 0; col < 7; col++) {
    const len = col % 2 === 0 ? tall : short
    const rOffset = Math.floor(col / 2)
    for (let i = 0; i < len; i++) {
      cells.push({ q: col, r: i - rOffset })
    }
  }
  return cells
}
