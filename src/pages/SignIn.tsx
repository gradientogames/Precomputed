import { useEffect, useState } from 'react'
import { hasSupabase } from '../lib/supabaseClient'
import { onAuthChange, signIn, signUp } from '../lib/auth'
import { navigate } from '../lib/router'

export default function SignInPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null)

  useEffect(() => {
    console.log('[SignIn] mounted')
    const unsub = onAuthChange(async (u) => {
      console.log('[SignIn] auth change:', u ? { id: u.id, email: u.email } : null)
      setAuthChecked(true)
      setSignedInEmail(u?.email ?? null)
      if (u) {
        // Already signed in; go to account page
        console.log('[SignIn] user is signed in; navigating to account')
        navigate('account')
      }
    })
    return () => {
      console.log('[SignIn] unmounted; unsubscribing from auth changes')
      try { unsub && (unsub as any)() } catch {}
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    console.log('[SignIn] submit:', { mode, email })
    if (!hasSupabase) {
      setError('Supabase is not configured. Provide VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable sign-in.')
      console.warn('[SignIn] submit blocked: Supabase not configured')
      return
    }
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'signin') {
        await signIn(email, password)
        setInfo('Signed in successfully. Redirecting to your account…')
        console.log('[SignIn] sign-in success; navigating to account')
        navigate('account')
      } else {
        await signUp(email, password)
        // Do not await getCurrentUser here; many projects require email confirmation and no session is created yet.
        setInfo(`Account created. We’ve sent a confirmation email to ${email}. Please confirm your email, then return here to sign in.`)
        console.log('[SignIn] sign-up success; confirmation email sent (or required). No auto-login expected.')
      }
      setEmail('')
      setPassword('')
    } catch (err: any) {
      console.error('[SignIn] submit error:', err?.message || err)
      setError(err?.message || 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <h2>{mode === 'signin' ? 'Sign in' : 'Create account'}</h2>
      {!hasSupabase && (
        <p className="error">Supabase not configured. Progress will be stored locally, but sign-in is disabled.</p>
      )}
      {error && <p className="error">{error}</p>}
      {info && <p className="text-muted">{info}</p>}
      <p aria-live="polite" className="text-muted mt-2">
        {!authChecked ? 'Checking session…' : signedInEmail ? `Signed in as ${signedInEmail}.` : 'Not signed in.'}
      </p>
      {mode === 'signup' && (
        <p className="text-muted">Note: You’ll receive a confirmation email. Please click the link to activate your account before signing in.</p>
      )}
      <form onSubmit={handleSubmit} className="lesson mt-3" style={{ maxWidth: 520 }}>
        <div className="cluster">
          <input
            className="input"
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
            required
            disabled={loading || !hasSupabase}
          />
          <input
            className="input"
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword((e.target as HTMLInputElement).value)}
            required
            disabled={loading || !hasSupabase}
          />
          <button className="btn btn-primary" type="submit" disabled={loading || !hasSupabase}>
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={loading}
            onClick={() => {
              const next = mode === 'signin' ? 'signup' : 'signin'
              console.log('[SignIn] toggle mode:', mode, '->', next)
              setMode(next)
            }}
          >
            {mode === 'signin' ? 'Create account' : 'Have an account? Sign in'}
          </button>
        </div>
      </form>
      <div className="mt-3">
        <button className="btn" onClick={() => { console.log('[SignIn] back to lessons'); navigate('') }}>Back to lessons</button>
      </div>
    </section>
  )
}
