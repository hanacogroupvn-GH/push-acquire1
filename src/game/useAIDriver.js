import { useEffect, useRef } from 'react'
import { useGameState, useGameDispatch } from './GameContext.jsx'
import { actorForPhase } from './gameReducer.js'
import { decideAIAction } from './ai.js'

const AI_MOVE_DELAY_MS = 1200

// Watches game state; whenever it's an AI player's turn to act (placing a
// tile, resolving a founding/merger, buying stock...), computes their move
// and dispatches it after a short delay. Re-fires on every state change, so
// a multi-step AI turn plays out as a chain of independent single-step
// decisions rather than one big plan.
export function useAIDriver() {
  const state = useGameState()
  const dispatch = useGameDispatch()
  const timerRef = useRef(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!state || state.phase === 'game-over') return undefined

    const actor = actorForPhase(state)
    if (!actor?.isAI) return undefined

    timerRef.current = setTimeout(() => {
      const action = decideAIAction(state, actor.id)
      if (action) dispatch(action)
    }, AI_MOVE_DELAY_MS)

    return () => clearTimeout(timerRef.current)
  }, [state, dispatch])
}
