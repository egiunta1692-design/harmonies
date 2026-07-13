import { useEffect, useState } from 'react'
import { supabase, signUpWithEmail, signInWithEmail, signOut, getMyProfile, createMyProfile, resendConfirmationEmail } from '../lib/supabaseClient'

// Avvolge tutta l'app: finché non c'è una sessione autenticata E un
// profilo (nickname) associato, mostra il modulo di accesso invece dei
// figli. Passa "profile" e "signOut" ai figli tramite render prop, così
// il resto dell'app ha sempre a disposizione il nickname dell'utente
// senza doverlo ripescare ogni volta.
export default function Auth({ children }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)

  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (!newSession) setProfile(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    getMyProfile().then(setProfile)
  }, [session])

  async function handleAuthSubmit() {
    if (!email.trim() || !password) return setError('Inserisci email e password')
    setSubmitting(true)
    setError(null)
    setInfo(null)
    setNeedsConfirmation(false)
    try {
      if (mode === 'register') {
        const data = await signUpWithEmail(email.trim(), password)
        if (!data.session) {
          // Conferma email richiesta dal progetto Supabase: nessuna
          // sessione finché non si clicca il link ricevuto via email.
          setInfo('Ti abbiamo mandato un\'email di conferma: apri il link per completare la registrazione, poi torna qui e accedi.')
          setMode('login')
        }
      } else {
        await signInWithEmail(email.trim(), password)
      }
    } catch (err) {
      if (err.message?.toLowerCase().includes('email not confirmed')) {
        setError('Devi prima confermare la tua email: controlla la posta (anche lo spam) e apri il link che ti abbiamo mandato.')
        setNeedsConfirmation(true)
      } else {
        setError(err.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResendConfirmation() {
    if (!email.trim()) return setError('Inserisci prima la tua email')
    setSubmitting(true)
    setError(null)
    setInfo(null)
    try {
      await resendConfirmationEmail(email.trim())
      setInfo('Email di conferma reinviata: controlla la posta (anche lo spam).')
      setNeedsConfirmation(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCreateProfile() {
    if (!nickname.trim()) return setError('Scegli un nickname')
    setSubmitting(true)
    setError(null)
    try {
      const created = await createMyProfile(nickname)
      setProfile(created)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: '4rem' }}>Caricamento...</p>

  // Passo 1: nessuna sessione — login o registrazione.
  if (!session) {
    return (
      <div style={{ maxWidth: 360, margin: '4rem auto', fontFamily: 'sans-serif' }}>
        <h1>Harmonies online</h1>
        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
          <button onClick={() => setMode('login')} disabled={mode === 'login'}>
            Accedi
          </button>
          <button onClick={() => setMode('register')} disabled={mode === 'register'}>
            Registrati
          </button>
        </div>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '1rem' }}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '1rem' }}
          />
        </label>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {info && <p style={{ color: 'green' }}>{info}</p>}
        {needsConfirmation && (
          <button onClick={handleResendConfirmation} disabled={submitting} style={{ width: '100%', marginBottom: '1rem' }}>
            Reinvia email di conferma
          </button>
        )}
        <button onClick={handleAuthSubmit} disabled={submitting} style={{ width: '100%' }}>
          {submitting ? '...' : mode === 'login' ? 'Accedi' : 'Registrati'}
        </button>
      </div>
    )
  }

  // Passo 2: sessione presente ma nessun profilo — scelta nickname
  // (una tantum, resta legato all'account per sempre).
  if (!profile) {
    return (
      <div style={{ maxWidth: 360, margin: '4rem auto', fontFamily: 'sans-serif' }}>
        <h1>Scegli il tuo nickname</h1>
        <p style={{ color: '#666' }}>
          Sarà il tuo identificativo in tutte le partite — unico per tutta l'app, non potrai cambiarlo qui in
          seguito.
        </p>
        <label>
          Nickname
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '1rem' }}
          />
        </label>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button onClick={handleCreateProfile} disabled={submitting} style={{ width: '100%' }}>
          {submitting ? '...' : 'Conferma'}
        </button>
      </div>
    )
  }

  // Passo 3: tutto pronto — resto dell'app.
  return children({ profile, signOut })
}
