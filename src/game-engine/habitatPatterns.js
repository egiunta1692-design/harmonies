// ============================================================
// Helper di costruzione pattern Habitat, condivisi tra carte Animale
// e carte Spirito della Natura (stesso formato, stesso motore di
// riconoscimento — vedi habitat.js).
//
// Formato pattern: array di celle relative a un ancoraggio (0,0), con
// coordinate assiali arbitrarie (la rotazione a 6 vie in fase di
// verifica rende la direzione di partenza irrilevante). Ogni cella:
// { dq, dr, color, height?, cube? }
// - color: colore richiesto in cima alla pila in quella casella
// - height: SOLO per green/grey, altezza esatta della pila
// - cube: true sulla casella dove va posizionato il cubo
// ============================================================

export function spec(s) {
  return typeof s === 'string' ? { color: s } : s
}

// Fila dritta di N caselle in una direzione, con il cubo sulla cella
// all'indice indicato. Ogni elemento può essere una stringa colore
// (es. 'green') o un oggetto { color, height } per specificare l'altezza.
export function chain(cells, cubeIndex) {
  return cells.map((c, i) => {
    const s = spec(c)
    const out = { dq: i, dr: 0, ...s }
    if (i === cubeIndex) out.cube = true
    return out
  })
}

// Cluster a triangolo: due caselle di base (non adiacenti tra loro) +
// il vertice, centrato sopra entrambe e adiacente a entrambe. Le
// coordinate sono calcolate per la geometria esagonale flat-top:
// baseSinistra=(-1,1) e baseDestra=(1,0) sono entrambe adiacenti al
// vertice=(0,0) ma NON adiacenti tra loro. cubeIndex indica su quale
// dei 3 argomenti (a, b, top) va il cubo — non è sempre il vertice.
export function triangle(a, b, top, cubeIndex) {
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

// Grappolo compatto: 3 caselle TUTTE reciprocamente adiacenti tra loro
// (a differenza di triangle(), dove le due basi non si toccano).
export function cluster(a, b, c, cubeIndex) {
  const positions = [
    { dq: 0, dr: 0 },
    { dq: 1, dr: 0 },
    { dq: 1, dr: -1 }
  ]
  return [a, b, c].map((el, i) => {
    const s = spec(el)
    const out = { ...positions[i], ...s }
    if (i === cubeIndex) out.cube = true
    return out
  })
}

// Coppia di 2 caselle adiacenti, cubo sempre sulla seconda.
export function pair(colorA, colorB, { heightA, heightB } = {}) {
  return [
    { dq: 0, dr: 0, color: colorA, height: heightA },
    { dq: 1, dr: 0, color: colorB, height: heightB, cube: true }
  ]
}

// Diamante a 4 caselle: sinistra, destra, sopra (vertice), sotto —
// stessa geometria usata per Bombi/Procioni tra le carte Animale, qui
// esposta come helper riusabile per Farfalla (Spirito della Natura),
// che ha 2 caselle laterali (sinistra/destra) + 2 in verticale
// (sopra/sotto) con lo stesso ancoraggio centrale.
export function diamond(left, right, top, bottom, cubeIndex) {
  const positions = [
    { dq: -1, dr: 1 }, // sinistra
    { dq: 1, dr: 0 }, // destra
    { dq: 0, dr: 0 }, // sopra (vertice)
    { dq: 0, dr: 1 } // sotto
  ]
  return [left, right, top, bottom].map((c, i) => {
    const s = spec(c)
    const out = { ...positions[i], ...s }
    if (i === cubeIndex) out.cube = true
    return out
  })
}
