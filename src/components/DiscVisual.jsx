// Stile grafico condiviso dei dischi: un unico posto per colori e resa
// 3D, riusato da HexBoard (plancia), CentralDiscPile (plancia centrale)
// e HabitatIcon (pattern sulle carte Animale) — così restano coerenti
// senza duplicare la logica in tre file diversi.

export const DISC_HEX = {
  grey: '#9CA3AF',
  blue: '#60A5FA',
  brown: '#92400E',
  green: '#16A34A',
  yellow: '#FACC15',
  red: '#DC2626'
}

// Contorno condiviso: usato per tutti i dischi E per il cubo Animale
// sulla plancia, così restano visivamente coerenti.
export const DISC_STROKE = 'rgba(0,0,0,0.4)'
export const DISC_STROKE_WIDTH = 0.6

// Interpola un colore verso il bianco in proporzione (non in modo
// additivo): così un colore già chiaro come il grigio non sfonda verso
// il bianco quando lo si schiarisce per la faccia superiore.
export function lighten(hex, ratio) {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = (num >> 16) & 0xff
  const g = (num >> 8) & 0xff
  const b = num & 0xff
  const nr = Math.round(r + (255 - r) * ratio)
  const ng = Math.round(g + (255 - g) * ratio)
  const nb = Math.round(b + (255 - b) * ratio)
  return `rgb(${nr},${ng},${nb})`
}

// Un singolo disco cilindrico: faccia superiore ellittica lucida,
// fianco dritto, bordo inferiore dello stesso colore del fianco.
// (cx, capY) è il centro della faccia superiore.
export function DiscCylinder({ cx, capY, color, fill, discW, capRy, sideH }) {
  const base = fill ?? DISC_HEX[color]
  const light = lighten(base, 0.28)
  const bodyBottomY = capY + sideH

  return (
    <g>
      <ellipse cx={cx} cy={bodyBottomY} rx={discW / 2} ry={capRy} fill={base} stroke={DISC_STROKE} strokeWidth={DISC_STROKE_WIDTH} />
      <rect x={cx - discW / 2} y={capY} width={discW} height={sideH} fill={base} />
      <line x1={cx - discW / 2} y1={capY} x2={cx - discW / 2} y2={bodyBottomY} stroke={DISC_STROKE} strokeWidth={DISC_STROKE_WIDTH} />
      <line x1={cx + discW / 2} y1={capY} x2={cx + discW / 2} y2={bodyBottomY} stroke={DISC_STROKE} strokeWidth={DISC_STROKE_WIDTH} />
      <ellipse cx={cx} cy={capY} rx={discW / 2} ry={capRy} fill={light} stroke={DISC_STROKE} strokeWidth={DISC_STROKE_WIDTH} />
    </g>
  )
}

// Y del centro della faccia superiore del disco più in alto in una
// pila di n dischi centrata su cy — serve per posizionare il cubo
// Animale sopra l'ultimo disco posato, invece che in un angolo fisso.
export function stackTopCapY(cy, n, capRy, sideH, advance) {
  if (n === 0) return cy
  const totalH = (n - 1) * advance + sideH + capRy * 2
  return cy - totalH / 2 + capRy
}

// Pila di dischi (dal basso in alto), parzialmente sovrapposti come nel
// gioco fisico. discs[0] è il primo posato (in basso), l'ultimo elemento
// è il più recente (in cima). (cx, cy) è il centro dell'intera pila.
export function DiscStackVisual({ cx, cy, discs, discW = 24, capRy = 5, sideH = 7, advance = 8 }) {
  if (!discs || discs.length === 0) return null
  const n = discs.length
  const topCapY = stackTopCapY(cy, n, capRy, sideH, advance)

  return (
    <>
      {discs.map((color, i) => {
        const capY = topCapY + (n - 1 - i) * advance
        return <DiscCylinder key={i} cx={cx} capY={capY} color={color} discW={discW} capRy={capRy} sideH={sideH} />
      })}
    </>
  )
}

// Disco singolo isolato (non impilato), in un piccolo SVG autonomo con
// l'ingombro già calcolato — stesse proporzioni dei dischi sulla
// plancia (discW:capRy:sideH), solo in scala. Utile per file di dischi
// affiancati, come quelli "in mano" da piazzare.
export function SingleDiscIcon({ color, size = 26 }) {
  const discW = size
  const capRy = size * 0.208
  const sideH = size * 0.29
  const width = discW + 6
  const height = sideH + capRy * 2 + 4

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <DiscCylinder cx={width / 2} capY={capRy + 2} color={color} discW={discW} capRy={capRy} sideH={sideH} />
    </svg>
  )
}
