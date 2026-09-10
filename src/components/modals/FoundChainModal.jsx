import { availableChainIds, currentPlayer } from '../../game/gameReducer.js'
import { CHAINS_BY_ID } from '../../game/constants.js'
import AIThinking from './AIThinking.jsx'
import './Modal.css'

export default function FoundChainModal({ state, dispatch }) {
  const player = currentPlayer(state)
  const options = availableChainIds(state)

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h2>Thành lập chuỗi khách sạn mới</h2>
        <p className="modal-subtitle">
          {player.name}, các ô {state.pendingFounding.tileIds.join(', ')} vừa nối liền tạo thành một chuỗi
          mới. Chọn tên chuỗi:
        </p>
        {player.isAI ? (
          <AIThinking name={player.name} />
        ) : (
          <div className="chain-choice-grid">
            {options.map((chainId) => {
              const meta = CHAINS_BY_ID[chainId]
              return (
                <button
                  key={chainId}
                  className="chain-choice-btn"
                  style={{ '--chip-color': meta.color }}
                  onClick={() => dispatch({ type: 'CHOOSE_CHAIN_NAME', chainId })}
                >
                  <i />
                  {meta.name}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
