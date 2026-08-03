import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { getNatureSpiritCard } from '../game-engine'
import { lighten, DISC_HEX } from './DiscVisual'

// Stessa formula di conversione assiale->pixel di HexBoard.jsx (2D),
// qui riusata per posizionare le celle sul piano orizzontale (X,Z) —
// così la disposizione della plancia è IDENTICA a quella 2D, cambia
// solo la resa (mesh invece di SVG). Y è l'altezza (impilamento).
const HEX_SIZE = 1
function axialToWorld(q, r) {
  const x = HEX_SIZE * 1.5 * q
  const z = HEX_SIZE * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r)
  return [x, z]
}

// Proporzioni riprese dalla versione 2D (discW:sideH ≈ 24:7 ≈ 3.4:1,
// diametro:spessore) — già corrette, invariate.
const DISC_RADIUS = HEX_SIZE * 0.5
const DISC_HEIGHT = 0.38
const TILE_THICKNESS = 0.1
// Cubi Animale/Spirito della Natura: davvero cubici (stesso lato su
// tutte e 3 le dimensioni), leggermente più piccoli di prima.
const CUBE_SIZE = 0.35
// Stessi colori del 2D (DISC_HEX), tranne il grigio: nella resa 3D
// risultava troppo scuro/spento, qui schiarito appositamente.
const DISC_COLORS_3D = { ...DISC_HEX, grey: '#b5b7ba' }

function HexTile({ x, z, highlighted, onClick }) {
  return (
    <mesh position={[x, 0, z]} rotation={[0, Math.PI / 2, 0]} onClick={onClick} receiveShadow>
      <cylinderGeometry args={[HEX_SIZE * 0.94, HEX_SIZE * 0.94, TILE_THICKNESS, 6]} />
      <meshStandardMaterial color={highlighted ? '#f3ce5e' : '#ffe7c2'} roughness={0.55} />
    </mesh>
  )
}

function Disc({ x, z, color, index }) {
  const y = TILE_THICKNESS / 2 + DISC_HEIGHT * index + DISC_HEIGHT / 2
  const base = DISC_COLORS_3D[color] ?? '#999'
  const top = lighten(base, 0.02)
  return (
    <mesh position={[x, y, z]} castShadow>
      <cylinderGeometry args={[DISC_RADIUS, DISC_RADIUS, DISC_HEIGHT * 0.9, 28]} />
      {/* CylinderGeometry ha 3 gruppi di materiale: 0=lato, 1=cima, 2=fondo */}
      <meshStandardMaterial attach="material-0" color={base} roughness={0.55} />
      <meshStandardMaterial attach="material-1" color={top} roughness={0.55} />
      <meshStandardMaterial attach="material-2" color={base} roughness={0.55} />
    </mesh>
  )
}

function CubeMarker({ x, z, stackHeight, isNatureSpirit }) {
  const y = TILE_THICKNESS / 2 + DISC_HEIGHT * stackHeight + CUBE_SIZE / 2
  return (
    <mesh position={[x, y, z]} castShadow>
      <boxGeometry args={[CUBE_SIZE, CUBE_SIZE, CUBE_SIZE]} />
      <meshStandardMaterial color={isNatureSpirit ? '#ffffff' : '#F59E0B'} roughness={0.5} />
    </mesh>
  )
}

// Stesse props di HexBoard.jsx (2D) — sostituibile 1:1 nello stesso punto.
export default function HexBoard3D({
  boardState,
  onCellClick,
  highlightable = false,
  highlightCells = [],
  compact = false,
  maxHeightVh = compact ? 30 : 55
}) {
  if (!boardState?.cells) return <p style={{ color: '#888' }}>Plancia non ancora pronta...</p>

  const cells = useMemo(
    () =>
      Object.entries(boardState.cells).map(([k, cell]) => {
        const [q, r] = k.split(',').map(Number)
        const [x, z] = axialToWorld(q, r)
        return { q, r, cell, x, z }
      }),
    [boardState]
  )

  const highlightSet = useMemo(() => new Set(highlightCells.map(({ q, r }) => `${q},${r}`)), [highlightCells])

  // Centro approssimativo della plancia, per puntare la telecamera lì
  // invece che all'origine (che altrimenti sarebbe nell'angolo).
  const cx = cells.reduce((s, c) => s + c.x, 0) / (cells.length || 1)
  const cz = cells.reduce((s, c) => s + c.z, 0) / (cells.length || 1)

  return (
    <div style={{ height: `${maxHeightVh}vh`, width: '100%', overflow: 'hidden' }}>
      <Canvas shadows flat camera={{ position: [cx, 9, cz + 7], fov: 42 }} gl={{ alpha: true }} style={{ background: 'transparent' }}>
        <ambientLight intensity={1.1} />
        <directionalLight position={[cx + 6, 12, cz + 4]} intensity={1.2} castShadow />
        <OrbitControls
          target={[cx, 0, cz]}
          enablePan={false}
          minDistance={4}
          maxDistance={22}
          maxPolarAngle={Math.PI / 2.15}
        />
        {cells.map(({ q, r, cell, x, z }) => (
          <group key={`${q},${r}`}>
            <HexTile
              x={x}
              z={z}
              highlighted={highlightable && highlightSet.has(`${q},${r}`)}
              onClick={() => onCellClick?.(q, r)}
            />
            {cell.discs.map((color, i) => (
              <Disc key={i} x={x} z={z} color={color} index={i} />
            ))}
            {cell.animalCube && (
              <CubeMarker
                x={x}
                z={z}
                stackHeight={cell.discs.length}
                isNatureSpirit={!!getNatureSpiritCard(cell.animalCube.cardId)}
              />
            )}
          </group>
        ))}
      </Canvas>
    </div>
  )
}
