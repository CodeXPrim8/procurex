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

  return memoryAccessToken
}
