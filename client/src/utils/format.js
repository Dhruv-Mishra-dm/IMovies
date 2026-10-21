// Display helpers. All cinema times are shown in India Standard Time (business rule 3),
// whatever time zone the visitor's computer uses.
export const TIME_ZONE = 'Asia/Kolkata'

const wholeRupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const exactRupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const longDate = new Intl.DateTimeFormat('en-IN', { timeZone: TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric' })
const shortDay = new Intl.DateTimeFormat('en-IN', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' })
const timeOfDay = new Intl.DateTimeFormat('en-IN', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true })
const dateKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/** 25000 (paise) → "₹250" ; 25050 → "₹250.50" (never "₹250.5") */
export const formatPrice = (paise) => (paise % 100 === 0 ? wholeRupees : exactRupees).format(paise / 100)

/** 142 → "2h 22m" */
export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return [h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ') || '0m'
}

export const formatLongDate = (iso) => longDate.format(new Date(iso))
export const formatShortDay = (iso) => shortDay.format(new Date(iso))
export const formatTime = (iso) => timeOfDay.format(new Date(iso)).toUpperCase()
export const formatDateTime = (iso) => `${formatShortDay(iso)}, ${formatTime(iso)}`

/** The IST calendar day of an instant, "YYYY-MM-DD". */
export const istDateKey = (date) => dateKeyFormat.format(date)
