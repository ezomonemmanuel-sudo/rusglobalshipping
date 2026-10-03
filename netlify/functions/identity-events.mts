import type { UserSignupEvent } from '@netlify/functions'
export default {
  userSignup(event: UserSignupEvent) {
    return { user: { ...event.user, roles: ['customer'], appMetadata: { ...event.user.appMetadata, roles: ['customer'] } } }
  },
}
