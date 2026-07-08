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

// Schiarisce (percent positivo) o scurisce (percent negativo) un colore
// esadecimale — serve per dare al disco un corpo in ombra e una faccia
// superiore lucida, senza dover definire manualmente due tinte per colore.
function shade(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16)
  const clamp = (v) => Math.max(0, Math.min(255, v))
  const r = clamp((num >> 16) + Math.round(255 * percent))
  const g = clamp(((num >> 8) & 0xff) + Math.round(255 * percent))
  const b = clamp((num & 0xff) + Math.round(255 * percent))
  return `rgb(${r},${g},${b})`
}

// Disegna la pila di dischi di una casella come piccoli dischi 3D
// impilati: ognuno ha un corpo cilindrico (colore scurito) e una faccia
// superiore ellittica lucida (colore schiarito), stesso colore del
// disco reale. Il disco più in basso è discs[0] (il primo posato),
// quello più in alto è l'ultimo — riproduce ordine e tipo, non solo il
// colore in cima.
function DiscStack({ cx, cy, discs, scale = 1 }) {
  if (discs.length === 0) return null
  const discW = 22 * scale
  const discH = 11 * scale
  const capH = discH * 0.6
  const gap = 2 * scale
  const totalH = discs.length * discH + (discs.length - 1) * gap
  const bottomY = cy + totalH / 2 - discH

  return (
    <>
      {discs.map((color, i) => {
        const y = bottomY - i * (discH + gap)
        const base = DISC_HEX[color]
        const light = shade(base, 0.32)
        const dark = shade(base, -0.18)
        const bodyH = discH - capH * 0.4
        return (
          <g key={i}>
            <rect
              x={cx - discW / 2}
              y={y + capH * 0.4}
              width={discW}
              height={bodyH}
              rx={bodyH / 2}
              fill={dark}
              stroke="rgba(0,0,0,0.2)"
              strokeWidth={0.4}
            />
            <ellipse
              cx={cx}
              cy={y + capH / 2}
              rx={discW / 2}
              ry={capH / 2}
              fill={light}
              stroke="rgba(0,0,0,0.2)"
              strokeWidth={0.4}
            />
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
