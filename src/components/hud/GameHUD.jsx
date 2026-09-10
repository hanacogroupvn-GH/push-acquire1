import { useState } from 'react'
import { useGameState, useGameDispatch } from '../../game/GameContext.jsx'
import {
  currentPlayer,
  activeChains,
  isChainSafe,
  endConditionMet,
  isTileDead,
  totalPurchasesThisTurn,
  actorForPhase,
} from '../../game/gameReducer.js'
import { CHAINS, CHAINS_BY_ID, MAX_STOCK_PURCHASES_PER_TURN, sharePrice } from '../../game/constants.js'
import { parseTileId } from '../../game/board.js'
import FoundChainModal from '../modals/FoundChainModal.jsx'
import MergerSurvivorModal from '../modals/MergerSurvivorModal.jsx'
import StockDecisionModal from '../modals/StockDecisionModal.jsx'
import GameOverModal from '../modals/GameOverModal.jsx'
import './GameHUD.css'

function formatMoney(n) {
  return '$' + n.toLocaleString('en-US')
}

function playerName(state, playerId) {
  return state.players.find((p) => p.id === playerId)?.name ?? '?'
}

function chainName(chainId) {
  return CHAINS_BY_ID[chainId]?.name ?? chainId
}

function describeLogEntry(entry, state) {
  const who = playerName(state, entry.playerId)
  switch (entry.type) {
    case 'place':
      return `${who} đặt quân ${entry.tileId}`
    case 'grow':
      return `${who} mở rộng ${chainName(entry.chainId)} tại ${entry.tileId}`
    case 'found':
      return entry.auto
        ? `Chuỗi ${chainName(entry.chainId)} tự động được lập cho ${who}${entry.freeShare ? ' (+1 cổ miễn phí)' : ''}`
        : `${who} thành lập chuỗi ${chainName(entry.chainId)}${entry.freeShare ? ' (+1 cổ miễn phí)' : ''}`
    case 'merge-trigger':
      return `${who} kích hoạt sáp nhập ${entry.chainIds.map(chainName).join(' + ')} tại ${entry.tileId}`
    case 'merge-complete':
      return `${chainName(entry.survivorId)} là chuỗi sống sót sau sáp nhập`
    case 'stock-decision':
      return `${who} xử lý cổ ${chainName(entry.chainId)}: đổi ${entry.tradeUnits} cặp, bán ${entry.sellCount}, giữ ${entry.kept}`
    case 'buy':
      return `${who} mua 1 cổ ${chainName(entry.chainId)} (${formatMoney(entry.price)})`
    case 'undo-buy':
      return `${who} hủy mua 1 cổ ${chainName(entry.chainId)}`
    case 'bonus':
      return `${who} nhận thưởng ${formatMoney(entry.amount)} từ ${chainName(entry.chainId)}`
    case 'discard-dead':
      return `${who} bỏ quân chết ${entry.tileId}`
    case 'pass':
      return `${who} bỏ qua lượt đặt quân (hết quân)`
    default:
      return null
  }
}

const ACTIVITY_FEED_LENGTH = 2

function ActivityFeed({ state }) {
  const recent = state.log
    .slice(-ACTIVITY_FEED_LENGTH)
    .reverse()
    .map((entry, i) => ({ key: state.log.length - i, text: describeLogEntry(entry, state) }))
    .filter((e) => e.text)

  if (recent.length === 0) return null

  return (
    <section className="hud-section">
      <h2>Hoạt động gần đây</h2>
      <ul className="activity-feed">
        {recent.map((e) => (
          <li key={e.key}>{e.text}</li>
        ))}
      </ul>
    </section>
  )
}

