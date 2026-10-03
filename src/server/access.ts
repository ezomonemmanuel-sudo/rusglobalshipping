type IdentityAccount = { email: string; roles: string[] }

const administratorEmail = 'emmyreign100@gmail.com'

export function hasAdministratorAccess(user: IdentityAccount | null) {
  return Boolean(user && user.email.trim().toLowerCase() === administratorEmail && user.roles.includes('admin'))
}
