import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { getNatureSpiritCard } from '../game-engine'

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

const DISC_COLORS = {
  brown: '#8b5a2b',
  blue: '#3b82f6',
  green: '#16a34a',
  grey: '#9ca3af',
  red: '#dc2626',
  yellow: '#eab308'
}
const DISC_HEIGHT = 0.16
const DISC_RADIUS = HEX_SIZE * 0.72
const TILE_THICKNESS = 0.06

function HexTile({ x, z, highlighted, onClick }) {
  return (
    <mesh position={[x, 0, z]} rotation={[0, Math.PI / 2, 0]} onClick={onClick} receiveShadow>
      <cylinderGeometry args={[HEX_SIZE * 0.94, HEX_SIZE * 0.94, TILE_THICKNESS, 6]} />
      <meshStandardMaterial color={highlighted ? '#fff3c4' : '#f1efe8'} />
    </mesh>
  )
}

function Disc({ x, z, color, index }) {
  const y = TILE_THICKNESS / 2 + DISC_HEIGHT * index + DISC_HEIGHT / 2
  return (
    <mesh position={[x, y, z]} castShadow>
      <cylinderGeometry args={[DISC_RADIUS, DISC_RADIUS, DISC_HEIGHT * 0.92, 28]} />
      <meshStandardMaterial color={DISC_COLORS[color] ?? '#999'} />
    </mesh>
  )
}

function CubeMarker({ x, z, stackHeight, isNatureSpirit }) {
  const y = TILE_THICKNESS / 2 + DISC_HEIGHT * stackHeight + 0.1
  return (
    <mesh position={[x, y, z]} castShadow>
      <boxGeometry args={[0.5, 0.2, 0.5]} />
      <meshStandardMaterial color={isNatureSpirit ? '#ffffff' : '#F59E0B'} />
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
    <div style={{ height: `${maxHeightVh}vh`, width: '100%', borderRadius: 12, overflow: 'hidden', background: '#dfe7d8' }}>
      <Canvas shadows camera={{ position: [cx, 9, cz + 7], fov: 42 }}>
        <ambientLight intensity={0.75} />
        <directionalLight position={[cx + 6, 12, cz + 4]} intensity={0.9} castShadow />
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
