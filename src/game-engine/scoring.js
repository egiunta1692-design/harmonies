import { key, neighbors, boardCells } from './hexGrid.js'
import { getAnimalCard } from './animalCards.js'

// ============================================================
// TABELLE DI PUNTEGGIO — pag. 8-9 del manuale.
// Valori confermati dalla scheda ufficiale "Tallying Points" fornita
// dall'utente (alta confidenza per tutti i numeri qui sotto).
// ============================================================

const TREE_MOUNTAIN_POINTS = { 1: 1, 2: 3, 3: 7 }
const FIELD_POINTS = 5
const BUILDING_POINTS = 5
const ISLAND_POINTS = 5
const RIVER_POINTS = { 1: 0, 2: 2, 3: 5, 4: 8, 5: 11, 6: 15 }
const RIVER_EXTRA_PER_DISC_BEYOND_6 = 4

function getCell(board, q, r) {
  return board.cells[key(q, r)]
}

function topColor(cell) {
  return cell?.discs?.[cell.discs.length - 1] ?? null
}

function boardNeighbors(board, q, r) {
  return neighbors(q, r)
    .map(({ q: nq, r: nr }) => ({ q: nq, r: nr, cell: getCell(board, nq, nr) }))
    .filter((n) => n.cell) // solo vicini che esistono davvero sulla plancia
}

// ------------------------------------------------------------
// ALBERI: 1 punto per Albero alto 1, 3 per alto 2, 7 per alto 3.
// ------------------------------------------------------------
function scoreTrees(board) {
  let total = 0
  for (const { q, r } of boardCells(board)) {
    const cell = getCell(board, q, r)
    if (topColor(cell) === 'green') {
      total += TREE_MOUNTAIN_POINTS[cell.discs.length] ?? 0
    }
  }
  return total
}

// ------------------------------------------------------------
// MONTAGNE: stessa scala degli Alberi, ma vale 0 se non è adiacente
// ad almeno un'altra Montagna (qualsiasi altezza).
// ------------------------------------------------------------
function scoreMountains(board) {
  let total = 0
  for (const { q, r } of boardCells(board)) {
    const cell = getCell(board, q, r)
    if (topColor(cell) !== 'grey') continue
    const hasMountainNeighbor = boardNeighbors(board, q, r).some((n) => topColor(n.cell) === 'grey')
    if (hasMountainNeighbor) {
      total += TREE_MOUNTAIN_POINTS[cell.discs.length] ?? 0
    }
  }
  return total
}

// ------------------------------------------------------------
// CAMPI: 5 punti fissi per ogni gruppo di 2+ dischi gialli adiacenti
// (un gruppo isolato di 1 solo disco non conta).
// ------------------------------------------------------------
function scoreFields(board) {
  const visited = new Set()
  let total = 0

  for (const { q, r } of boardCells(board)) {
    const k = key(q, r)
    if (visited.has(k)) continue
    const cell = getCell(board, q, r)
    if (topColor(cell) !== 'yellow') continue

    // flood-fill del gruppo connesso di dischi gialli
    const group = [{ q, r }]
    visited.add(k)
    let i = 0
    while (i < group.length) {
      const cur = group[i++]
      for (const n of boardNeighbors(board, cur.q, cur.r)) {
        const nk = key(n.q, n.r)
        if (!visited.has(nk) && topColor(n.cell) === 'yellow') {
          visited.add(nk)
          group.push({ q: n.q, r: n.r })
        }
      }
    }

    if (group.length >= 2) total += FIELD_POINTS
  }

  return total
}

// ------------------------------------------------------------
// EDIFICI: 5 punti per ogni Edificio (rosso su una base qualsiasi)
// circondato da almeno 3 colori diversi tra le caselle adiacenti
// occupate (si guarda solo il disco in cima a ciascun vicino).
// ------------------------------------------------------------
function scoreBuildings(board) {
  let total = 0
  for (const { q, r } of boardCells(board)) {
    const cell = getCell(board, q, r)
    if (topColor(cell) !== 'red' || cell.discs.length < 2) continue

    const neighborColors = new Set(
      boardNeighbors(board, q, r)
        .map((n) => topColor(n.cell))
        .filter(Boolean)
    )
    if (neighborColors.size >= 3) total += BUILDING_POINTS
  }
  return total
}

