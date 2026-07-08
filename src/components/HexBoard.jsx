import { DiscStackVisual, stackTopCapY, DISC_STROKE_WIDTH } from './DiscVisual'

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
    <div style={{ maxHeight: `${maxHeightVh}vh`, overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
      <svg
        viewBox={`${minX} ${minY} ${width} ${height}`}
        style={{
          width: 'auto',
          height: 'auto',
          maxWidth: '100%',
          maxHeight: '100%',
          minWidth: compact ? 120 : 200,
          display: 'block'
        }}
      >
        {positions.map(({ q, r, x, y }) => {
          const cell = boardState.cells[`${q},${r}`] ?? { discs: [], animalCube: null }
          const isHighlighted = highlightSet.has(`${q},${r}`)
          const s = compact ? 0.8 : 1
          const discW = 24 * s
          const capRy = 5 * s
          const sideH = 7 * s
          const advance = 8 * s
          const cubeSize = 11 * 0.67 * s // ridotto di un terzo
          const topCapY = stackTopCapY(y, cell.discs.length, capRy, sideH, advance)

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
              <DiscStackVisual cx={x} cy={y} discs={cell.discs} discW={discW} capRy={capRy} sideH={sideH} advance={advance} />
              {cell.animalCube && (
                <rect
                  x={x - cubeSize / 2}
                  y={topCapY - cubeSize - capRy * 0.2}
                  width={cubeSize}
                  height={cubeSize}
                  fill="#F59E0B"
                  stroke="#fff"
                  strokeWidth={DISC_STROKE_WIDTH}
                />
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
