const DISC_HEX = {
  grey: '#9CA3AF',
  blue: '#60A5FA',
  brown: '#92400E',
  green: '#16A34A',
  yellow: '#FACC15',
  red: '#DC2626',
  // Pseudo-colore per la base di un Edificio: il regolamento (pag. 8)
  // permette marrone, grigio O rosso indifferentemente, quindi non
  // possiamo disegnare un colore specifico — usiamo un tono neutro.
  base: '#D9D2C3'
}

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

function CellStack({ cx, cy, stack, hasCube }) {
  const barW = 14
  const barH = 6
  const gap = 1
  const totalH = stack.length * barH + (stack.length - 1) * gap
  const bottomY = cy + totalH / 2 - barH

  return (
    <>
      {stack.map((color, i) => {
        const y = bottomY - i * (barH + gap)

        // La base di un Edificio non è un colore singolo: il regolamento
        // permette marrone, grigio O rosso indifferentemente. Invece di
        // un colore ambiguo, mostriamo le 3 opzioni reali affiancate.
        if (color === 'base') {
          const chipW = barW / 3
          return (
            <g key={i}>
              {['brown', 'grey', 'red'].map((opt, j) => (
                <rect
                  key={opt}
                  x={cx - barW / 2 + j * chipW}
                  y={y}
                  width={chipW}
                  height={barH}
                  fill={DISC_HEX[opt]}
                  stroke="rgba(255,255,255,0.6)"
                  strokeWidth={0.5}
                />
              ))}
              <rect
                x={cx - barW / 2}
                y={y}
                width={barW}
                height={barH}
                rx={1.5}
                fill="none"
                stroke="rgba(0,0,0,0.25)"
                strokeWidth={0.5}
              />
            </g>
          )
        }

        return (
          <rect
            key={i}
            x={cx - barW / 2}
            y={y}
            width={barW}
            height={barH}
            rx={1.5}
            fill={DISC_HEX[color]}
            stroke="rgba(0,0,0,0.25)"
            strokeWidth={0.5}
          />
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
