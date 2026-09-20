/**
 * NYSE trading calendar.
 *
 * Dates are plain 'YYYY-MM-DD' strings throughout and all arithmetic runs in UTC,
 * so nothing here depends on the machine's timezone. The only place a timezone
 * appears is etParts, which asks Intl for the wall clock in New York.
 */

const DAY = 86400000

const toUTC = (date) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) throw new TypeError(`expected a YYYY-MM-DD date, got ${JSON.stringify(date)}`)
  return Date.UTC(+m[1], +m[2] - 1, +m[3])
}
const toISO = (ms) => new Date(ms).toISOString().slice(0, 10)

export const addDays = (date, n) => toISO(toUTC(date) + n * DAY)
/** 0 = Sunday through 6 = Saturday. */
export const dayOfWeek = (date) => new Date(toUTC(date)).getUTCDay()
export const isWeekend = (date) => dayOfWeek(date) === 0 || dayOfWeek(date) === 6

/** Anonymous Gregorian computus. */
export function easterSunday (year) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return toISO(Date.UTC(year, month - 1, day))
}

const nthWeekdayOf = (year, month, weekday, n) => {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  return toISO(Date.UTC(year, month - 1, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7))
}
const lastWeekdayOf = (year, month, weekday) => {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const last = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay()
  return toISO(Date.UTC(year, month - 1, lastDay - ((last - weekday + 7) % 7)))
}

/**
 * Saturday holidays move back to Friday, Sunday holidays move forward to Monday.
 * New Year's Day is the exception: when 1 January falls on a Saturday the NYSE
 * does not close the preceding Friday, so that one is simply dropped.
 */
const observe = (date, { newYear = false } = {}) => {
  const dow = dayOfWeek(date)
  if (dow === 6) return newYear ? null : addDays(date, -1)
  if (dow === 0) return addDays(date, 1)
  return date
}

const holidayCache = new Map()

/** The exchange first closed for Juneteenth in 2022. */
const JUNETEENTH_FROM = 2022

/**
 * Closures that follow no rule: national days of mourning and disasters.
 * Verified against a decade of real sessions; earlier entries are recorded
 * for completeness.
 */
export const ONE_OFF_CLOSURES = new Set([
  '2001-09-11', '2001-09-12', '2001-09-13', '2001-09-14', // September 11 attacks
  '2004-06-11', // Ronald Reagan
  '2007-01-02', // Gerald Ford
  '2012-10-29', '2012-10-30', // Hurricane Sandy
  '2018-12-05', // George H. W. Bush
  '2025-01-09', // Jimmy Carter
])

/** The observed NYSE full-day closures for one calendar year, sorted. */
export function marketHolidays (year) {
  if (holidayCache.has(year)) return holidayCache.get(year)
  const easter = easterSunday(year)
  const list = [
    observe(`${year}-01-01`, { newYear: true }),
    nthWeekdayOf(year, 1, 1, 3),      // Martin Luther King Jr Day
    nthWeekdayOf(year, 2, 1, 3),      // Washington's Birthday
    addDays(easter, -2),              // Good Friday
    lastWeekdayOf(year, 5, 1),        // Memorial Day
    year >= JUNETEENTH_FROM ? observe(`${year}-06-19`) : null, // Juneteenth
    observe(`${year}-07-04`),         // Independence Day
    nthWeekdayOf(year, 9, 1, 1),      // Labor Day
    nthWeekdayOf(year, 11, 4, 4),     // Thanksgiving
    observe(`${year}-12-25`),         // Christmas
    ...[...ONE_OFF_CLOSURES].filter((d) => d.startsWith(`${year}-`)),
  ].filter(Boolean).sort()
  holidayCache.set(year, list)
  return list
}

export function isMarketHoliday (date) {
  const year = +date.slice(0, 4)
  // An observed date can land in the neighbouring year, so check both sides.
  return marketHolidays(year).includes(date) ||
    marketHolidays(year - 1).includes(date) ||
    marketHolidays(year + 1).includes(date)
}

export const isTradingDay = (date) => !isWeekend(date) && !isMarketHoliday(date)

/** The first session strictly after `date`. */
export function nextTradingDay (date) {
  let d = addDays(date, 1)
  while (!isTradingDay(d)) d = addDays(d, 1)
  return d
}

/** The last session strictly before `date`. */
export function prevTradingDay (date) {
  let d = addDays(date, -1)
  while (!isTradingDay(d)) d = addDays(d, -1)
  return d
}

/** Every session from `from` to `to`, both ends included when they are sessions. */
export function sessionsBetween (from, to) {
  const out = []
  for (let d = from; d <= to; d = addDays(d, 1)) if (isTradingDay(d)) out.push(d)
  return out
}

export function tradingDaysInMonth (year, month) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, '0')
  return sessionsBetween(`${year}-${mm}-01`, `${year}-${mm}-${last}`).length
}

export function lastTradingDayOfMonth (year, month) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  let d = `${year}-${String(month).padStart(2, '0')}-${last}`
  while (!isTradingDay(d)) d = addDays(d, -1)
  return d
}

/** The final session of the calendar week containing `date`. */
export function lastSessionOfWeek (date) {
  const saturday = addDays(date, 6 - dayOfWeek(date))
  return prevTradingDay(addDays(saturday, 1))
}

/**
 * The close the weekly band hangs from: the last session of the most recently
 * completed week, or `date` itself when `date` closed its own week.
 */
export function weekAnchor (date) {
  const last = lastSessionOfWeek(date)
  if (last <= date) return last
  return prevTradingDay(addDays(date, -dayOfWeek(date)))
}

/** The session the weekly band runs to: the last session of the week after the anchor. */
export function weekExpiry (anchor) {
  return lastSessionOfWeek(addDays(anchor, 7 - dayOfWeek(anchor)))
}

const ET_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** The New York wall clock for an instant, as { date, hour, minute }. */
export function etParts (instant) {
  const parts = Object.fromEntries(
    ET_FMT.formatToParts(new Date(instant)).map((p) => [p.type, p.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: +parts.hour,
    minute: +parts.minute,
  }
}

export const MARKET_CLOSE_HOUR = 16

/**
 * The last session completed at `instant`. A session counts as complete from
 * 16:00 New York time, so an evening snapshot anchors on that day and a
 * pre-close one still anchors on the day before.
 */
export function sessionDateFor (instant) {
  const { date, hour } = etParts(instant)
  if (isTradingDay(date) && hour >= MARKET_CLOSE_HOUR) return date
  return prevTradingDay(date)
}
