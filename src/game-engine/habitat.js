import { rotate60, key, boardCells } from './hexGrid.js'

// Verifica se una cella della plancia soddisfa una specifica di pattern.
// Vedi animalCards.js per il formato di "spec".
function cellMatchesSpec(discs, spec) {
  if (spec.color === 'red') {
    // Edificio: rosso in cima a qualunque base — l'altezza esatta non è
    // vincolata dal manuale, solo "1 disco rosso sopra a 1 disco".
    return discs.length >= 2 && discs[discs.length - 1] === 'red'
  }
  if (spec.color === 'green' || spec.color === 'grey') {
    // Alberi/Montagne: l'altezza deve corrispondere esattamente (pag. 7)
    const height = spec.height ?? 1
    return discs.length === height && discs[discs.length - 1] === spec.color
  }
  // blue, yellow, brown "nudo": sempre e solo un disco singolo
  return discs.length === 1 && discs[0] === spec.color
}

// Cerca tutte le posizioni in cui il pattern Habitat di una carta è
// formato sulla plancia giocatore, provando ogni cella come ancoraggio
// e le 6 rotazioni (pag. 7: "può essere orientato in qualsiasi direzione").
// Ritorna un array di { cubeQ, cubeR } — le caselle su cui, se scelte,
// andrebbe collocato il prossimo cubo Animale di questa carta.
// Se card.habitat è null (pattern non ancora disponibile), ritorna [].
export function findHabitatMatches(playerBoard, card) {
  if (!card?.habitat) return []

  const results = []
  const seen = new Set()

  for (const { q: aq, r: ar } of boardCells(playerBoard)) {
    for (let rot = 0; rot < 6; rot++) {
      const resolved = card.habitat.map((spec) => {
        const d = rotate60(spec.dq, spec.dr, rot)
        return { q: aq + d.q, r: ar + d.r, spec }
      })

      const allMatch = resolved.every(({ q, r, spec }) => {
        const cell = playerBoard.cells[key(q, r)]
        if (!cell) return false
        // Solo la casella che riceverebbe IL NUOVO cubo deve essere libera.
        // Le altre caselle del pattern possono già avere un cubo Animale
        // di un'altra carta: i dischi sotto restano validi per sempre
        // (vedi NOTA pag. 6 del manuale), quindi contano comunque come
        // "terreno" per questo pattern.
        if (spec.cube && cell.animalCube) return false
        return cellMatchesSpec(cell.discs, spec)
      })

      if (allMatch) {
        const cubeCell = resolved.find((c) => c.spec.cube)
        const k = key(cubeCell.q, cubeCell.r)
        if (!seen.has(k)) {
          seen.add(k)
          results.push({ cubeQ: cubeCell.q, cubeR: cubeCell.r })
        }
      }
    }
  }

  return results
}

// Colloca un cubo Animale su una casella (deve già essere stata validata
// con findHabitatMatches). Ritorna una NUOVA plancia (immutabile).
export function placeAnimalCube(playerBoard, q, r, cardId) {
  const k = key(q, r)
  const cell = playerBoard.cells[k]
  if (!cell) throw new Error('Casella inesistente')
  if (cell.animalCube) throw new Error('Casella già occupata da un cubo Animale')

  return {
    ...playerBoard,
    cells: {
      ...playerBoard.cells,
      [k]: { ...cell, animalCube: { cardId } }
    }
  }
}

// Rimuove un cubo Animale da una casella. Il regolamento (pag. 6) dice
// che il piazzamento è definitivo — questa funzione esiste SOLO per
// permettere all'interfaccia di annullare un click per sbaglio entro lo
// stesso turno, non per un "annulla" libero a partita in corso.
export function removeAnimalCube(playerBoard, q, r) {
  const k = key(q, r)
  const cell = playerBoard.cells[k]
  if (!cell?.animalCube) throw new Error('Nessun cubo Animale su questa casella')

  return {
    ...playerBoard,
    cells: {
      ...playerBoard.cells,
      [k]: { ...cell, animalCube: null }
    }
  }
}
