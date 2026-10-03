import { z } from 'zod'

export const statuses = ['Shipment Created', 'Shipment Accepted', 'Package Picked Up', 'At Origin Facility', 'Processing at Origin Facility', 'Export Documentation Processing', 'Customs Clearance — Origin', 'Departed Origin Country', 'In International Transit', 'Arrived at Destination Country', 'Customs Clearance — Destination', 'Released by Customs', 'At Destination Facility', 'In Transit to Local Facility', 'Out for Delivery', 'Delivery Attempted', 'Delivered', 'Held', 'Delayed', 'Returned to Sender', 'Cancelled'] as const
export const currencies = ['RUB', 'USD', 'EUR', 'GBP', 'NGN'] as const
export const originCities = ['Moscow', 'Saint Petersburg', 'Kazan', 'Samara', 'Rostov-on-Don', 'Novosibirsk', 'Yekaterinburg', 'Krasnodar', 'Sochi', 'Vladivostok']
const countryCodes = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ')
const displayNames = new Intl.DisplayNames(['en'], { type: 'region' })
export const countries = countryCodes.map(code => ({ code, name: displayNames.of(code) || code })).sort((first, second) => first.name.localeCompare(second.name))
export const countryName = (code: string) => code === 'INTL' ? 'International transit' : displayNames.of(code) || code
const text = z.string().trim().min(1).max(300)
const country = z.enum(countryCodes as [string, ...string[]])
const contact = z.object({ name: text, email: z.email().max(254), phone: z.string().trim().min(5).max(40), address: text })
export const shipmentInput = z.object({
  type: z.enum(['Parcel', 'Documents', 'Freight']), originCity: text,
  destinationCountry: country, destinationCity: text, region: z.string().trim().max(150), postalCode: z.string().trim().max(30),
  sender: contact, recipient: contact, description: z.string().trim().min(1).max(2000),
  weight: z.coerce.number().positive().max(100000), length: z.coerce.number().positive().max(10000), width: z.coerce.number().positive().max(10000), height: z.coerce.number().positive().max(10000),
  packages: z.coerce.number().int().min(1).max(1000), declaredValue: z.coerce.number().min(0).max(1000000000), currency: z.enum(currencies), serviceId: z.uuid(),
  estimatedDelivery: z.iso.date().nullable().optional(), ownerId: z.uuid().optional(), trackingNumber: z.string().regex(/^RWC-\d{4}-[A-Z0-9]{7,20}$/).optional(),
})
export const eventInput = z.object({ country: z.union([country, z.literal('INTL')]), city: text, facility: z.string().trim().max(250), status: z.enum(statuses), description: z.string().trim().min(1).max(2000), occurredAt: z.iso.datetime({ offset: true }) }).refine(event => new Date(event.occurredAt).getTime() <= Date.now() + 60000, { message: 'Tracking events cannot be recorded in the future.' })
export const customsInput = z.object({ status: z.enum(['Not submitted', 'Documentation pending', 'Under review', 'On hold', 'Released', 'Not applicable']), declarationStatus: z.enum(['Not submitted', 'Draft', 'Submitted', 'Accepted', 'Rejected']), reference: z.string().trim().max(250), goodsDescription: z.string().trim().max(2000), hold: z.boolean(), release: z.boolean(), notes: z.string().trim().max(4000) }).refine(value => !(value.hold && value.release), { message: 'Customs cannot be on hold and released simultaneously.' }).refine(value => value.release === (value.status === 'Released'), { message: 'Release confirmation must match the customs status.' })
export const rateInput = z.object({ serviceId: z.uuid(), originCity: z.string().trim().min(1).max(150), destinationCountry: z.union([country, z.literal('*')]), currency: z.enum(currencies), base: z.coerce.number().min(0).max(100000000), perKg: z.coerce.number().min(0).max(100000000), perPackage: z.coerce.number().min(0).max(100000000), volumetricDivisor: z.coerce.number().positive().max(100000), enabled: z.boolean() })
export const serviceInput = z.object({ name: text, description: z.string().trim().max(1000), minDays: z.coerce.number().int().min(1).max(365), maxDays: z.coerce.number().int().min(1).max(365), enabled: z.boolean() }).refine(service => service.maxDays >= service.minDays, { message: 'Maximum transit time must be at least the minimum.' })
export const quoteInput = z.object({ originCity: text, destinationCountry: country, weight: z.coerce.number().positive().max(100000), length: z.coerce.number().positive().max(10000), width: z.coerce.number().positive().max(10000), height: z.coerce.number().positive().max(10000), packages: z.coerce.number().int().min(1).max(1000), serviceId: z.uuid(), currency: z.enum(currencies) })
export type ShipmentInput = z.infer<typeof shipmentInput>
export type CustomsInput = z.infer<typeof customsInput>
