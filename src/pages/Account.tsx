import { useEffect, useState } from 'react'
import type { AuthUser } from '../lib/auth'
import { onAuthChange, signOut } from '../lib/auth'
import { backendLabel, resetProgress } from '../lib/progress'
import { hasSupabase } from '../lib/supabaseClient'
import { navigate } from '../lib/router'
import ConfirmDialog from '../components/ConfirmDialog'
import '../responsive.css'

export default function AccountPage() {
  const [user, setUser] = useState<AuthUser>(null)
  const [error, setError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [resetInfo, setResetInfo] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    console.log('[Account] mounted')
    console.log('[Account] progress backend:', backendLabel())
    const unsub = onAuthChange((u) => {
      console.log('[Account] auth change:', u ? { id: u.id, email: u.email } : null)
      setUser(u)
      setAuthLoading(false)
    })
    return () => {
      console.log('[Account] unmounted; unsubscribing from auth changes')
      try { unsub && (unsub as any)() } catch {}
    }
  }, [])

  async function handleSignOut() {
    setError(null)
    console.log('[Account] sign out clicked')
    try {
      await signOut()
      console.log('[Account] sign out success; navigating to lessons')
      navigate('')
    } catch (e: any) {
      console.error('[Account] sign out error:', e?.message || e)
      setError(e?.message || 'Failed to sign out')
    }
  }

  function openResetConfirm() {
    setError(null)
    setResetInfo(null)
    setConfirmOpen(true)
  }

  async function doReset() {
    setConfirmOpen(false)
    console.log('[Account] reset progress confirmed')
    setResetting(true)
    try {
      await resetProgress()
      console.log('[Account] reset progress success')
      setResetInfo('All progress has been reset.')
    } catch (e: any) {
      console.error('[Account] reset progress error:', e?.message || e)
      setError(e?.message || 'Failed to reset progress')
    } finally {
      setResetting(false)
    }
  }

  // Using CSS classes from responsive.css

  if (!hasSupabase) {
    return (
      <div className="account-container">
        <section className="account-page account-content">
          <h2>Account</h2>
          <p className="error">Supabase is not configured. Sign-in and account features are disabled.</p>
          <button className="btn mt-2" onClick={() => { console.log('[Account] back to lessons'); navigate('') }}>Back to lessons</button>
        </section>
      </div>
    )
  }

  if (authLoading) {
    return (
      <div className="account-container">
        <section className="account-page account-content">
          <h2>Account</h2>
          <p aria-live="polite" className="text-muted">Loading account…</p>
        </section>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="account-container">
        <section className="account-page account-content">
          <h2>Account</h2>
          <p>You are not signed in.</p>
          <div className="cluster mt-2">
            <button className="btn btn-primary" onClick={() => { console.log('[Account] go to sign in'); navigate('signin') }}>Sign in</button>
            <button className="btn" onClick={() => { console.log('[Account] back to lessons'); navigate('') }}>Back to lessons</button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="account-container">
      <section className="account-page account-content">
        <h2>Your account</h2>
      {error && <p className="error">{error}</p>}
      {resetInfo && <p className="text-muted" aria-live="polite">{resetInfo}</p>}
      <div className="lesson mt-3">
        <p><strong>Email:</strong> {user.email ?? '-'}</p>
        <p><strong>User ID:</strong> <code>{user.id}</code></p>
        <div className="mt-3 cluster">
          <button className="btn btn-danger" onClick={openResetConfirm} disabled={resetting}>
            {resetting ? 'Resetting…' : 'Reset progress'}
          </button>
          <button className="btn btn-secondary" onClick={handleSignOut}>Sign out</button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Reset progress"
        message="Reset all lesson progress for this account? This cannot be undone."
        confirmLabel="Reset"
        cancelLabel="Cancel"
        onConfirm={doReset}
        onCancel={() => { setConfirmOpen(false); console.log('[Account] reset cancelled') }}
      />
      </section>
    </div>
  )
}
