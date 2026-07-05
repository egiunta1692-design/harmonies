import { scorePlayerBoard } from '../game-engine'

const cellStyle = { border: '1px solid #ccc', padding: '4px 10px', textAlign: 'left' }

export default function FinalScoreboard({ players, boardMode }) {
  const rows = players.map((p) => {
    const score = scorePlayerBoard(p.board_state, p.animal_cards ?? [], boardMode)
    const cubesPlaced = (p.animal_cards ?? []).reduce((sum, c) => sum + c.cubesPlaced, 0)
    return { nickname: p.nickname, score, cubesPlaced }
  })

  // Ordinamento e spareggio da regolamento (pag. 7): punteggio totale,
  // poi numero di cubi Animale piazzati; parità persistente = vittoria condivisa.
  rows.sort((a, b) => b.score.total - a.score.total || b.cubesPlaced - a.cubesPlaced)
  const top = rows[0]
  const winners = top ? rows.filter((r) => r.score.total === top.score.total && r.cubesPlaced === top.cubesPlaced) : []

  return (
    <div>
      <h2 style={{ margin: '4px 0 6px', fontSize: '1.2rem' }}>🏆 Partita finita!</h2>
      <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th style={cellStyle}>Giocatore</th>
            <th style={cellStyle}>Paesaggio</th>
            <th style={cellStyle}>Animali</th>
            <th style={cellStyle}>Cubi</th>
            <th style={cellStyle}>Totale</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isWinner = winners.includes(r)
            return (
              <tr key={i} style={{ fontWeight: isWinner ? 'bold' : 'normal', background: isWinner ? '#fef3c7' : 'transparent' }}>
                <td style={cellStyle}>
                  {isWinner && '🏆 '}
                  {r.nickname}
                </td>
                <td style={cellStyle}>{r.score.landscapeTotal}</td>
                <td style={cellStyle}>{r.score.animals}</td>
                <td style={cellStyle}>{r.cubesPlaced}</td>
                <td style={cellStyle}>{r.score.total}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {winners.length > 1 && (
        <p style={{ fontSize: '0.8rem', color: '#666', margin: '4px 0 0' }}>
          Parità anche sui cubi Animale piazzati: vittoria condivisa.
        </p>
      )}
    </div>
  )
}
