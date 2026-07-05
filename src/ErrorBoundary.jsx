import { Component } from 'react'

// Le Error Boundary richiedono un componente a classe: non esiste ancora
// un equivalente a Hook in React. Cattura qualsiasi errore non gestito
// durante il render dei componenti figli e mostra un messaggio
// recuperabile invece di lasciare la pagina bianca.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Visibile in console per il debug — prima questo errore spariva
    // nel nulla insieme alla pagina.
    console.error('Errore non gestito nell\'interfaccia:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: 500, margin: '4rem auto' }}>
          <h1>Qualcosa è andato storto nell'interfaccia</h1>
          <p>
            La partita sul server non è stata toccata da questo errore (i tuoi ultimi dati sono già
            salvati). Puoi ricaricare la pagina in sicurezza per continuare.
          </p>
          <pre
            style={{
              background: '#f1efe8',
              padding: 8,
              borderRadius: 6,
              fontSize: 12,
              overflow: 'auto',
              whiteSpace: 'pre-wrap'
            }}
          >
            {String(this.state.error?.message ?? this.state.error)}
          </pre>
          <button onClick={() => window.location.reload()}>Ricarica la pagina</button>
        </div>
      )
    }
    return this.props.children
  }
}
