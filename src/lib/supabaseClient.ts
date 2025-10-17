import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Read from Vite env variables. Configure these in a .env file:
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined
const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined

export const hasSupabase = Boolean(url && anonKey)

let client: SupabaseClient | null = null
console.log('[supabase] hasSupabase =', hasSupabase)
if (hasSupabase) {
  console.log('[supabase] creating client', { url })
  client = createClient(url!, anonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // ensure browser storage is used when available
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  })
  console.log('[supabase] client created with auth options (persistSession, autoRefreshToken, detectSessionInUrl)')
} else {
  console.log('[supabase] not configured (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY)')
}

export const supabase = client
