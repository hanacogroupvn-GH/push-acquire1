import { createContext, useCallback, useContext, useReducer, useState } from 'react'
import { gameReducer } from './gameReducer.js'

const GameStateContext = createContext(null)
const GameDispatchContext = createContext(null)
const CanUndoContext = createContext(false)

// Actions that lock in the current turn -- once one of these happens, the
// pre-placement snapshot is no longer safe/relevant to rewind to.
const TURN_LOCKING_ACTIONS = new Set(['END_TURN', 'DECLARE_GAME_END', 'START_GAME'])

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, null)
  const [snapshot, setSnapshot] = useState(null)

  const wrappedDispatch = useCallback(
    (action) => {
      if (action.type === 'UNDO_PLACEMENT') {
        if (snapshot) {
          dispatch({ type: 'RESTORE_STATE', state: snapshot })
          setSnapshot(null)
        }
        return
      }
      if (action.type === 'PLACE_TILE') {
        setSnapshot(state) // remember exactly where we were right before this placement
      } else if (TURN_LOCKING_ACTIONS.has(action.type)) {
        setSnapshot(null)
      }
      dispatch(action)
    },
    [state, snapshot],
  )

  // Only offer the escape hatch while it was a human who placed the tile,
  // and only until the turn is locked in (END_TURN/DECLARE_GAME_END/new game).
  const canUndo = !!snapshot && !!state && !state.players[state.currentPlayerIndex]?.isAI

  return (
    <GameStateContext.Provider value={state}>
      <GameDispatchContext.Provider value={wrappedDispatch}>
        <CanUndoContext.Provider value={canUndo}>{children}</CanUndoContext.Provider>
      </GameDispatchContext.Provider>
    </GameStateContext.Provider>
  )
}

export function useGameState() {
  return useContext(GameStateContext)
}

export function useGameDispatch() {
  return useContext(GameDispatchContext)
}

export function useCanUndoPlacement() {
  return useContext(CanUndoContext)
}
