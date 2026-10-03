import { createFileRoute, redirect } from '@tanstack/react-router'
import { AdminLogin } from '../components/AdminLogin'
import { verifyAdministrator } from '../lib/admin'

export const Route = createFileRoute('/admin-login')({
  beforeLoad: async () => { if (await verifyAdministrator()) throw redirect({ to: '/admin' }) },
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  head: () => ({ meta: [{ title: 'Administrator sign in · Rusway' }, { name: 'robots', content: 'noindex, nofollow' }] }),
  component: AdminLogin,
})
