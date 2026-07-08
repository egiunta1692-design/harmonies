const DISC_HEX = {
  grey: '#9CA3AF',
  blue: '#60A5FA',
  brown: '#92400E',
  green: '#16A34A',
  yellow: '#FACC15',
  red: '#DC2626'
}

const HEX_SIZE = 32

// Conversione da coordinate assiali (q, r) a pixel, orientamento flat-top.
// Riferimento: https://www.redblobgames.com/grids/hexagons/
function axialToPixel(q, r, size = HEX_SIZE) {
  const x = size * (1.5 * q)
  const y = size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r)
  return { x, y }
}

function hexPoints(cx, cy, size) {
  const pts = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i)
    pts.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`)
  }
  return pts.join(' ')
}

// Interpola un colore verso il bianco o il nero in proporzione (non in
// modo additivo): così un colore già chiaro come il grigio non sfonda
// verso il bianco quando lo si schiarisce per la faccia superiore.
function mix(hex, target, ratio) {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = (num >> 16) & 0xff
  const g = (num >> 8) & 0xff
  const b = num & 0xff
  const nr = Math.round(r + (target[0] - r) * ratio)
  const ng = Math.round(g + (target[1] - g) * ratio)
  const nb = Math.round(b + (target[2] - b) * ratio)
  return `rgb(${nr},${ng},${nb})`
}
const lighten = (hex, ratio) => mix(hex, [255, 255, 255], ratio)
const darken = (hex, ratio) => mix(hex, [0, 0, 0], ratio)

// Disegna la pila di dischi di una casella come veri cilindri 3D
// impilati (faccia superiore ellittica lucida, fianco dritto, bordo
// inferiore in ombra), parzialmente sovrapposti l'uno sull'altro come
// nel gioco fisico. Il disco più in basso è discs[0] (il primo posato),
// quello più in alto è l'ultimo.
function DiscStack({ cx, cy, discs, scale = 1 }) {
  if (discs.length === 0) return null
  const discW = 24 * scale
  const capRy = 5 * scale // raggio verticale della faccia ellittica
  const sideH = 7 * scale // altezza del fianco cilindrico
  const advance = 8 * scale // avanzamento verticale tra un disco e il successivo (< sideH+capRy*2: crea la sovrapposizione)
  const n = discs.length
  const totalH = (n - 1) * advance + sideH + capRy * 2
  const topCapY = cy - totalH / 2 + capRy

  return (
    <>
      {discs.map((color, i) => {
        const capY = topCapY + (n - 1 - i) * advance
        const bodyBottomY = capY + sideH
        const base = DISC_HEX[color]
        const light = lighten(base, 0.28)
        const dark = darken(base, 0.28)

        return (
          <g key={i}>
            {/* bordo inferiore, in ombra */}
            <ellipse cx={cx} cy={bodyBottomY} rx={discW / 2} ry={capRy} fill={dark} />
            {/* fianco cilindrico */}
            <rect x={cx - discW / 2} y={capY} width={discW} height={sideH} fill={base} />
            {/* faccia superiore, lucida */}
            <ellipse cx={cx} cy={capY} rx={discW / 2} ry={capRy} fill={light} stroke="rgba(0,0,0,0.25)" strokeWidth={0.5} />
          </g>
        )
      })}
    </>
  )
}

// boardState: { side, cells: { "q,r": { discs: [...], animalCube } } }
// onCellClick(q, r): opzionale, chiamato al click su una casella
// highlightCells: opzionale, array di {q,r} da evidenziare (es. caselle
// dove è possibile piazzare il prossimo cubo Animale di una carta)
// compact: riduce le dimensioni, per mostrare le plance degli altri giocatori
// maxHeightVh: altezza massima in vh (viewport height), per garantire che
// la board non sfori mai lo schermo indipendentemente dalla risoluzione
export default function HexBoard({
  boardState,
  onCellClick,
  highlightable = false,
  highlightCells = [],
  compact = false,
  maxHeightVh = compact ? 30 : 55
}) {
  if (!boardState?.cells) return <p style={{ color: '#888' }}>Plancia non ancora pronta...</p>

  const size = compact ? HEX_SIZE * 0.8 : HEX_SIZE
  const cellKeys = Object.keys(boardState.cells)
  const positions = cellKeys.map((k) => {
    const [q, r] = k.split(',').map(Number)
    return { q, r, ...axialToPixel(q, r, size) }
  })
  const minX = Math.min(...positions.map((p) => p.x)) - size
  const maxX = Math.max(...positions.map((p) => p.x)) + size
  const minY = Math.min(...positions.map((p) => p.y)) - size
  const maxY = Math.max(...positions.map((p) => p.y)) + size
  const width = maxX - minX
  const height = maxY - minY
  const highlightSet = new Set(highlightCells.map(({ q, r }) => `${q},${r}`))

  return (
    <svg
      viewBox={`${minX} ${minY} ${width} ${height}`}
      style={{
        width: 'auto',
        height: 'auto',
        maxWidth: '100%',
        maxHeight: `${maxHeightVh}vh`,
        minWidth: compact ? 120 : 200,
        display: 'block',
        margin: '0 auto'
      }}
    >
      {positions.map(({ q, r, x, y }) => {
        const cell = boardState.cells[`${q},${r}`] ?? { discs: [], animalCube: null }
        const isHighlighted = highlightSet.has(`${q},${r}`)

        return (
          <g
            key={`${q},${r}`}
            onClick={() => onCellClick?.(q, r)}
            style={{ cursor: onCellClick ? 'pointer' : 'default' }}
          >
            <polygon
              points={hexPoints(x, y, size - 2)}
              fill={isHighlighted ? '#fff3c4' : '#f1efe8'}
              stroke={isHighlighted ? '#d97706' : highlightable ? '#333' : '#ccc'}
              strokeWidth={isHighlighted ? 2 : 1}
            />
            <DiscStack cx={x} cy={y} discs={cell.discs} scale={compact ? 0.8 : 1} />
            {cell.animalCube && (
              <circle
                cx={x + size * 0.55}
                cy={y - size * 0.55}
                r={compact ? 5 : 6}
                fill="#F59E0B"
                stroke="#fff"
                strokeWidth={1.5}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
