import { hasSupabase, supabase } from './supabaseClient'
import { getCurrentUser } from './auth'

const STORAGE_KEY_FALLBACK = 'completedLessons' // used only if Supabase is not configured

async function getAuthenticatedUserId(): Promise<string | null> {
  if (hasSupabase && supabase) {
    try {
      const u = await getCurrentUser()
      if (u) {
        console.log('[progress] Authenticated user id =', u.id)
        return u.id
      }
      console.log('[progress] No authenticated user; falling back')
    } catch (e) {
      console.warn('[progress] getAuthenticatedUserId error; falling back to local:', e)
      // ignore and fall back
    }
  }
  return null
}

export async function loadCompleted(): Promise<string[]> {
  if (hasSupabase && supabase) {
    const userId = await getAuthenticatedUserId()
    if (userId) {
      console.log('[progress] Loading completed lessons from Supabase for user', userId)
      const { data, error } = await supabase
        .from('lesson_progress')
        .select('lesson_id')
        .eq('user_id', userId)
        .eq('completed', true)

      if (error) {
        console.error('[progress] loadCompleted error (Supabase):', error.message)
        throw error
      }
      const ids = (data ?? []).map((row: any) => row.lesson_id as string)
      console.log('[progress] Loaded', ids.length, 'completed lesson(s) from Supabase')
      return ids
    }
  }
  // Fallback to local storage to keep prototype usable without env or when not signed in
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FALLBACK)
    if (!raw) {
      console.log('[progress] No local completed lessons found')
      return []
    }
    const arr = JSON.parse(raw)
    const ids = Array.isArray(arr) ? (arr as string[]) : []
    console.log('[progress] Loaded', ids.length, 'completed lesson(s) from local storage')
    return ids
  } catch (e) {
    console.warn('[progress] Failed to read local completed lessons:', e)
    return []
  }
}

export async function setLessonCompleted(lessonId: string, isCompleted: boolean): Promise<void> {
  console.log('[progress] setLessonCompleted:', { lessonId, isCompleted, backend: hasSupabase ? 'Supabase' : 'local' })
  if (hasSupabase && supabase) {
    const userId = await getAuthenticatedUserId()
    if (userId) {
      if (isCompleted) {
        console.log('[progress] Upserting completed row to Supabase', { userId, lessonId })
        const { error } = await supabase
          .from('lesson_progress')
          .upsert({ user_id: userId, lesson_id: lessonId, completed: true }, { onConflict: 'user_id,lesson_id' })
        if (error) {
          console.error('[progress] Upsert error:', error.message)
          throw error
        }
        console.log('[progress] Upsert success')
      } else {
        // remove the row for simplicity
        console.log('[progress] Deleting row from Supabase', { userId, lessonId })
        const { error } = await supabase
          .from('lesson_progress')
          .delete()
          .eq('user_id', userId)
          .eq('lesson_id', lessonId)
        if (error) {
          console.error('[progress] Delete error:', error.message)
          throw error
        }
        console.log('[progress] Delete success')
      }
      return
    }
  }

  // Fallback behavior updates localStorage (also used when not signed in)
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FALLBACK)
    const set = new Set<string>(raw ? (JSON.parse(raw) as string[]) : [])
    if (isCompleted) set.add(lessonId)
    else set.delete(lessonId)
    localStorage.setItem(STORAGE_KEY_FALLBACK, JSON.stringify(Array.from(set)))
    console.log('[progress] Local storage updated. Completed count =', set.size)
  } catch (e) {
    console.warn('[progress] Failed to update local storage:', e)
    // ignore
  }
}

export function backendLabel(): string {
  return hasSupabase ? 'Supabase' : 'local storage'
}

/**
 * Reset all progress for the current user.
 * - If Supabase is configured and there is an authenticated user, delete all rows for that user.
 * - Otherwise, clear the local storage fallback key.
 * Emits a global `progress-reset` event on success so the UI can refresh.
 */
export async function resetProgress(): Promise<void> {
  console.log('[progress] resetProgress: starting (backend =', hasSupabase ? 'Supabase' : 'local', ')')
  if (hasSupabase && supabase) {
    const userId = await getAuthenticatedUserId()
    if (userId) {
      console.log('[progress] resetProgress: deleting all progress rows for user', userId)
      const { error } = await supabase
        .from('lesson_progress')
        .delete()
        .eq('user_id', userId)
      if (error) {
        console.error('[progress] resetProgress error (Supabase):', error.message)
        throw error
      }
      console.log('[progress] resetProgress: Supabase rows deleted')
      window.dispatchEvent(new CustomEvent('progress-reset'))
      return
    }
  }
  // Local fallback
  try {
    localStorage.removeItem(STORAGE_KEY_FALLBACK)
    console.log('[progress] resetProgress: local storage key removed')
  } catch (e) {
    console.warn('[progress] resetProgress: failed to remove local key:', e)
  }
  window.dispatchEvent(new CustomEvent('progress-reset'))
}
