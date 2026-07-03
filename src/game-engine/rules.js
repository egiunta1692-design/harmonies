import { createBoardShape, key } from './hexGrid.js'

// ============================================================
// REGOLE DI PIAZZAMENTO DISCHI — pag. 4-5 del manuale
//
// Una casella contiene una pila di dischi (dal basso verso l'alto)
// più, eventualmente, un cubo Animale che la "sigilla" definitivamente.
//
// Regole di stacking (dalla sezione "Come collocare un disco"):
// - Sempre possibile su casella vuota.
// - Verde SOLO sopra 0, 1 o 2 dischi marroni (Albero, altezza 1-3).
// - Grigio SOLO sopra 0, 1 o 2 dischi grigi (Montagna, altezza 1-3).
// - Rosso SOLO sopra 1 disco marrone, grigio o rosso (Edificio).
// - Blu e giallo SOLO su casella vuota, mai impilati.
// - Mai sotto dischi già collocati, mai su una casella con un cubo Animale.
//
// NOTA: la forma della plancia dipende dalla modalità di gioco
// (Standard/Fiume vs Isole, vedi hexGrid.js) e NON è più una costante
// fissa qui: ogni plancia giocatore porta con sé le proprie celle
// (create con la forma giusta da createEmptyPlayerBoard), e "essere
// fuori dalla plancia" equivale semplicemente a "non esiste in
// playerBoard.cells".
// ============================================================

export function createEmptyPlayerBoard(boardMode = 'standard') {
  const cells = {}
  for (const { q, r } of createBoardShape(boardMode)) {
    cells[key(q, r)] = { discs: [], animalCube: null }
  }
  return { boardMode, cells }
}

function getCell(playerBoard, q, r) {
  return playerBoard.cells[key(q, r)]
}

// Ritorna { ok: true } oppure { ok: false, reason: '...' }
export function canPlaceDisc(playerBoard, q, r, color) {
  const cell = getCell(playerBoard, q, r)
  if (!cell) {
    return { ok: false, reason: 'Casella fuori dalla plancia' }
  }
  if (cell.animalCube) {
    return { ok: false, reason: 'Casella occupata da un cubo Animale' }
  }

  const stack = cell.discs
  if (stack.length === 0) {
    return { ok: true } // sempre possibile su casella vuota
  }
  if (stack.length >= 3) {
    return { ok: false, reason: 'Altezza massima (3) raggiunta' }
  }

  if (color === 'green') {
    if (stack.every((c) => c === 'brown')) return { ok: true }
    return { ok: false, reason: 'Un Albero può poggiare solo su dischi marroni' }
  }
  if (color === 'grey') {
    if (stack.every((c) => c === 'grey')) return { ok: true }
    return { ok: false, reason: 'Una Montagna può poggiare solo su dischi grigi' }
  }
  if (color === 'red') {
    const top = stack[stack.length - 1]
    if (['brown', 'grey', 'red'].includes(top)) return { ok: true }
    return { ok: false, reason: 'Un Edificio richiede una base marrone, grigia o rossa' }
  }
  // blue, yellow: mai impilabili
  return { ok: false, reason: `Un disco ${color} può essere collocato solo su una casella vuota` }
}

// Ritorna una NUOVA plancia giocatore (immutabile) con il disco piazzato.
// Lancia un errore se la mossa non è valida: chiamare sempre canPlaceDisc
// prima, per gestire l'errore in modo controllato lato UI.
export function placeDisc(playerBoard, q, r, color) {
  const check = canPlaceDisc(playerBoard, q, r, color)
  if (!check.ok) throw new Error(check.reason)

  const k = key(q, r)
  const cell = playerBoard.cells[k]
  return {
    ...playerBoard,
    cells: {
      ...playerBoard.cells,
      [k]: { ...cell, discs: [...cell.discs, color] }
    }
  }
}
