import { createFileRoute, redirect } from '@tanstack/react-router'
import { verifyAdministrator } from '../lib/admin'
import { Workspace } from '../components/Workspace'
export const Route = createFileRoute('/admin')({
  beforeLoad: async () => { if (!await verifyAdministrator()) throw redirect({ to: '/admin-login' }) },
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  head: () => ({ meta: [{ title: 'Administrator dashboard · Rusway' }, { name: 'robots', content: 'noindex, nofollow' }] }),
  component: Workspace,
})
