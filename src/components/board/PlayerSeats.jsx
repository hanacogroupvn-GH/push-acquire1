import { useMemo } from 'react'
import { Text, Edges } from '@react-three/drei'
import { BOARD_WIDTH, BOARD_DEPTH, FRAME_MARGIN, SEAT_MARGIN } from './constants'

const PLATE_WIDTH = 3.8
const PLATE_DEPTH = 1.05
const PLATE_HEIGHT = 0.1
const PLATE_COLOR = '#2a2a30'
const PLATE_COLOR_CURRENT = '#4a3c14'
const EDGE_COLOR = '#57575f'
const EDGE_COLOR_CURRENT = '#d4af37'
const TEXT_COLOR = '#e8e6df'
const SUB_TEXT_COLOR = '#9a978c'

// Walks the rectangle's perimeter starting at the middle of the north edge
// (negative-Z side) and moving clockwise, so seat order visually matches
// turn order: player 0 sits at the "top", and reading clockwise around the
// table tells you who plays after whom.
function perimeterPoint(fraction, halfW, halfD) {
  const topLen = halfW * 2
  const rightLen = halfD * 2
  const bottomLen = halfW * 2
  const leftLen = halfD * 2
  const total = topLen + rightLen + bottomLen + leftLen
  let d = (fraction * total + topLen / 2) % total

  if (d < topLen) return [-halfW + d, -halfD]
  d -= topLen
  if (d < rightLen) return [halfW, -halfD + d]
  d -= rightLen
  if (d < bottomLen) return [halfW - d, halfD]
  d -= bottomLen
  return [-halfW, halfD - d]
}

// One flat name plaque per player, arranged clockwise around the board in
// turn order (see perimeterPoint) -- lets you see at a glance who plays
// right before and right after you, and whose turn it currently is.
export default function PlayerSeats({ players, currentPlayerId }) {
  const halfW = BOARD_WIDTH / 2 + FRAME_MARGIN + SEAT_MARGIN
  const halfD = BOARD_DEPTH / 2 + FRAME_MARGIN + SEAT_MARGIN

  const seats = useMemo(
    () =>
      players.map((p, i) => {
        const [x, z] = perimeterPoint(i / players.length, halfW, halfD)
        return { player: p, position: [x, 0, z] }
      }),
    [players, halfW, halfD],
  )

  return (
    <group>
      {seats.map(({ player, position }) => {
        const isCurrent = player.id === currentPlayerId
        return (
          <group key={player.id} position={position}>
            <mesh position={[0, PLATE_HEIGHT / 2, 0]}>
              <boxGeometry args={[PLATE_WIDTH, PLATE_HEIGHT, PLATE_DEPTH]} />
              <meshStandardMaterial
                color={isCurrent ? PLATE_COLOR_CURRENT : PLATE_COLOR}
                roughness={0.7}
                emissive={isCurrent ? EDGE_COLOR_CURRENT : '#000000'}
                emissiveIntensity={isCurrent ? 0.18 : 0}
              />
              <Edges color={isCurrent ? EDGE_COLOR_CURRENT : EDGE_COLOR} linewidth={isCurrent ? 2 : 1} />
            </mesh>
            <Text
              position={[0, PLATE_HEIGHT + 0.01, -0.16]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.36}
              color={TEXT_COLOR}
              anchorX="center"
              anchorY="middle"
              maxWidth={PLATE_WIDTH - 0.3}
              renderOrder={1}
            >
              {player.name}
            </Text>
            <Text
              position={[0, PLATE_HEIGHT + 0.01, 0.27]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.22}
              color={isCurrent ? EDGE_COLOR_CURRENT : SUB_TEXT_COLOR}
              anchorX="center"
              anchorY="middle"
              renderOrder={1}
            >
              {isCurrent ? 'ĐANG ĐI' : player.isAI ? 'Máy' : 'Người'}
            </Text>
          </group>
        )
      })}
    </group>
  )
}