// ------------------------------------------------------------
// ACQUA — LATO A: FIUME. Trova, tra tutti i gruppi connessi di
// dischi blu, quello con il percorso più lungo tra due estremità
// (il diametro del gruppo, in numero di caselle) e assegna punti
// solo per quello migliore.
// ------------------------------------------------------------
function scoreRiver(board) {
  const blueCells = boardCells(board).filter(({ q, r }) => topColor(getCell(board, q, r)) === 'blue')
  const blueKeys = new Set(blueCells.map(({ q, r }) => key(q, r)))
  const visited = new Set()
  let bestLength = 0

  for (const start of blueCells) {
    const startKey = key(start.q, start.r)
    if (visited.has(startKey)) continue

    // Raccoglie l'intero gruppo connesso di dischi blu
    const group = [start]
    visited.add(startKey)
    let i = 0
    while (i < group.length) {
      const cur = group[i++]
      for (const n of neighbors(cur.q, cur.r)) {
        const nk = key(n.q, n.r)
        if (blueKeys.has(nk) && !visited.has(nk)) {
          visited.add(nk)
          group.push(n)
        }
      }
    }

    // Diametro del gruppo: BFS da ogni cella, tengo la distanza massima
    // trovata (numero di caselle nel percorso più breve tra le due
    // estremità più lontane, estremità incluse).
    let groupDiameterEdges = 0
    for (const source of group) {
      const dist = new Map([[key(source.q, source.r), 0]])
      const queue = [source]
      let qi = 0
      while (qi < queue.length) {
        const cur = queue[qi++]
        const curDist = dist.get(key(cur.q, cur.r))
        for (const n of neighbors(cur.q, cur.r)) {
          const nk = key(n.q, n.r)
          if (blueKeys.has(nk) && !dist.has(nk)) {
            dist.set(nk, curDist + 1)
            queue.push(n)
          }
        }
      }
      const maxDist = Math.max(...dist.values())
      if (maxDist > groupDiameterEdges) groupDiameterEdges = maxDist
    }

    const lengthInCells = groupDiameterEdges + 1
    if (lengthInCells > bestLength) bestLength = lengthInCells
  }

  if (bestLength === 0) return 0
  if (bestLength <= 6) return RIVER_POINTS[bestLength] ?? 0
  return RIVER_POINTS[6] + (bestLength - 6) * RIVER_EXTRA_PER_DISC_BEYOND_6
}

// ------------------------------------------------------------
// ACQUA — LATO B: ISOLE. I dischi blu separano la plancia in
// "isole": ogni gruppo connesso di caselle NON blu (occupate o
// vuote) forma un'Isola, 5 punti ciascuna. Se non c'è nessun disco
// blu, l'intera plancia è una sola Isola (come da regolamento).
// ------------------------------------------------------------
function scoreIslands(board) {
  const visited = new Set()
  let islandCount = 0

  for (const { q, r } of boardCells(board)) {
    const k = key(q, r)
    if (visited.has(k)) continue
    if (topColor(getCell(board, q, r)) === 'blue') continue // l'acqua non fa parte di nessuna isola

    const group = [{ q, r }]
    visited.add(k)
    let i = 0
    while (i < group.length) {
      const cur = group[i++]
      for (const n of neighbors(cur.q, cur.r)) {
        const nk = key(n.q, n.r)
        const nCell = getCell(board, n.q, n.r)
        if (!nCell || visited.has(nk) || topColor(nCell) === 'blue') continue
        visited.add(nk)
        group.push(n)
      }
    }
    islandCount += 1
  }

  return islandCount * ISLAND_POINTS
}

// ------------------------------------------------------------
// CARTE ANIMALE: per ogni carta (completata o meno) il punteggio
// nello spazio più in alto senza cubo, cioè points[cubesPlaced - 1].
// ------------------------------------------------------------
function scoreAnimalCards(hand) {
  let total = 0
  for (const entry of hand) {
    if (entry.cubesPlaced === 0) continue
    const card = getAnimalCard(entry.cardId)
    total += card.points[entry.cubesPlaced - 1] ?? 0
  }
  return total
}

// boardMode: 'standard' (Fiume) oppure 'isole'
export function scorePlayerBoard(playerBoard, animalHand, boardMode) {
  const trees = scoreTrees(playerBoard)
  const mountains = scoreMountains(playerBoard)
  const fields = scoreFields(playerBoard)
  const buildings = scoreBuildings(playerBoard)
  const water = boardMode === 'isole' ? scoreIslands(playerBoard) : scoreRiver(playerBoard)
  const animals = scoreAnimalCards(animalHand ?? [])
  const landscapeTotal = trees + mountains + fields + buildings + water

  return {
    trees,
    mountains,
    fields,
    buildings,
    water,
    waterMode: boardMode === 'isole' ? 'isole' : 'fiume',
    animals,
    landscapeTotal,
    total: landscapeTotal + animals
  }
}
