// ============================================================
// CARTE ANIMALE — dati letti dalla foto ad alta risoluzione delle 32
// carte fornita dall'utente.
//
// Affidabilità:
// - nome, points, cubeCount: alta confidenza per tutte le carte.
// - habitat: alta confidenza per le coppie a 2 tessere e per Corvi
//   (confermato anche dalla carta fisica fotografata a parte).
//   Media confidenza per le catene a 3 tessere e i cluster a triangolo:
//   i colori e la posizione del cubo sono letti con sicurezza, ma la
//   forma esatta (fila dritta vs triangolo) è una lettura visiva da
//   un'icona piccola — se in gioco una carta non si forma mai pur
//   avendo la disposizione giusta sul tavolo, segnalamela e la correggo.
//
// Formato pattern: array di celle relative a un ancoraggio (0,0),
// con coordinate assiali arbitrarie (la rotazione a 6 vie in fase di
// verifica rende la direzione di partenza irrilevante). Ogni cella:
// { dq, dr, color, height?, cube? }
// - color: colore richiesto in cima alla pila in quella casella
// - height: SOLO per green/grey, altezza esatta della pila (regola
//   pag. 7: "l'altezza di Alberi e Montagne deve corrispondere
//   esattamente"); per il rosso l'altezza non è vincolante per il
//   matching (qualsiasi base marrone/grigia/rossa va bene), conta solo
//   per il disegno dell'icona
// - cube: true sulla casella dove va posizionato il cubo Animale
// ============================================================

function spec(s) {
  return typeof s === 'string' ? { color: s } : s
}

// Fila dritta di N caselle in una direzione, con il cubo sulla cella
// all'indice indicato. Ogni elemento può essere una stringa colore
// (es. 'green') o un oggetto { color, height } per specificare l'altezza.
function chain(cells, cubeIndex) {
  return cells.map((c, i) => {
    const s = spec(c)
    const out = { dq: i, dr: 0, ...s }
    if (i === cubeIndex) out.cube = true
    return out
  })
}

// Cluster a triangolo: due caselle di base adiacenti + una "in cima",
// adiacente a entrambe. Usato per i pattern che nell'icona appaiono
// come un piccolo triangolo invece di una fila dritta.
// Cluster a triangolo: due caselle di base (non adiacenti tra loro) +
// il vertice, centrato sopra entrambe e adiacente a entrambe — come
// mostrato nelle icone reali (es. Pinguini, Pavoni, Martin Pescatore):
// due dischi affiancati alla stessa altezza, il terzo incastrato sopra
// nel mezzo. Le coordinate sono calcolate per la geometria esagonale
// flat-top: baseSinistra=(-1,1) e baseDestra=(1,0) sono entrambe
// adiacenti al vertice=(0,0) ma NON adiacenti tra loro.
function triangle(a, b, top, cubeIndex) {
  const positions = [
    { dq: -1, dr: 1 }, // base sinistra
    { dq: 1, dr: 0 }, // base destra
    { dq: 0, dr: 0 } // vertice, centrato sopra le due basi
  ]
  return [a, b, top].map((c, i) => {
    const s = spec(c)
    const out = { ...positions[i], ...s }
    if (i === cubeIndex) out.cube = true
    return out
  })
}

// Coppia di 2 caselle adiacenti, cubo sempre sulla seconda.
function pair(colorA, colorB, { heightA, heightB } = {}) {
  return [
    { dq: 0, dr: 0, color: colorA, height: heightA },
    { dq: 1, dr: 0, color: colorB, height: heightB, cube: true }
  ]
}

