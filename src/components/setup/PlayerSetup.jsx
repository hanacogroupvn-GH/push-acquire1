import { useState } from 'react'
import { useGameDispatch } from '../../game/GameContext.jsx'
import { MIN_PLAYERS, MAX_PLAYERS } from '../../game/constants.js'
import './PlayerSetup.css'

function defaultNameFor(index, isAI) {
  return isAI ? `Máy ${index + 1}` : `Người chơi ${index + 1}`
}

function makeDefaultPlayers(count) {
  return Array.from({ length: count }, (_, i) => ({ name: defaultNameFor(i, false), isAI: false }))
}

export default function PlayerSetup() {
  const dispatch = useGameDispatch()
  const [players, setPlayers] = useState(makeDefaultPlayers(3))

  function handleCountChange(next) {
    setPlayers((prev) => {
      const updated = makeDefaultPlayers(next)
      for (let i = 0; i < Math.min(prev.length, next); i += 1) {
        updated[i] = prev[i]
      }
      return updated
    })
  }

  function handleNameChange(index, value) {
    setPlayers((prev) => prev.map((p, i) => (i === index ? { ...p, name: value } : p)))
  }

  function handleToggleAI(index) {
    setPlayers((prev) =>
      prev.map((p, i) => {
        if (i !== index) return p
        const nextIsAI = !p.isAI
        // Only auto-swap the name if the user never customized it away from its own default.
        const wasDefault = p.name === defaultNameFor(i, p.isAI)
        const name = wasDefault ? defaultNameFor(i, nextIsAI) : p.name
        return { ...p, isAI: nextIsAI, name }
      }),
    )
  }

  function handleStart() {
    const cleanPlayers = players.map((p, i) => ({
      name: p.name.trim() ? p.name.trim() : defaultNameFor(i, p.isAI),
      isAI: p.isAI,
    }))
    dispatch({ type: 'START_GAME', players: cleanPlayers })
  }

  return (
    <div className="setup-overlay">
      <div className="setup-card">
        <h1>Acquire</h1>
        <p className="setup-subtitle">Thiết lập ván chơi hotseat trên cùng một máy</p>

        <label className="setup-label" htmlFor="player-count">
          Số người chơi: {players.length}
        </label>
        <input
          id="player-count"
          type="range"
          min={MIN_PLAYERS}
          max={MAX_PLAYERS}
          value={players.length}
          onChange={(e) => handleCountChange(Number(e.target.value))}
        />

        <div className="setup-names">
          {players.map((p, i) => (
            <div key={i} className="setup-player-row">
              <input
                className="setup-name-input"
                value={p.name}
                placeholder={defaultNameFor(i, p.isAI)}
                onChange={(e) => handleNameChange(i, e.target.value)}
                maxLength={16}
              />
              <button
                type="button"
                className={`setup-ai-toggle${p.isAI ? ' is-ai' : ''}`}
                onClick={() => handleToggleAI(i)}
                title="Đổi giữa Người chơi và Máy"
              >
                {p.isAI ? '🤖 Máy' : '🧑 Người'}
              </button>
            </div>
          ))}
        </div>

        <button className="setup-start-btn" onClick={handleStart}>
          Bắt đầu ván chơi
        </button>
      </div>
    </div>
  )
}
