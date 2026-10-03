import { createServerFn } from '@tanstack/react-start'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { authenticate } from '../server/auth'
import { hasAdministratorAccess } from '../server/access'
export const verifyAdministrator = createServerFn({ method: 'GET' }).handler(async () => {
  setResponseHeader('Cache-Control', 'private, no-store')
  try {
    const user = await authenticate(getRequest())
    return hasAdministratorAccess(user)
  } catch { return false }
})