export const ANIMAL_CARDS = [
  // ---- Coppie a 2 tessere: alta confidenza ----
  { id: 'coccinelle', name: 'Coccinelle', points: [2, 5, 8, 12, 17], habitat: pair('green', 'yellow') },
  { id: 'rane', name: 'Rane', points: [2, 4, 6, 10, 15], habitat: pair('green', 'blue') },
  { id: 'suricati', name: 'Suricati', points: [2, 5, 9, 14], habitat: pair('yellow', 'grey') },
  { id: 'koala', name: 'Koala', points: [3, 6, 10, 15], habitat: pair('green', 'green', { heightA: 2 }) },
  { id: 'anatre', name: 'Anatre', points: [2, 4, 8, 13], habitat: pair('red', 'blue', { heightA: 2 }) },
  { id: 'pipistrelli', name: 'Pipistrelli', points: [3, 6, 10, 15], habitat: pair('green', 'grey', { heightA: 3 }) },
  { id: 'pesci', name: 'Pesci', points: [3, 6, 10, 16], habitat: pair('grey', 'blue', { heightA: 3 }) },
  { id: 'facoceri', name: 'Facoceri', points: [4, 8, 13], habitat: pair('red', 'green', { heightB: 2 }) },
  { id: 'falchi', name: 'Falchi', points: [5, 11], habitat: pair('yellow', 'grey', { heightB: 3 }) },

  // ---- Fila di 3 tessere: media confidenza ----
  { id: 'corvi', name: 'Corvi', points: [4, 9], habitat: chain(['red', 'yellow', 'red'], 1) }, // confermato da foto carta reale
  { id: 'lontre', name: 'Lontre', points: [5, 10, 16], habitat: chain(['green', 'green', 'blue'], 2) },
  { id: 'volpi_fennec', name: 'Volpi Fennec', points: [4, 9, 16], habitat: chain(['yellow', 'grey', 'grey'], 2) },
  { id: 'conigli', name: 'Conigli', points: [5, 10, 17], habitat: chain(['red', 'green', 'green'], 2) },
  { id: 'gechi', name: 'Gechi', points: [5, 10, 16], habitat: chain(['yellow', 'yellow', 'red'], 2) },
  { id: 'alligatori', name: 'Alligatori', points: [4, 9, 15], habitat: chain([{ color: 'green', height: 2 }, 'blue', 'blue'], 2) },
  { id: 'mante', name: 'Mante', points: [4, 10, 16], habitat: chain(['grey', 'grey', 'blue'], 2) },
  { id: 'fenicotteri', name: 'Fenicotteri', points: [4, 10, 16], habitat: chain(['yellow', 'yellow', 'blue'], 2) },
  { id: 'lupi', name: 'Lupi', points: [4, 10, 16], habitat: chain(['yellow', { color: 'green', height: 2 }, { color: 'green', height: 2 }], 1) },
  { id: 'pappagalli', name: 'Pappagalli', points: [4, 9, 14], habitat: chain(['blue', 'blue', 'green'], 2) },
  { id: 'alpaca', name: 'Alpaca', points: [5, 12], habitat: chain(['grey', 'yellow', 'yellow'], 2) },
  { id: 'pantere', name: 'Pantere', points: [5, 11], habitat: chain([{ color: 'green', height: 2 }, { color: 'green', height: 2 }, 'red'], 2) },
  { id: 'orsi_bruni', name: 'Orsi Bruni', points: [5, 11], habitat: chain(['grey', 'grey', 'green'], 2) },
  { id: 'scimmie_artiche', name: 'Scimmie Artiche', points: [5, 11], habitat: chain(['blue', 'blue', { color: 'grey', height: 2 }], 2) },
  { id: 'ricci', name: 'Ricci', points: [5, 12], habitat: chain(['green', 'green', 'red'], 2) },

  // ---- Cluster a triangolo: media confidenza ----
  { id: 'pinguini', name: 'Pinguini', points: [4, 10, 16], habitat: triangle('blue', 'blue', 'grey', 2) },
  { id: 'pavoni', name: 'Pavoni', points: [5, 10, 17], habitat: triangle('blue', 'blue', 'red', 2) },
  { id: 'toporagno', name: 'Toporagno', points: [5, 10, 17], habitat: triangle('yellow', 'yellow', 'red', 2) },
  {
    id: 'volpi_artiche',
    name: 'Volpi Artiche',
    points: [5, 10, 17],
    habitat: triangle({ color: 'green', height: 2 }, { color: 'green', height: 2 }, 'yellow', 2)
  },
  {
    id: 'martin_pescatore',
    name: 'Martin Pescatore',
    points: [5, 11, 18],
    habitat: triangle('blue', 'blue', { color: 'green', height: 3 }, 2) // torre a 3 piani, la più alta del mazzo
  },
  { id: 'bombi', name: 'Bombi', points: [8, 18], habitat: triangle('yellow', 'yellow', { color: 'green', height: 2 }, 2) },
  { id: 'procioni', name: 'Procioni', points: [6, 12], habitat: triangle('blue', 'blue', 'yellow', 2) },

  // ---- Scoiattoli: unico caso rimasto con lettura incerta ----
  { id: 'scoiattoli', name: 'Scoiattoli', points: [4, 9, 15], habitat: pair('green', 'red', { heightA: 2 }) }
]

export function getAnimalCard(cardId) {
  return ANIMAL_CARDS.find((c) => c.id === cardId)
}
