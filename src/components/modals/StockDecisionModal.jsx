import { useState } from 'react'
import { CHAINS_BY_ID, sharePrice } from '../../game/constants.js'
import AIThinking from './AIThinking.jsx'
import './Modal.css'

export default function StockDecisionModal({ state, dispatch }) {
  const pm = state.pendingMerger
  const chainId = pm.currentDefunctChainId
  const survivorMeta = CHAINS_BY_ID[pm.survivorId]
  const defunctMeta = CHAINS_BY_ID[chainId]
  const player = state.players.find((p) => p.id === pm.currentShareholderId)
  const held = player.shares[chainId]
  const size = pm.chainSizesAtMerger[chainId]
  const price = sharePrice(defunctMeta.tier, size)
  const maxTradeUnits = Math.min(Math.floor(held / 2), state.bank[pm.survivorId])

  const [tradeUnits, setTradeUnits] = useState(0)
  const [sellCount, setSellCount] = useState(0)

  const afterTrade = held - tradeUnits * 2
  const clampedSell = Math.min(sellCount, afterTrade)
  const kept = afterTrade - clampedSell

  function submit() {
    dispatch({
      type: 'RESOLVE_STOCK_DECISION',
      playerId: player.id,
      tradeUnits,
      sellCount: clampedSell,
    })
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h2>Sáp nhập: {defunctMeta.name} → {survivorMeta.name}</h2>
        <p className="modal-subtitle">
          {player.name}, bạn đang giữ {held} cổ phiếu {defunctMeta.name} (giá {price.toLocaleString('en-US')}
          $/cổ khi sáp nhập). Quyết định số phận từng cổ phiếu:
        </p>

        {player.isAI ? (
          <AIThinking name={player.name} />
        ) : (
          <>
            <div className="stock-decision-row">
              <span>Đổi 2 lấy 1 cổ {survivorMeta.name}</span>
              <span>
                Kho còn {state.bank[pm.survivorId]} cổ {survivorMeta.name}
              </span>
            </div>
            <div className="stock-field">
              <label>Số cặp muốn đổi (tối đa {maxTradeUnits})</label>
              <input
                type="number"
                min={0}
                max={maxTradeUnits}
                value={tradeUnits}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(maxTradeUnits, Number(e.target.value) || 0))
                  setTradeUnits(v)
                  setSellCount((s) => Math.min(s, held - v * 2))
                }}
              />
            </div>

            <div className="stock-field">
              <label>Số cổ muốn bán ngay (tối đa {afterTrade})</label>
              <input
                type="number"
                min={0}
                max={afterTrade}
                value={sellCount}
                onChange={(e) => setSellCount(Math.max(0, Math.min(afterTrade, Number(e.target.value) || 0)))}
              />
            </div>

            <p className="stock-kept-note">
              Đổi: {tradeUnits} cặp ({tradeUnits * 2} cổ) → {tradeUnits} cổ {survivorMeta.name} · Bán:{' '}
              {clampedSell} cổ (+{(clampedSell * price).toLocaleString('en-US')}$) · Giữ lại: {kept} cổ{' '}
              {defunctMeta.name}
            </p>

            <button className="modal-submit-btn" onClick={submit}>
              Xác nhận
            </button>
          </>
        )}
      </div>
    </div>
  )
}
