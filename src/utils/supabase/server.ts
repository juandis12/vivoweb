import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          return (await cookieStore).getAll()
        },
        async setAll(cookiesToSet) {
          try {
            const nextCookies = await cookieStore
            cookiesToSet.forEach(({ name, value, options }) =>
              nextCookies.set(name, value, options)
            )
          } catch (error) {
            // El `setAll` se omitirá desde Server Components, es normal.
          }
        },
      },
    }
  )
}
