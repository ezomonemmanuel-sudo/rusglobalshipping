import type { Config } from '@netlify/functions'
import { and, or, eq, ilike, desc, asc, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../db/index.js'
import { shipments, events, notes, audit, services, rates, quotes } from '../../db/schema.js'
import { shipmentInput, eventInput, customsInput, serviceInput, rateInput, quoteInput, countryName, countries } from '../../src/lib/shipping.js'
import { authenticate } from '../../src/server/auth.js'
import { hasAdministratorAccess } from '../../src/server/access.js'

class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }
const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })

export default async (request: Request) => {
  const requestId = crypto.randomUUID()
  try {
    const user = await authenticate(request)
    if (!user) throw new ApiError(401, 'Sign in to access your shipping workspace.')
    const isStaff = hasAdministratorAccess(user)
    const url = new URL(request.url)
    const [, resource = '', id = '', action = ''] = url.pathname.replace('/api/operations', '').split('/')
    const method = request.method
    if (!['GET', 'POST', 'PATCH'].includes(method)) throw new ApiError(405, 'Method not allowed.')
    if (method !== 'GET') {
      const origin = request.headers.get('origin')
      const bearer = request.headers.get('authorization')?.startsWith('Bearer ')
      if ((origin ? origin !== url.origin : !bearer) || !request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(403, 'Only same-origin JSON or authenticated integration requests are accepted.')
      if (Number(request.headers.get('content-length') || 0) > 64000) throw new ApiError(413, 'Request too large.')
    }
    const requireStaff = () => { if (!isStaff) throw new ApiError(403, 'Designated administrator authorization required.') }
    const body = async () => { const raw = await request.text(); if (raw.length > 64000) throw new ApiError(413, 'Request too large.'); try { return JSON.parse(raw) } catch { throw new ApiError(400, 'Invalid JSON.') } }
    const ownership = async (shipmentId: string) => {
      z.uuid().parse(shipmentId)
      const [shipment] = await db.select().from(shipments).where(and(eq(shipments.id, shipmentId), isStaff ? undefined : eq(shipments.ownerId, user.id)))
      if (!shipment) throw new ApiError(404, 'Shipment not found.')
      return shipment
    }
    if (resource === 'session' && method === 'GET') return response({ id: user.id, name: user.name, email: user.email, role: isStaff ? 'admin' : 'customer' })
    if (resource === 'services' && method === 'GET') return response(await db.select().from(services).where(isStaff ? undefined : eq(services.enabled, true)).orderBy(asc(services.minDays)))
    if (resource === 'rates' && method === 'GET') { requireStaff(); return response(await db.select().from(rates).orderBy(desc(rates.updatedAt))) }
    if ((resource === 'services' || resource === 'rates') && ['POST', 'PATCH'].includes(method)) {
      requireStaff()
      const raw = await body()
      if (method === 'PATCH') z.uuid().parse(id)
      const result = await db.transaction(async transaction => {
        if (resource === 'services') {
          const values = serviceInput.parse(raw)
          const [before] = method === 'PATCH' ? await transaction.select().from(services).where(eq(services.id, id)).for('update') : []
          const [saved] = method === 'POST' ? await transaction.insert(services).values(values).returning() : await transaction.update(services).set({ ...values, updatedAt: new Date() }).where(eq(services.id, id)).returning()
          if (!saved) throw new ApiError(404, 'Service not found.')
          await transaction.insert(audit).values({ actorId: user.id, action: `service.${method === 'POST' ? 'created' : 'updated'}`, entityId: saved.id, changes: { before, after: saved } })
          return saved
        }
        const values = rateInput.parse(raw)
        const [service] = await transaction.select().from(services).where(eq(services.id, values.serviceId))
        if (!service) throw new ApiError(422, 'Unknown shipping service.')
        const prepared = { ...values, base: String(values.base), perKg: String(values.perKg), perPackage: String(values.perPackage), volumetricDivisor: String(values.volumetricDivisor) }
        const [before] = method === 'PATCH' ? await transaction.select().from(rates).where(eq(rates.id, id)).for('update') : []
        const [saved] = method === 'POST' ? await transaction.insert(rates).values(prepared).returning() : await transaction.update(rates).set({ ...prepared, updatedAt: new Date() }).where(eq(rates.id, id)).returning()
        if (!saved) throw new ApiError(404, 'Rate not found.')
        await transaction.insert(audit).values({ actorId: user.id, action: `rate.${method === 'POST' ? 'created' : 'updated'}`, entityId: saved.id, changes: { before, after: saved } })
        return saved
      })
      return response(result)
    }
    if (resource === 'quotes' && method === 'POST') {
      const input = quoteInput.parse(await body())
      const result = await db.transaction(async transaction => {
        const [service] = await transaction.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.enabled, true)))
        if (!service) throw new ApiError(422, 'This shipping service is unavailable.')
        const candidates = await transaction.select().from(rates).where(and(eq(rates.serviceId, input.serviceId), eq(rates.enabled, true), eq(rates.currency, input.currency), or(eq(rates.originCity, input.originCity), eq(rates.originCity, '*')), or(eq(rates.destinationCountry, input.destinationCountry), eq(rates.destinationCountry, '*'))))
        candidates.sort((first, second) => (Number(second.destinationCountry !== '*') * 2 + Number(second.originCity !== '*')) - (Number(first.destinationCountry !== '*') * 2 + Number(first.originCity !== '*')) || second.updatedAt.getTime() - first.updatedAt.getTime())
        const rate = candidates[0]
        if (!rate) throw new ApiError(422, 'No configured rate for this route, service, and currency. Contact the courier for an estimate.')
        const chargeableWeight = Math.max(input.weight, input.length * input.width * input.height / Number(rate.volumetricDivisor)) * input.packages
        const amount = (Number(rate.base) + chargeableWeight * Number(rate.perKg) + input.packages * Number(rate.perPackage)).toFixed(2)
        if (!Number.isFinite(Number(amount)) || Number(amount) >= 10000000000000) throw new ApiError(422, 'This package requires a manually arranged freight quote.')
        const [quote] = await transaction.insert(quotes).values({ ownerId: user.id, rateId: rate.id, inputs: input, amount, currency: input.currency, expiresAt: new Date(Date.now() + 86400000) }).returning()
        await transaction.insert(audit).values({ actorId: user.id, action: 'quote.created', entityId: quote.id, changes: { amount, currency: input.currency, rateId: rate.id } })
        return { ...quote, chargeableWeight, minDays: service.minDays, maxDays: service.maxDays, notice: 'Estimated quote only. Customs duties, taxes, and additional handling are not included. Availability requires courier confirmation.' }
      })
      return response(result, 201)
    }
    if (resource === 'shipments' && method === 'GET' && !id) {
      const search = (url.searchParams.get('search') || '').slice(0, 200)
      const status = url.searchParams.get('status')
      const destination = url.searchParams.get('destination')
      const page = Math.max(0, Math.min(10000, Number(url.searchParams.get('page')) || 0))
      const matchingCountries = countries.filter(country => country.name.toLowerCase().includes(search.toLowerCase())).map(country => eq(shipments.destinationCountry, country.code))
      const filters = and(isStaff ? undefined : eq(shipments.ownerId, user.id), search ? or(ilike(shipments.trackingNumber, `%${search}%`), ilike(shipments.originCity, `%${search}%`), ilike(shipments.destinationCity, `%${search}%`), ilike(shipments.destinationCountry, `%${search}%`), ...matchingCountries) : undefined, status ? eq(shipments.status, status) : undefined, destination ? eq(shipments.destinationCountry, destination) : undefined)
      const rows = await db.select({ id: shipments.id, trackingNumber: shipments.trackingNumber, originCity: shipments.originCity, destinationCountry: shipments.destinationCountry, destinationCity: shipments.destinationCity, status: shipments.status, estimatedDelivery: shipments.estimatedDelivery, currentLocation: shipments.currentLocation, updatedAt: shipments.updatedAt }).from(shipments).where(filters).orderBy(desc(shipments.createdAt)).limit(50).offset(page * 50)
      const counts = await db.select({ status: shipments.status, count: sql<number>`count(*)::int` }).from(shipments).where(isStaff ? undefined : eq(shipments.ownerId, user.id)).groupBy(shipments.status)
      return response({ rows, counts, page, hasMore: rows.length === 50 })
    }
    if (resource === 'tracking' && method === 'GET') {
      const trackingNumber = z.string().min(1).max(50).parse(url.searchParams.get('number')).toUpperCase()
      const [shipment] = await db.select({ id: shipments.id }).from(shipments).where(and(eq(shipments.trackingNumber, trackingNumber), isStaff ? undefined : eq(shipments.ownerId, user.id)))
      if (!shipment) throw new ApiError(404, 'No shipment found in your account with this tracking number.')
      return response({ id: shipment.id })
    }
    if (resource === 'shipments' && method === 'GET' && id) {
      const shipment = await ownership(id)
      const history = await db.select().from(events).where(eq(events.shipmentId, id)).orderBy(asc(events.occurredAt), asc(events.createdAt))
      const internalNotes = isStaff ? await db.select().from(notes).where(eq(notes.shipmentId, id)).orderBy(desc(notes.createdAt)) : undefined
      const safeCustoms = isStaff ? shipment.customs : { status: shipment.customs.status, declarationStatus: shipment.customs.declarationStatus, hold: shipment.customs.hold, release: shipment.customs.release }
      return response({ ...shipment, customs: safeCustoms, history: history.map(({ actorId: _actor, ...event }) => event), ...(isStaff ? { internalNotes } : {}) })
    }
    if (resource === 'shipments' && method === 'POST' && !id) {
      const input = shipmentInput.parse(await body())
      if (!isStaff && (input.ownerId || input.trackingNumber || input.estimatedDelivery)) throw new ApiError(403, 'Only handlers can assign ownership, tracking numbers, or delivery estimates.')
      const [service] = await db.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.enabled, true)))
      if (!service) throw new ApiError(422, 'Select an available shipping service.')
      const activeRates = await db.select({ id: rates.id }).from(rates).where(and(eq(rates.serviceId, input.serviceId), eq(rates.enabled, true), or(eq(rates.originCity, '*'), eq(rates.originCity, input.originCity)), or(eq(rates.destinationCountry, '*'), eq(rates.destinationCountry, input.destinationCountry)))).limit(1)
      if (!activeRates.length) throw new ApiError(422, 'This route is not configured. Contact operations to confirm availability.')
      const { ownerId: _owner, trackingNumber: _tracking, estimatedDelivery: _estimate, ...details } = input
      const trackingNumber = isStaff && input.trackingNumber ? input.trackingNumber : `RWC-${new Date().getUTCFullYear()}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
      const created = await db.transaction(async transaction => {
        const [shipment] = await transaction.insert(shipments).values({ trackingNumber, ownerId: isStaff ? input.ownerId || user.id : user.id, originCity: input.originCity, destinationCountry: input.destinationCountry, destinationCity: input.destinationCity, serviceId: input.serviceId, details, currentLocation: `${input.originCity}, Russia (declared origin; pickup not confirmed)`, estimatedDelivery: isStaff ? input.estimatedDelivery : null }).returning()
        await transaction.insert(audit).values({ actorId: user.id, action: 'shipment.created', entityId: shipment.id, changes: { after: shipment } })
        return shipment
      })
      return response(created, 201)
    }
    if (resource === 'shipments' && id && ['POST', 'PATCH'].includes(method)) {
      requireStaff()
      await ownership(id)
      const raw = await body()
      const result = await db.transaction(async transaction => {
        const [before] = await transaction.select().from(shipments).where(eq(shipments.id, id)).for('update')
        if (!before) throw new ApiError(404, 'Shipment not found.')
        let changes: Record<string, unknown>
        if (action === 'events' && method === 'POST') {
          const input = eventInput.parse(raw)
          const [event] = await transaction.insert(events).values({ ...input, shipmentId: id, actorId: user.id, occurredAt: new Date(input.occurredAt) }).returning()
          const [latest] = await transaction.select().from(events).where(eq(events.shipmentId, id)).orderBy(desc(events.occurredAt), desc(events.createdAt)).limit(1)
          await transaction.update(shipments).set({ status: latest.status, currentLocation: [latest.city, countryName(latest.country), latest.facility].filter(Boolean).join(', '), updatedAt: new Date() }).where(eq(shipments.id, id))
          changes = { event, previousStatus: before.status, previousLocation: before.currentLocation }
        } else if (action === 'customs' && method === 'PATCH') {
          const customs = customsInput.parse(raw)
          await transaction.update(shipments).set({ customs, updatedAt: new Date() }).where(eq(shipments.id, id))
          changes = { before: before.customs, after: customs }
        } else if (action === 'notes' && method === 'POST') {
          const input = z.object({ text: z.string().trim().min(1).max(4000) }).parse(raw)
          await transaction.insert(notes).values({ ...input, shipmentId: id, actorId: user.id })
          await transaction.update(shipments).set({ updatedAt: new Date() }).where(eq(shipments.id, id))
          changes = input
        } else if (!action && method === 'PATCH') {
          const input = shipmentInput.parse(raw)
          const [service] = await transaction.select().from(services).where(eq(services.id, input.serviceId))
          if (!service) throw new ApiError(422, 'Unknown shipping service.')
          const { ownerId: _owner, trackingNumber: _tracking, estimatedDelivery: _estimate, ...details } = input
          const updated = { details, originCity: input.originCity, destinationCountry: input.destinationCountry, destinationCity: input.destinationCity, serviceId: input.serviceId, estimatedDelivery: input.estimatedDelivery ?? null, ...(input.ownerId ? { ownerId: input.ownerId } : {}), ...(input.trackingNumber ? { trackingNumber: input.trackingNumber } : {}), updatedAt: new Date() }
          await transaction.update(shipments).set(updated).where(eq(shipments.id, id))
          changes = { before, after: updated }
        } else throw new ApiError(405, 'Unsupported shipment operation.')
        await transaction.insert(audit).values({ actorId: user.id, action: `shipment.${action || 'updated'}`, entityId: id, changes })
        return { ok: true }
      })
      return response(result)
    }
    if (resource === 'audit' && method === 'GET') { requireStaff(); const shipmentId = url.searchParams.get('shipmentId'); if (shipmentId) z.uuid().parse(shipmentId); return response(await db.select().from(audit).where(shipmentId ? eq(audit.entityId, shipmentId) : undefined).orderBy(desc(audit.createdAt)).limit(100)) }
    throw new ApiError(404, 'Endpoint not found.')
  } catch (error) {
    if (error instanceof ApiError) return response({ error: error.message, requestId }, error.status)
    if (error instanceof z.ZodError) return response({ error: error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '), requestId }, 400)
    const cause = typeof error === 'object' && error !== null && 'cause' in error ? error.cause : undefined
    if ((typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') || (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === '23505')) return response({ error: 'This tracking number is already assigned.', requestId }, 409)
    console.error(JSON.stringify({ requestId, category: 'operations_error', name: error instanceof Error ? error.name : 'UnknownError' }))
    return response({ error: 'The shipping service is temporarily unavailable. Try again shortly.', requestId }, 503)
  }
}
export const config: Config = { path: ['/api/operations/:resource', '/api/operations/:resource/:id', '/api/operations/:resource/:id/:action'] }
