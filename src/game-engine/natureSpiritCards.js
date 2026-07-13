// ============================================================
// CARTE SPIRITO DELLA NATURA (espansione) — dati confermati per iscritto
// dall'utente, carta per carta.
//
// A differenza delle carte Animale, non hanno un valore fisso di punti
// al piazzamento del cubo: diventano invece una REGOLA DI PUNTEGGIO
// applicata a fine partita su tutto il Paesaggio. Ogni carta ha un
// solo cubo Spirito (bianco).
//
// `habitat`: stesso formato delle carte Animale (vedi habitatPatterns.js
// e habitat.js) — il motore di piazzamento cubi è già generico e non
// distingue Animale da Spirito della Natura.
//
// `scoreRule`: { type, ...params } — interpretato da natureSpiritScoring.js
// per calcolare il bonus a fine partita, SOLO se il cubo è stato piazzato.
// ============================================================

import { chain, triangle, cluster, pair, diamond } from './habitatPatterns.js'

export const NATURE_SPIRIT_CARDS = [
  {
    id: 'tartaruga',
    name: 'Tartaruga',
    description: '2 punti per ogni tessera Acqua giocata sulla tua plancia.',
    habitat: chain([{ color: 'grey', height: 2 }, 'blue', 'blue'], 2),
    scoreRule: { type: 'per_water_tile', points: 2 }
  },
  {
    id: 'libellula',
    name: 'Libellula',
    description: '7 punti per ogni fiume (gruppo di Acqua connesso) di 2 o più tessere.',
    habitat: chain([{ color: 'green', height: 2 }, 'blue', { color: 'green', height: 2 }], 1),
    scoreRule: { type: 'per_river_group', minSize: 2, points: 7 }
  },
  {
    id: 'capra_di_montagna',
    name: 'Capra di montagna',
    description: '4 punti per ogni Montagna alta 2 o più tessere.',
    habitat: pair('grey', 'grey', { heightA: 2, heightB: 3 }),
    scoreRule: { type: 'per_mountain_min_height', minHeight: 2, points: 4 }
  },
  {
    id: 'castoro',
    name: 'Castoro',
    description: ['3 punti per ogni Montagna alta 1 o 2.', '1 punto per ogni Montagna alta 3.'],
    // Vertice = montagna centrale a 2 livelli, cubo sulla base destra (grigio singolo) — cubeIndex 1, non il vertice.
    habitat: triangle('grey', 'grey', { color: 'grey', height: 2 }, 1),
    scoreRule: { type: 'mountain_height_tiered', low: { maxHeight: 2, points: 3 }, high: { minHeight: 3, points: 1 } }
  },
  {
    id: 'gufo',
    name: 'Gufo',
    description: ['3 punti per ogni Albero alto 1 o 2.', '1 punto per ogni Albero alto 3.'],
    habitat: cluster('green', 'green', { color: 'green', height: 3 }, 2),
    scoreRule: { type: 'tree_height_tiered', low: { maxHeight: 2, points: 3 }, high: { minHeight: 3, points: 1 } }
  },
  {
    id: 'cervo',
    name: 'Cervo',
    description: '4 punti per ogni Albero alto 2 o 3.',
    habitat: chain([{ color: 'green', height: 3 }, { color: 'green', height: 2 }, 'green'], 1),
    scoreRule: { type: 'tree_min_height', minHeight: 2, points: 4 }
  },
  {
    id: 'gatto',
    name: 'Gatto',
    description: '4 punti per ogni Edificio isolato (senza altri Edifici adiacenti).',
    habitat: chain([{ color: 'red', height: 2 }, 'green', { color: 'red', height: 2 }], 2),
    scoreRule: { type: 'building_isolated', points: 4 }
  },
  {
    id: 'gru',
    name: 'Gru',
    description: '6 punti per ogni gruppo di 2 o più Edifici collegati tra loro (un gruppo più grande vale comunque 6 punti, una sola volta).',
    habitat: chain(['yellow', { color: 'red', height: 2 }, { color: 'red', height: 2 }], 2),
    scoreRule: { type: 'building_group_isolated', minSize: 2, points: 6 }
  },
  {
    id: 'trex',
    name: 'T-Rex',
    description: '2 punti per ogni cubo Animale adiacente al cubo Spirito di questa carta.',
    habitat: chain([{ color: 'grey', height: 3 }, 'yellow', { color: 'green', height: 3 }], 1),
    scoreRule: { type: 'animals_adjacent_to_spirit', points: 2 }
  },
  {
    id: 'farfalla',
    name: 'Farfalla',
    description: '5 punti per ogni tessera Gialla isolata (gruppo di 1 sola tessera).',
    // sinistra=giallo, destra=giallo(cubo), sopra=azzurro, sotto=azzurro
    habitat: diamond('yellow', 'yellow', 'blue', 'blue', 1),
    scoreRule: { type: 'yellow_isolated', points: 5 }
  },
  {
    id: 'leone',
    name: 'Leone',
    description: [
      '2 punti per ogni campo (gruppo di dischi gialli) da 1 o 2 tessere.',
      '10 punti per ogni campo da 3 o più tessere.'
    ],
    habitat: chain([{ color: 'green', height: 2 }, 'yellow', 'yellow'], 1),
    scoreRule: { type: 'field_tiered', low: { maxSize: 2, points: 2 }, high: { minSize: 3, points: 10 } }
  }
]

export function getNatureSpiritCard(cardId) {
  return NATURE_SPIRIT_CARDS.find((c) => c.id === cardId)
}
