import { currentPlayer } from '../../game/gameReducer.js'
import { CHAINS_BY_ID } from '../../game/constants.js'
import AIThinking from './AIThinking.jsx'
import './Modal.css'

export default function MergerSurvivorModal({ state, dispatch }) {
  const player = currentPlayer(state)
  const { candidates, chainSizesAtMerger } = state.pendingMerger

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h2>Hai chuỗi bằng kích thước lớn nhất</h2>
        <p className="modal-subtitle">
          {player.name}, các chuỗi sau đang hòa về kích thước lớn nhất trong vụ sáp nhập này. Chọn chuỗi
          sẽ sống sót (các chuỗi còn lại sẽ bị sáp nhập vào chuỗi này):
        </p>
        {player.isAI ? (
          <AIThinking name={player.name} />
        ) : (
          <div className="chain-choice-grid">
            {candidates.map((chainId) => {
              const meta = CHAINS_BY_ID[chainId]
              return (
                <button
                  key={chainId}
                  className="chain-choice-btn"
                  style={{ '--chip-color': meta.color }}
                  onClick={() => dispatch({ type: 'CHOOSE_MERGER_SURVIVOR', chainId })}
                >
                  <i />
                  {meta.name} ({chainSizesAtMerger[chainId]} ô)
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
