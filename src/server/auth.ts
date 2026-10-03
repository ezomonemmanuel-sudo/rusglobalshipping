import { getUser } from '@netlify/identity'
import { z } from 'zod'

const identityUser = z.object({ id: z.uuid(), email: z.string().optional(), user_metadata: z.record(z.string(), z.unknown()).optional(), app_metadata: z.object({ roles: z.array(z.string()).optional() }).passthrough().optional() })

export async function authenticate(request: Request) {
  const authorization = request.headers.get('authorization')
  const cookie = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith('nf_jwt='))?.slice(7)
  let token: string | undefined
  try { token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : cookie ? decodeURIComponent(cookie) : undefined } catch { return null }
  if (!token || token.length > 16384) return null
  const verified = await fetch(new URL('/.netlify/identity/user', request.url), { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(10000) })
  if (!verified.ok) return null
  const parsed = identityUser.safeParse(await verified.json())
  if (!parsed.success) return null
  const sdkUser = await getUser()
  if (sdkUser && sdkUser.id !== parsed.data.id) return null
  const metadata = parsed.data.user_metadata || {}
  return { id: parsed.data.id, email: parsed.data.email || '', name: typeof metadata.full_name === 'string' ? metadata.full_name : typeof metadata.name === 'string' ? metadata.name : '', roles: parsed.data.app_metadata?.roles || [] }
}
