import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Mancano VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Copia .env.example in .env e riempilo.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Login anonimo: crea (o riusa) un utente senza email/password.
// Basta per un MVP tra amici: l'unica cosa che serve è un nickname.
export async function ensureAnonymousSession() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) return session

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return data.session
}
