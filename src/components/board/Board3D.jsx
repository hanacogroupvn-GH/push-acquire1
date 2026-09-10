import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TileSlot from './TileSlot'
import PlayerSeats from './PlayerSeats'
import { useGameState, useGameDispatch } from '../../game/GameContext'
import { currentPlayer, actorForPhase, isTileDead } from '../../game/gameReducer'
import {
  ROWS,
  COLS,
  CELL_SIZE,
  CELL_GAP,
  FRAME_MARGIN,
  BASE_HEIGHT,
  BOARD_WIDTH,
  BOARD_DEPTH,
  cellLabel,
} from './constants'

const HIGHLIGHT_DURATION_MS = 2500

// Tracks the most recently placed tile (from the newest log entry that
// carries a tileId) so the board can flash a highlight ring on it -- makes
// a fast AI turn (or the player's own move) easy to spot.
function useLastPlacedTile(state) {
  const [highlightedTileId, setHighlightedTileId] = useState(null)
  const seenLength = useRef(0)

  useEffect(() => {
    if (state.log.length <= seenLength.current) {
      seenLength.current = state.log.length
      return undefined
    }
    seenLength.current = state.log.length
    const last = state.log[state.log.length - 1]
    if (!last?.tileId) return undefined

    setHighlightedTileId(last.tileId)
    const timer = setTimeout(() => setHighlightedTileId(null), HIGHLIGHT_DURATION_MS)
    return () => clearTimeout(timer)
  }, [state.log])

  return highlightedTileId
}

// Renders the dark wooden base/frame plus the 9x12 grid of interactive cells.
// Reads board/turn state from the game context and dispatches PLACE_TILE.
export default function Board3D() {
  const state = useGameState()
  const dispatch = useGameDispatch()
  const highlightedTileId = useLastPlacedTile(state)

  const player = currentPlayer(state)

  const placeableSet = useMemo(() => {
    if (state.phase !== 'place-tile') return new Set()
    return new Set(player.tiles.filter((t) => !isTileDead(state, t)))
  }, [state, player])

  const handleSelect = useCallback(
    (tileId) => {
      dispatch({ type: 'PLACE_TILE', tileId })
    },
    [dispatch],
  )

  const cells = useMemo(() => {
    const list = []
    COLS.forEach((col, colIndex) => {
      ROWS.forEach((row, rowIndex) => {
        const id = cellLabel(col, row)
        const x = colIndex * (CELL_SIZE + CELL_GAP) - BOARD_WIDTH / 2 + CELL_SIZE / 2
        const z = rowIndex * (CELL_SIZE + CELL_GAP) - BOARD_DEPTH / 2 + CELL_SIZE / 2
        list.push({ id, label: id, position: [x, 0, z] })
      })
    })
    return list
  }, [])

  return (
    <group>
      <mesh position={[0, -BASE_HEIGHT / 2, 0]} receiveShadow castShadow>
        <boxGeometry
          args={[BOARD_WIDTH + FRAME_MARGIN * 2, BASE_HEIGHT, BOARD_DEPTH + FRAME_MARGIN * 2]}
        />
        <meshStandardMaterial color="#3c2a1c" roughness={0.65} metalness={0.05} />
      </mesh>

      {cells.map((cell) => (
        <TileSlot
          key={cell.id}
          id={cell.id}
          label={cell.label}
          position={cell.position}
          occupant={state.board[cell.id]}
          placeable={placeableSet.has(cell.id)}
          highlighted={cell.id === highlightedTileId}
          onSelect={handleSelect}
        />
      ))}

      <PlayerSeats players={state.players} currentPlayerId={actorForPhase(state)?.id ?? player.id} />
    </group>
  )
}
