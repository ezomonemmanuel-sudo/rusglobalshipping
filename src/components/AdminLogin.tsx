import { useState, type FormEvent } from 'react'
import { login, logout, requestPasswordRecovery } from '@netlify/identity'
import { ArrowLeft, ArrowRight, Eye, EyeOff, FileText, Layers3, LoaderCircle, Package, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'

export function AdminLogin() {
  const [mode, setMode] = useState<'login' | 'recovery'>('login')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const changeMode = (next: 'login' | 'recovery') => { setMode(next); setError(''); setNotice(''); setShowPassword(false) }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const email = String(values.get('email') || '').trim()
    const password = String(values.get('password') || '')
    setBusy(true); setError(''); setNotice('')
    try {
      if (mode === 'recovery') {
        await requestPasswordRecovery(email)
        setNotice('If this account exists, a password recovery link is on its way. Follow the email link to set a new password.')
        return
      }
      await login(email, password)
      try {
        const session = await api<{ role: string }>('session')
        if (session.role !== 'admin') throw new Error('Access denied')
      } catch {
        await logout()
        setError('Administrator access could not be verified. Only the designated account with an administrator role can enter. Contact your Netlify Identity administrator if setup is incomplete.')
        return
      }
      window.location.replace('/admin')
    } catch {
      setError(mode === 'recovery' ? 'Unable to send a recovery email. Try again shortly.' : 'Unable to sign in. Check your email and password, confirm your email address, and try again.')
    } finally {
      const passwordField = form.elements.namedItem('password')
      if (passwordField instanceof HTMLInputElement) passwordField.value = ''
      setShowPassword(false)
      setBusy(false)
    }
  }

  return <main className="admin-login-shell">
    <section className="admin-login-story" aria-label="Rusway operations">
      <a href="/" className="brand"><span className="brand-mark"><Package size={24}/></span><span>rusway<span className="brand-dot">.</span><small>INTERNATIONAL COURIER</small></span></a>
      <div className="admin-story-content">
        <span className="admin-login-eyebrow">PRIVATE OPERATIONS WORKSPACE</span>
        <h1>Every shipment.<br/>Every decision.<br/><span>Under your control.</span></h1>
        <p>Manage your Russia-origin courier operation with verified tracking, configured pricing, and a record of every change.</p>
        <ul className="admin-feature-list">
          <li><Package size={20}/><div><strong>Shipments & tracking</strong><span>Create and edit records, assign customers, and append actual courier events.</span></div></li>
          <li><Layers3 size={20}/><div><strong>Services & route pricing</strong><span>Control availability, transit estimates, and currency-specific rates.</span></div></li>
          <li><FileText size={20}/><div><strong>Customs & audit history</strong><span>Maintain verified customs information and private operational notes.</span></div></li>
        </ul>
      </div>
      <p className="admin-story-footer"><ShieldCheck size={16}/> Access is checked server-side on every protected request.</p>
    </section>
    <section className="admin-login-area" aria-labelledby="admin-login-title">
      <a className="admin-back-link" href="/"><ArrowLeft size={16}/> Customer workspace</a>
      <div className="admin-login-card">
        <span className="admin-login-mark"><ShieldCheck size={28}/></span>
        <span className="admin-login-eyebrow">AUTHORIZED ACCOUNT ONLY</span>
        <h2 id="admin-login-title">{mode === 'recovery' ? 'Recover your access.' : 'Administrator sign in.'}</h2>
        <p>{mode === 'recovery' ? 'Use your account email to request a secure password recovery link.' : 'Sign in with the designated administrator account to open your operations dashboard.'}</p>
        {error && <div className="feedback error" role="alert">{error}</div>}
        {notice && <div className="feedback success" role="status">{notice}</div>}
        <form className="modal-form admin-login-form" onSubmit={submit}>
          <label className="field"><span>Email address / username</span><input name="email" type="email" autoComplete="username" placeholder="Your administrator email" required disabled={busy} maxLength={254}/></label>
          {mode === 'login' && <label className="field"><span>Password</span><div className="admin-password-field"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required disabled={busy} maxLength={1024}/><button type="button" className="icon-button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} disabled={busy} onClick={() => setShowPassword(current => !current)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>}
          <button type="submit" className="primary-button full-width" disabled={busy}>{busy ? <LoaderCircle size={18} className="spin"/> : <ArrowRight size={18}/>} {busy ? 'Please wait…' : mode === 'recovery' ? 'Send recovery email' : 'Open administrator dashboard'}</button>
          <button type="button" className="text-button admin-recovery-link" disabled={busy} onClick={() => changeMode(mode === 'login' ? 'recovery' : 'login')}>{mode === 'login' ? 'Forgot your password?' : 'Back to sign in'}</button>
        </form>
        <div className="admin-access-note"><ShieldCheck size={18}/><p>This page does not create staff accounts or grant roles. An authorized Netlify Identity administrator must provision the designated account and assign its administrator role.</p></div>
      </div>
      <p className="admin-login-footer">Rusway · Russia → Worldwide</p>
    </section>
  </main>
}
