import { useCanUndoPlacement, useGameDispatch } from '../../game/GameContext.jsx'
import './UndoButton.css'

export default function UndoButton() {
  const canUndo = useCanUndoPlacement()
  const dispatch = useGameDispatch()
  if (!canUndo) return null

  return (
    <button
      className="undo-btn"
      onClick={() => dispatch({ type: 'UNDO_PLACEMENT' })}
      title="Quay lại trạng thái trước khi đặt quân vừa rồi"
    >
      ↩ Hoàn tác đặt quân
    </button>
  )
}