function PlayerList({ state }) {
  const active = currentPlayer(state)
  const [revealedIds, setRevealedIds] = useState(() => new Set())
  const toggleRevealed = (playerId) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) next.delete(playerId)
      else next.add(playerId)
      return next
    })
  }

  return (
    <section className="hud-section">
      <h2>Người chơi</h2>
      <ul className="player-list">
        {state.players.map((p) => {
          const revealed = revealedIds.has(p.id)
          return (
            <li key={p.id} className={p.id === active.id ? 'player-row current' : 'player-row'}>
              <div className="player-row-top">
                <span className="player-name">
                  {p.isAI && <span title="Người chơi máy">🤖 </span>}
                  {p.name}
                </span>
                <span className="player-cash-wrap">
                  <span className="player-cash">{revealed ? formatMoney(p.cash) : '••••••'}</span>
                  <button
                    type="button"
                    className="cash-eye-toggle"
                    onClick={() => toggleRevealed(p.id)}
                    title={revealed ? 'Ẩn số tiền' : 'Xem số tiền'}
                    aria-label={revealed ? 'Ẩn số tiền' : 'Xem số tiền'}
                  >
                    {revealed ? '🙈' : '👁'}
                  </button>
                </span>
              </div>
              <div className="player-shares">
                {CHAINS.filter((c) => p.shares[c.id] > 0).map((c) => (
                  <span key={c.id} className="share-chip" style={{ '--chip-color': c.color }}>
                    <i />
                    {p.shares[c.id]}
                  </span>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function sortTileIds(tileIds) {
  return [...tileIds].sort((a, b) => {
    const pa = parseTileId(a)
    const pb = parseTileId(b)
    if (pa.col !== pb.col) return pa.col - pb.col
    return pa.row < pb.row ? -1 : pa.row > pb.row ? 1 : 0
  })
}

function HandRack({ state, dispatch }) {
  const player = currentPlayer(state)
  const canPlace = state.phase === 'place-tile'
  const aiTurn = canPlace && player.isAI

  return (
    <section className="hud-section">
      <h2>Quân của {player.name}</h2>
      {aiTurn ? (
        <p className="hud-hint ai-thinking">🤖 Máy đang suy nghĩ...</p>
      ) : (
        <div className="hand-rack">
          {sortTileIds(player.tiles).map((tileId) => {
            const dead = canPlace && isTileDead(state, tileId)
            const occupant = state.board[tileId]
            const alreadyUsed = !!occupant
            return (
              <button
                key={tileId}
                className={`hand-tile${dead ? ' dead' : ''}${!canPlace || alreadyUsed ? ' disabled' : ''}`}
                disabled={!canPlace || alreadyUsed}
                onClick={() => {
                  if (dead) dispatch({ type: 'DISCARD_DEAD_TILE', tileId })
                  else dispatch({ type: 'PLACE_TILE', tileId })
                }}
                title={dead ? 'Ô chết — bấm để bỏ và rút quân mới' : 'Đặt quân này lên bàn'}
              >
                {tileId}
                {dead && <span className="dead-x">×</span>}
              </button>
            )
          })}
        </div>
      )}
      {canPlace && !aiTurn && player.tiles.length === 0 && (
        <button className="end-turn-btn" onClick={() => dispatch({ type: 'PASS_PLACEMENT' })}>
          Bỏ qua (hết quân)
        </button>
      )}
      {!canPlace && <p className="hud-hint">Chờ xử lý xong bước hiện tại...</p>}
    </section>
  )
}

function ChainTable({ state }) {
  return (
    <section className="hud-section">
      <h2>Chuỗi khách sạn</h2>
      <table className="chain-table">
        <thead>
          <tr>
            <th></th>
            <th>Tên</th>
            <th>Số ô</th>
            <th>Giá</th>
            <th>Còn lại</th>
          </tr>
        </thead>
        <tbody>
          {CHAINS.map((c) => {
            const chain = state.chains[c.id]
            const size = chain.tiles.length
            const price = size >= 2 ? sharePrice(c.tier, size) : null
            return (
              <tr key={c.id} className={size === 0 ? 'chain-row inactive' : 'chain-row'}>
                <td>
                  <i className="chain-dot" style={{ background: c.color }} />
                </td>
                <td>
                  {c.name}
                  {isChainSafe(chain) && <span className="safe-badge">AN TOÀN</span>}
                </td>
                <td>{size || '—'}</td>
                <td>{price ? formatMoney(price) : '—'}</td>
                <td>{state.bank[c.id]}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function ActionBar({ state, dispatch }) {
  if (state.phase !== 'buy-stock') return null
  const player = currentPlayer(state)
  const purchased = totalPurchasesThisTurn(state)
  const remaining = MAX_STOCK_PURCHASES_PER_TURN - purchased
  const canEnd = endConditionMet(state)
  const aiTurn = player.isAI

  return (
    <section className="hud-section">
      <h2>Mua cổ phiếu ({remaining} lượt mua còn lại)</h2>
      {aiTurn ? (
        <p className="hud-hint ai-thinking">🤖 Máy đang mua cổ phiếu...</p>
      ) : (
        <p className="hud-hint">Có thể bấm − để chọn lại trước khi kết thúc lượt.</p>
      )}
      <div className="buy-grid">
        {activeChains(state).map((chain) => {
          const meta = CHAINS_BY_ID[chain.id]
          const price = sharePrice(meta.tier, chain.tiles.length)
          const boughtThisTurn = state.purchasesThisTurn[chain.id] ?? 0
          const buyDisabled = aiTurn || remaining <= 0 || state.bank[chain.id] <= 0 || player.cash < price
          return (
            <div key={chain.id} className="buy-row" style={{ '--chip-color': meta.color }}>
              <i />
              <span className="buy-name">{meta.name}</span>
              <span className="buy-price">{formatMoney(price)}</span>
              <div className="buy-stepper">
                <button
                  className="stepper-btn"
                  disabled={aiTurn || boughtThisTurn <= 0}
                  onClick={() => dispatch({ type: 'UNDO_BUY_SHARE', chainId: chain.id })}
                >
                  −
                </button>
                <span className="stepper-count">{boughtThisTurn}</span>
                <button
                  className="stepper-btn"
                  disabled={buyDisabled}
                  onClick={() => dispatch({ type: 'BUY_SHARE', chainId: chain.id })}
                >
                  +
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {!aiTurn && (
        <div className="action-buttons">
          {canEnd && (
            <button className="end-game-btn" onClick={() => dispatch({ type: 'DECLARE_GAME_END' })}>
              Kết thúc ván chơi
            </button>
          )}
          <button className="end-turn-btn" onClick={() => dispatch({ type: 'END_TURN' })}>
            Kết thúc lượt
          </button>
        </div>
      )}
    </section>
  )
}

export default function GameHUD() {
  const state = useGameState()
  const dispatch = useGameDispatch()
  if (!state) return null

  const isInterrupt = state.phase === 'merger-stock-decision'
  const actor = actorForPhase(state)

  return (
    <>
      <div className="hud-panel">
        <div className="hud-turn-banner">
          {isInterrupt ? 'Cần quyết định từ ' : 'Lượt của '}
          <strong>
            {actor?.isAI && '🤖 '}
            {actor?.name}
          </strong>
          <span className="hud-phase">{phaseLabel(state.phase)}</span>
        </div>
        <ActivityFeed state={state} />
        <PlayerList state={state} />
        <HandRack state={state} dispatch={dispatch} />
        <ChainTable state={state} />
        <ActionBar state={state} dispatch={dispatch} />
      </div>

      {state.phase === 'found-chain' && <FoundChainModal state={state} dispatch={dispatch} />}
      {state.phase === 'choose-merger-survivor' && (
        <MergerSurvivorModal state={state} dispatch={dispatch} />
      )}
      {state.phase === 'merger-stock-decision' && (
        <StockDecisionModal state={state} dispatch={dispatch} />
      )}
      {state.phase === 'game-over' && <GameOverModal state={state} />}
    </>
  )
}

function phaseLabel(phase) {
  switch (phase) {
    case 'place-tile':
      return 'Đặt quân'
    case 'found-chain':
      return 'Thành lập chuỗi'
    case 'choose-merger-survivor':
      return 'Chọn chuỗi sống sót'
    case 'merger-stock-decision':
      return 'Xử lý cổ phiếu sáp nhập'
    case 'buy-stock':
      return 'Mua cổ phiếu'
    case 'game-over':
      return 'Kết thúc'
    default:
      return phase
  }
}
