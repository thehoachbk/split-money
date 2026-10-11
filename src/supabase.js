import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && key)

let activeGroupId = null

export const supabase = isConfigured
  ? createClient(url, key, {
      global: {
        fetch: (input, init = {}) => {
          const headers = new Headers(input instanceof Request ? input.headers : undefined)
          new Headers(init.headers).forEach((value, name) => headers.set(name, value))
          if (activeGroupId) headers.set('x-group-id', activeGroupId)
          else headers.delete('x-group-id')
          return fetch(input, { ...init, headers })
        },
      },
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export function clientFor(groupId) {
  if (!supabase) throw new Error('Supabase chưa được cấu hình.')
  activeGroupId = groupId
  return supabase
}
