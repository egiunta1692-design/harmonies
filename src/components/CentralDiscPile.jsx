import { DiscStackVisual } from './DiscVisual'

// Mostra una pila di dischi (tipicamente i 3 di una casella della
// plancia centrale) con lo stesso stile cilindrico 3D della plancia
// giocatore, in un piccolo SVG autonomo con l'ingombro già calcolato.
export default function CentralDiscPile({ discs }) {
  const discW = 20
  const capRy = 4
  const sideH = 6
  const advance = 7

  const width = discW + 8
  const height = discs.length > 0 ? (discs.length - 1) * advance + sideH + capRy * 2 + 4 : discW

  if (discs.length === 0) {
    // Ingombro vuoto ma coerente, per non far "saltare" il layout
    // quando una casella si svuota temporaneamente.
    return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} />
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <DiscStackVisual
        cx={width / 2}
        cy={height / 2}
        discs={discs}
        discW={discW}
        capRy={capRy}
        sideH={sideH}
        advance={advance}
      />
    </svg>
  )
}
