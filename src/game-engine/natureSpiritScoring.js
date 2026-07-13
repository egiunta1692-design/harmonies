import { boardCells } from './hexGrid.js'
import { getCell, topColor, boardNeighbors, findConnectedGroups } from './scoring.js'
import { getNatureSpiritCard } from './natureSpiritCards.js'

// Trova la casella dove QUESTA specifica carta ha il proprio cubo
// Spirito (bianco) — serve solo al T-Rex, per contare i cubi Animale
// adiacenti al SUO cubo, non a uno qualsiasi.
function findOwnCubeCell(board, cardId) {
  for (const { q, r } of boardCells(board)) {
    const cell = getCell(board, q, r)
    if (cell?.animalCube?.cardId === cardId) return { q, r }
  }
  return null
}

function computeBonus(board, rule, cardId) {
  switch (rule.type) {
    // Tartaruga: punti per OGNI singola tessera Acqua (non a gruppi).
    case 'per_water_tile': {
      let count = 0
      for (const { q, r } of boardCells(board)) {
        if (topColor(getCell(board, q, r)) === 'blue') count++
      }
      return count * rule.points
    }

    // Libellula: punti per ogni gruppo di Acqua connesso di dimensione >= minSize.
    case 'per_river_group': {
      const groups = findConnectedGroups(board, (cell) => topColor(cell) === 'blue')
      return groups.filter((g) => g.length >= rule.minSize).length * rule.points
    }

    // Capra di montagna: punti per ogni singola Montagna (pila grigia,
    // non a gruppi) alta almeno minHeight.
    case 'per_mountain_min_height': {
      let count = 0
      for (const { q, r } of boardCells(board)) {
        const cell = getCell(board, q, r)
        if (topColor(cell) === 'grey' && cell.discs.length >= rule.minHeight) count++
      }
      return count * rule.points
    }

    // Castoro: punti a scaglioni in base all'altezza di ogni singola Montagna.
    case 'mountain_height_tiered': {
      let total = 0
      for (const { q, r } of boardCells(board)) {
        const cell = getCell(board, q, r)
        if (topColor(cell) !== 'grey') continue
        const h = cell.discs.length
        if (h <= rule.low.maxHeight) total += rule.low.points
        else if (h >= rule.high.minHeight) total += rule.high.points
      }
      return total
    }

    // Gufo: stesso principio del Castoro, ma sugli Alberi.
    case 'tree_height_tiered': {
      let total = 0
      for (const { q, r } of boardCells(board)) {
        const cell = getCell(board, q, r)
        if (topColor(cell) !== 'green') continue
        const h = cell.discs.length
        if (h <= rule.low.maxHeight) total += rule.low.points
        else if (h >= rule.high.minHeight) total += rule.high.points
      }
      return total
    }

    // Cervo: punti per ogni Albero alto almeno minHeight.
    case 'tree_min_height': {
      let count = 0
      for (const { q, r } of boardCells(board)) {
        const cell = getCell(board, q, r)
        if (topColor(cell) === 'green' && cell.discs.length >= rule.minHeight) count++
      }
      return count * rule.points
    }

    // Gatto: punti per ogni Edificio SENZA altri Edifici adiacenti.
    case 'building_isolated': {
      let count = 0
      for (const { q, r } of boardCells(board)) {
        const cell = getCell(board, q, r)
        if (topColor(cell) !== 'red' || cell.discs.length < 2) continue
        const hasBuildingNeighbor = boardNeighbors(board, q, r).some(
          (n) => topColor(n.cell) === 'red' && n.cell.discs.length >= 2
        )
        if (!hasBuildingNeighbor) count++
      }
      return count * rule.points
    }

    // Gru: punti per ogni GRUPPO di 2+ Edifici collegati tra loro (un
    // gruppo di 3+ vale comunque una volta sola, come da regolamento).
    case 'building_group_isolated': {
      const groups = findConnectedGroups(board, (cell) => topColor(cell) === 'red' && cell.discs.length >= 2)
      return groups.filter((g) => g.length >= rule.minSize).length * rule.points
    }

    // T-Rex: punti per ogni cubo Animale (di qualsiasi carta) adiacente
    // al cubo Spirito di QUESTA carta.
    case 'animals_adjacent_to_spirit': {
      const ownCell = findOwnCubeCell(board, cardId)
      if (!ownCell) return 0
      const count = boardNeighbors(board, ownCell.q, ownCell.r).filter((n) => n.cell.animalCube).length
      return count * rule.points
    }

    // Farfalla: punti per ogni tessera Gialla ISOLATA (gruppo di 1 sola).
    case 'yellow_isolated': {
      const groups = findConnectedGroups(board, (cell) => topColor(cell) === 'yellow')
      return groups.filter((g) => g.length === 1).length * rule.points
    }

    // Leone: punti a scaglioni in base alla dimensione di ogni gruppo
    // di dischi gialli (1-2 = low, 3+ = high), UNA VOLTA per gruppo.
    case 'field_tiered': {
      const groups = findConnectedGroups(board, (cell) => topColor(cell) === 'yellow')
      let total = 0
      for (const g of groups) {
        if (g.length <= rule.low.maxSize) total += rule.low.points
        else if (g.length >= rule.high.minSize) total += rule.high.points
      }
      return total
    }

    default:
      return 0
  }
}

// entry: { cardId, cubesPlaced } — il singolo cubo Spirito è piazzato
// (1) oppure no (0). Ritorna 0 se non piazzato o se la carta non esiste.
export function scoreNatureSpiritCard(board, entry) {
  if (!entry || entry.cubesPlaced === 0) return 0
  const card = getNatureSpiritCard(entry.cardId)
  if (!card?.scoreRule) return 0
  return computeBonus(board, card.scoreRule, card.id)
}
