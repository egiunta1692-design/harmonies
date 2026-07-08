import { DISC_HEX, lighten, DiscCylinder } from './DiscVisual'

export const CUBE_COLOR = '#F59E0B' // ambra, distinto dal rosso dei dischi

const SIZE = 15

function axialToPixel(q, r) {
  const x = SIZE * (1.5 * q)
  const y = SIZE * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r)
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

// Converte una specifica di cella ({color, height}) nella pila di colori
// che rappresenta, dal basso in alto — stessa logica del motore
// (game-engine/habitat.js): un Albero verde di altezza H sta su H-1
// dischi marroni, una Montagna grigia di altezza H è tutta grigia, un
// Edificio rosso sta SEMPRE su una base (colore non specificato dalla
// carta: marrone, grigio o rosso), gli altri colori sono sempre un
// disco singolo.
function stackForSpec(spec) {
  if (spec.color === 'red') {
    // Edificio: rosso in cima a un'altezza H (default 2 se non specificata).
    // I livelli sotto sono sempre "base ambigua" (marrone/grigio/rosso),
    // MAI un colore certo — vedi CellStack più sotto.
    const h = spec.height ?? 2
    return [...Array(h - 1).fill('base'), 'red']
  }
  if (spec.color === 'green') {
    const h = spec.height ?? 1
    return [...Array(h - 1).fill('brown'), 'green']
  }
  if (spec.color === 'grey') {
    const h = spec.height ?? 1
    return Array(h).fill('grey')
  }
  return [spec.color]
}

const DISC_W = 16
const CAP_RY = 3.2
const SIDE_H = 4.5
const ADVANCE = 5

let clipIdCounter = 0

// La base ambigua di un Edificio non è un colore singolo: il regolamento
// permette marrone, grigio O rosso indifferentemente. Invece di
// inventare un colore, la mostriamo come un unico cilindro diviso in 3
// fasce verticali (marrone/grigio/rosso) — stessa taglia e stile degli
// altri dischi della pila, non 3 cilindri separati più piccoli.
function BaseOptionsCylinder({ cx, capY, discW, capRy, sideH }) {
  const bandColors = ['brown', 'grey', 'red']
  const bandW = discW / 3
  const bodyBottomY = capY + sideH
  const idRef = (clipIdCounter++).toString()
  const clipTopId = `base-clip-top-${idRef}`
  const clipBottomId = `base-clip-bottom-${idRef}`

  return (
    <g>
      <defs>
        <clipPath id={clipBottomId}>
          <ellipse cx={cx} cy={bodyBottomY} rx={discW / 2} ry={capRy} />
        </clipPath>
        <clipPath id={clipTopId}>
          <ellipse cx={cx} cy={capY} rx={discW / 2} ry={capRy} />
        </clipPath>
      </defs>

      {/* bordo inferiore, diviso in 3 fasce */}
      <g clipPath={`url(#${clipBottomId})`}>
        {bandColors.map((c, i) => (
          <rect key={c} x={cx - discW / 2 + i * bandW} y={bodyBottomY - capRy} width={bandW} height={capRy * 2} fill={DISC_HEX[c]} />
        ))}
      </g>

      {/* fianco, diviso in 3 fasce, con contorno */}
      {bandColors.map((c, i) => (
        <rect
          key={c}
          x={cx - discW / 2 + i * bandW}
          y={capY}
          width={bandW}
          height={sideH}
          fill={DISC_HEX[c]}
          stroke="rgba(0,0,0,0.25)"
          strokeWidth={0.5}
        />
      ))}

      {/* faccia superiore, divisa in 3 fasce lucide, con contorno sull'intera ellisse */}
      <g clipPath={`url(#${clipTopId})`}>
        {bandColors.map((c, i) => (
          <rect key={c} x={cx - discW / 2 + i * bandW} y={capY - capRy} width={bandW} height={capRy * 2} fill={lighten(DISC_HEX[c], 0.28)} />
        ))}
      </g>
      <ellipse cx={cx} cy={capY} rx={discW / 2} ry={capRy} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth={0.5} />
    </g>
  )
}

function CellStack({ cx, cy, stack, hasCube }) {
  const n = stack.length
  const totalH = (n - 1) * ADVANCE + SIDE_H + CAP_RY * 2
  const topCapY = cy - totalH / 2 + CAP_RY

  return (
    <>
      {stack.map((color, i) => {
        const capY = topCapY + (n - 1 - i) * ADVANCE
        return color === 'base' ? (
          <BaseOptionsCylinder key={i} cx={cx} capY={capY} discW={DISC_W} capRy={CAP_RY} sideH={SIDE_H} />
        ) : (
          <DiscCylinder key={i} cx={cx} capY={capY} color={color} discW={DISC_W} capRy={CAP_RY} sideH={SIDE_H} />
        )
      })}
      {hasCube && (
        <circle cx={cx + SIZE * 0.5} cy={cy - SIZE * 0.5} r={4} fill={CUBE_COLOR} stroke="#fff" strokeWidth={1} />
      )}
    </>
  )
}

// habitat: array di { dq, dr, color, height?, cube? }, formato di
// game-engine/animalCards.js.
export default function HabitatIcon({ habitat }) {
  if (!habitat) {
    return <div style={{ fontSize: 10, color: '#c00', width: 70 }}>pattern non disponibile</div>
  }

  const positions = habitat.map((c) => ({ ...c, ...axialToPixel(c.dq, c.dr) }))
  const minX = Math.min(...positions.map((p) => p.x)) - SIZE
  const maxX = Math.max(...positions.map((p) => p.x)) + SIZE
  const minY = Math.min(...positions.map((p) => p.y)) - SIZE * 1.6
  const maxY = Math.max(...positions.map((p) => p.y)) + SIZE

  return (
    <div>
      <svg
        viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
        style={{ width: 80, height: 60, display: 'block' }}
      >
        {positions.map((p, i) => (
          <g key={i}>
            <polygon points={hexPoints(p.x, p.y, SIZE - 1)} fill="#f1efe8" stroke="rgba(0,0,0,0.15)" strokeWidth={0.5} />
            <CellStack cx={p.x} cy={p.y} stack={stackForSpec(p)} hasCube={p.cube} />
          </g>
        ))}
      </svg>
    </div>
  )
}
