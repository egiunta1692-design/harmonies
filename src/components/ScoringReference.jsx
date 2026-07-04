// Riepilogo dei punteggi, valori confermati dalla scheda ufficiale
// "Tallying Points" — vedi game-engine/scoring.js per le stesse costanti.
export default function ScoringReference({ boardMode }) {
  return (
    <div
      style={{
        fontSize: 11,
        lineHeight: 1.5,
        border: '1px solid #ccc',
        borderRadius: 6,
        padding: '6px 10px',
        background: '#fff',
        whiteSpace: 'nowrap'
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 2 }}>Punteggi</div>
      <div>🌳/⛰️ Alberi/Montagne: 1 / 3 / 7 (altezza 1/2/3)</div>
      <div style={{ color: '#999' }}>Montagna isolata = 0</div>
      <div>🌾 Campi: 5 pt (gruppo di 2+ adiacenti)</div>
      <div>🏠 Edifici: 5 pt (3+ colori diversi vicini)</div>
      {boardMode === 'isole' ? (
        <div>🏝️ Isole: 5 pt per isola</div>
      ) : (
        <div>💧 Fiume (lunghezza): 0/2/5/8/11/15, poi +4/disco</div>
      )}
    </div>
  )
}
