import './Modal.css'

export default function GameOverModal({ state }) {
  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h2>Ván chơi kết thúc</h2>
        <p className="modal-subtitle">Đã thanh lý toàn bộ cổ phiếu và trả thưởng cổ đông.</p>
        <ol className="standings-list">
          {state.finalStandings.map((p, i) => (
            <li key={p.id} className={p.id === state.winnerId ? 'standings-row winner' : 'standings-row'}>
              <span>
                <span className="standings-rank">#{i + 1}</span>
                {p.name}
                {p.id === state.winnerId ? ' 🏆' : ''}
              </span>
              <span className="standings-cash">${p.cash.toLocaleString('en-US')}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
