import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, Edges } from '@react-three/drei'
import * as THREE from 'three'
import { CELL_SIZE, CELL_HEIGHT } from './constants'
import { CHAINS_BY_ID } from '../../game/constants'

const CELL_COLOR = '#e8e0cc'
const CELL_COLOR_PLACEABLE = '#f4edda'
const EDGE_COLOR = '#8c8168'
const EDGE_COLOR_HOVER = '#d4af37'
const TEXT_COLOR = '#5b5140'
const UNINCORPORATED_COLOR = '#f3f2ee'
const PENDING_MERGER_COLOR = '#8f8f97'

const TILE_MARGIN = 0.16
const TILE_HEIGHT = 0.16
const TILE_REST_Y = CELL_HEIGHT / 2 + TILE_HEIGHT / 2 + 0.02
const TILE_POP_DURATION = 0.25
const HIGHLIGHT_COLOR = '#ffd75e'

function tileColor(occupant) {
  if (occupant === 'unincorporated') return UNINCORPORATED_COLOR
  if (occupant === 'pending-merger') return PENDING_MERGER_COLOR
  return CHAINS_BY_ID[occupant]?.color ?? UNINCORPORATED_COLOR
}

// Pulsing golden ring that appears over a tile that was just placed, so a
// fast-playing AI (or a human's own move) is easy to spot on a 108-cell board.
function HighlightRing() {
  const ref = useRef(null)
  useFrame((state) => {
    if (!ref.current) return
    const pulse = 0.6 + 0.4 * Math.sin(state.clock.elapsedTime * 6)
    ref.current.scale.setScalar(1 + pulse * 0.18)
    ref.current.material.opacity = 0.35 + pulse * 0.35
  })
  return (
    <mesh ref={ref} position={[0, CELL_HEIGHT + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[CELL_SIZE * 0.42, CELL_SIZE * 0.62, 32]} />
      <meshBasicMaterial color={HIGHLIGHT_COLOR} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

// A single cell on the board: shows its coordinate label, highlights on
// hover when it's a legal move, and renders whatever tile occupies it
// (unincorporated, mid-merger, or belonging to a hotel chain).
export default function TileSlot({ id, label, position, occupant, placeable, highlighted, onSelect }) {
  const [hovered, setHovered] = useState(false)
  const tileRef = useRef(null)
  const placedAt = useRef(null)
  const prevOccupant = useRef(null)

  useEffect(() => {
    if (prevOccupant.current !== occupant) {
      if (!prevOccupant.current && occupant) placedAt.current = null // trigger pop-in animation
      prevOccupant.current = occupant
    }
  }, [occupant])

  useFrame((state) => {
    if (!occupant || !tileRef.current) return
    if (placedAt.current === null) placedAt.current = state.clock.elapsedTime

    const elapsed = state.clock.elapsedTime - placedAt.current
    const t = Math.min(elapsed / TILE_POP_DURATION, 1)
    const eased = 1 - Math.pow(1 - t, 3)

    tileRef.current.position.y = THREE.MathUtils.lerp(TILE_REST_Y + 0.7, TILE_REST_Y, eased)
    const scale = THREE.MathUtils.lerp(0.3, 1, eased)
    tileRef.current.scale.set(scale, scale, scale)
  })

  function handlePointerOver(event) {
    if (!placeable) return
    event.stopPropagation()
    setHovered(true)
    document.body.style.cursor = 'pointer'
  }

  function handlePointerOut(event) {
    if (!placeable && !hovered) return
    event.stopPropagation()
    setHovered(false)
    document.body.style.cursor = 'default'
  }

  function handleClick(event) {
    if (!placeable) return
    event.stopPropagation()
    onSelect(id)
  }

  return (
    <group position={position}>
      <mesh
        position={[0, CELL_HEIGHT / 2, 0]}
        receiveShadow
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <boxGeometry args={[CELL_SIZE, CELL_HEIGHT, CELL_SIZE]} />
        <meshStandardMaterial color={hovered ? CELL_COLOR_PLACEABLE : CELL_COLOR} roughness={0.85} />
        <Edges color={hovered ? EDGE_COLOR_HOVER : EDGE_COLOR} linewidth={hovered ? 2 : 1} />
      </mesh>

      <Text
        position={[0, CELL_HEIGHT + 0.006, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={CELL_SIZE * 0.26}
        color={TEXT_COLOR}
        anchorX="center"
        anchorY="middle"
        renderOrder={1}
      >
        {label}
      </Text>

      {occupant && (
        <mesh ref={tileRef} position={[0, TILE_REST_Y, 0]} castShadow receiveShadow>
          <boxGeometry args={[CELL_SIZE - TILE_MARGIN, TILE_HEIGHT, CELL_SIZE - TILE_MARGIN]} />
          <meshStandardMaterial color={tileColor(occupant)} roughness={0.35} metalness={0.1} />
        </mesh>
      )}

      {highlighted && <HighlightRing />}
    </group>
  )
}
