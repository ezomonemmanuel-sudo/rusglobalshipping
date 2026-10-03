export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/operations/${path}`, { method, credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const data = await response.json().catch(() => null)
  if (!response.ok || data === null) throw new Error(data?.error || 'The shipping service is temporarily unavailable. Try again shortly.')
  return data
}
