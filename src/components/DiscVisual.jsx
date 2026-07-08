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
      <ellipse cx={cx} cy={bodyBottomY} rx={discW / 2} ry={capRy} fill={base} />
      <rect x={cx - discW / 2} y={capY} width={discW} height={sideH} fill={base} />
      <ellipse cx={cx} cy={capY} rx={discW / 2} ry={capRy} fill={light} stroke="rgba(0,0,0,0.25)" strokeWidth={0.5} />
    </g>
  )
}

// Pila di dischi (dal basso in alto), parzialmente sovrapposti come nel
// gioco fisico. discs[0] è il primo posato (in basso), l'ultimo elemento
// è il più recente (in cima). (cx, cy) è il centro dell'intera pila.
export function DiscStackVisual({ cx, cy, discs, discW = 24, capRy = 5, sideH = 7, advance = 8 }) {
  if (!discs || discs.length === 0) return null
  const n = discs.length
  const totalH = (n - 1) * advance + sideH + capRy * 2
  const topCapY = cy - totalH / 2 + capRy

  return (
    <>
      {discs.map((color, i) => {
        const capY = topCapY + (n - 1 - i) * advance
        return <DiscCylinder key={i} cx={cx} capY={capY} color={color} discW={discW} capRy={capRy} sideH={sideH} />
      })}
    </>
  )
}
