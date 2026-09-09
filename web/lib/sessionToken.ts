import { supabase } from './supabaseClient'

let memoryAccessToken: string | null = null

export function rememberAccessToken(token: string | null) {
  memoryAccessToken = token
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (token) {
      memoryAccessToken = token
      return token
    }
  } catch (error) {
    console.warn('Could not read auth session:', error)
  }

  if (memoryAccessToken) {
    return memoryAccessToken
  }

  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error && data?.user) {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (token) {
        memoryAccessToken = token
        return token
      }
    }
  } catch (error) {
    console.warn('Could not refresh auth user:', error)
  }

  try {
    const { data } = await supabase.auth.refreshSession()
    const token = data?.session?.access_token
    if (token) {
      memoryAccessToken = token
      return token
    }
  } catch (error) {
    console.warn('Could not refresh auth session:', error)
  }

  return memoryAccessToken
}
