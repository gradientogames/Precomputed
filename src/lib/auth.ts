import { supabase, hasSupabase } from './supabaseClient'
import type { User } from '@supabase/supabase-js'

export type AuthUser = User | null

function _friendlyAuthMessage(err: any): string {
  const raw = (err?.message || '').toLowerCase()
  if (!raw) return 'Authentication error. Please try again.'
  if (raw.includes('invalid login credentials')) {
    return 'Incorrect email or password. If you don’t have an account yet, click “Create account”.'
  }
  if (raw.includes('email not confirmed') || raw.includes('confirm your email')) {
    return 'Please confirm your email address. Check your inbox for a confirmation link, then try again.'
  }
  if (raw.includes('user already registered') || raw.includes('already registered')) {
    return 'An account already exists for this email. Try signing in instead.'
  }
  if (raw.includes('password should be at least') || raw.includes('password is too short')) {
    return 'Password is too short. Please use at least 6 characters.'
  }
  if (raw.includes('rate limit')) {
    return 'Too many attempts. Please wait a bit and try again.'
  }
  return `Authentication error: ${err?.message || 'Please try again.'}`
}

export async function getCurrentUser(): Promise<AuthUser> {
  if (!hasSupabase || !supabase) {
    console.log('[auth] getCurrentUser: Supabase not configured')
    return null
  }
  try {
    console.log('[auth] getCurrentUser: checking session first')
    // 1) First, try to read the session from local storage (no network)
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
    if (sessionErr) {
      console.warn('[auth] getCurrentUser: getSession error:', sessionErr.message)
    }
    const sessionUser = sessionData?.session?.user ?? null
    if (sessionUser) {
      console.log('[auth] getCurrentUser: found user from session', { id: sessionUser.id, email: sessionUser.email })
      return sessionUser
    }

    // 2) Fall back to a network call to getUser, but cap the wait time
    console.log('[auth] getCurrentUser: session empty; fetching user from API with timeout')
    const timeoutMs = 5000
    const timeoutPromise = new Promise<{ data: { user: any } | null; error: any }>((resolve) => {
      setTimeout(() => {
        console.warn('[auth] getCurrentUser: timeout after', timeoutMs, 'ms; returning null')
        resolve({ data: { user: null }, error: null })
      }, timeoutMs)
    })
    const { data, error } = await Promise.race([supabase.auth.getUser(), timeoutPromise])
    if (error) {
      console.error('[auth] getCurrentUser error:', error.message)
      return null
    }
    const info = data?.user ? { id: (data as any).user.id, email: (data as any).user.email } : null
    console.log('[auth] getCurrentUser: result =', info)
    return (data as any)?.user ?? null
  } catch (e) {
    console.error('[auth] getCurrentUser exception:', e)
    return null
  }
}

export async function signUp(email: string, password: string) {
  if (!hasSupabase || !supabase) throw new Error('Supabase is not configured')
  console.log('[auth] signUp: attempting for', email)
  try {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    console.log('[auth] signUp: success for', email)
  } catch (err: any) {
    const friendly = _friendlyAuthMessage(err)
    console.error('[auth] signUp error:', err?.message || err)
    throw new Error(friendly)
  }
}

export async function signIn(email: string, password: string) {
  if (!hasSupabase || !supabase) throw new Error('Supabase is not configured')
  console.log('[auth] signIn: attempting for', email)
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    console.log('[auth] signIn: success for', email)
  } catch (err: any) {
    const friendly = _friendlyAuthMessage(err)
    console.error('[auth] signIn error:', err?.message || err)
    throw new Error(friendly)
  }
}

export async function signOut() {
  if (!hasSupabase || !supabase) {
    console.log('[auth] signOut: Supabase not configured; nothing to do')
    return
  }
  console.log('[auth] signOut: attempting')
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('[auth] signOut error:', error.message)
    throw error
  }
  console.log('[auth] signOut: success')
}

export function onAuthChange(callback: (user: AuthUser) => void) {
  if (!hasSupabase || !supabase) {
    console.log('[auth] onAuthChange: Supabase not configured; returning noop')
    return () => {}
  }
  // Initial fetch
  getCurrentUser()
    .then((u) => {
      console.log('[auth] onAuthChange initial user =', u ? { id: u.id, email: u.email } : null)
      callback(u)
    })
    .catch((err) => {
      console.error('[auth] onAuthChange initial fetch error:', err)
      callback(null)
    })
  const { data: sub } = supabase.auth.onAuthStateChange(async (evt, session) => {
    console.log('[auth] onAuthStateChange event:', evt)
    const user = session?.user ?? null
    console.log('[auth] onAuthStateChange session user =', user ? { id: user.id, email: user.email } : null)
    callback(user)
  })
  return () => {
    console.log('[auth] onAuthChange: unsubscribing')
    sub?.subscription.unsubscribe()
  }
}
