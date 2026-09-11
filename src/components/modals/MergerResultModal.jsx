import { useEffect, useState } from 'react'
import { CHAINS_BY_ID } from '../../game/constants.js'
import './Modal.css'

function formatMoney(n) {
  return '$' + n.toLocaleString('en-US')
}

function playerName(state, playerId) {
  return state.players.find((p) => p.id === playerId)?.name ?? '?'
}

function chainName(chainId) {
  return CHAINS_BY_ID[chainId]?.name ?? chainId
}

// Scans state.log for a merge-complete entry that appeared since the last
// render, walks back to the merge-trigger that started it, and collects
// every bonus/stock-decision entry in between -- a full public accounting
// of who got paid and who sold what, exactly as it would be announced
// around a physical Acquire table.
function findLatestMergerSummary(log, afterIndex) {
  for (let i = log.length - 1; i > afterIndex; i--) {
    const entry = log[i]
    if (entry.type !== 'merge-complete') continue
    let start = 0
    for (let j = i - 1; j >= 0; j--) {
      if (log[j].type === 'merge-trigger') {
        start = j
        break
      }
    }
    const items = []
    for (let k = start + 1; k < i; k++) {
      const e = log[k]
      if (e.type === 'bonus' || e.type === 'stock-decision') items.push(e)
    }
    return { index: i, survivorId: entry.survivorId, chainIds: entry.chainIds, items }
  }
  return null
}

// Pops up right after a merger resolves, listing every majority/minority
// bonus paid and every shareholder's sell/trade/keep decision with the cash
// involved -- so it's clear at a glance how much each opponent walked away
// with, the same way it would be visible to everyone at a physical table.
export default function MergerResultModal({ state }) {
  const [summary, setSummary] = useState(null)
  const [dismissedIndex, setDismissedIndex] = useState(-1)
  const [seenLength, setSeenLength] = useState(state.log.length)

  useEffect(() => {
    if (state.log.length <= seenLength) {
      setSeenLength(state.log.length)
      return
    }
    const found = findLatestMergerSummary(state.log, seenLength - 1)
    setSeenLength(state.log.length)
    if (found) setSummary(found)
  }, [state.log, seenLength])

  if (!summary || summary.index <= dismissedIndex) return null

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h2>Kết quả sáp nhập</h2>
        <p className="modal-subtitle">
          {summary.chainIds.map(chainName).join(' + ')} sáp nhập vào {chainName(summary.survivorId)}
        </p>
        {summary.items.length === 0 ? (
          <p className="hud-hint">Không ai nắm cổ phiếu của các chuỗi bị sáp nhập.</p>
        ) : (
          <ul className="merger-result-list">
            {summary.items.map((e, i) => (
              <li key={i}>
                {e.type === 'bonus' ? (
                  <>
                    <strong>{playerName(state, e.playerId)}</strong> nhận thưởng cổ đông{' '}
                    <strong className="merger-result-amount">{formatMoney(e.amount)}</strong> từ{' '}
                    {chainName(e.chainId)}
                  </>
                ) : (
                  <>
                    <strong>{playerName(state, e.playerId)}</strong> xử lý cổ {chainName(e.chainId)}: đổi{' '}
                    {e.tradeUnits} cặp, bán {e.sellCount}
                    {e.saleAmount > 0 && (
                      <>
                        {' '}
                        (<span className="merger-result-amount">+{formatMoney(e.saleAmount)}</span>)
                      </>
                    )}
                    , giữ {e.kept}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <button className="modal-submit-btn" onClick={() => setDismissedIndex(summary.index)}>
          Đã hiểu
        </button>
      </div>
    </div>
  )
}
