// Small helpers for showing numbers and dates nicely.

// Every price in the app uses this currency. It's US dollars for now; the
// new-group survey can let people pick another one later.
export const CURRENCY = 'USD'

export function formatMoney(amount, currency = CURRENCY) {
  return amount.toLocaleString('en-US', { style: 'currency', currency })
}

// "$" for USD, "€" for EUR, ...
export function currencySymbol(currency = CURRENCY) {
  return (0).toLocaleString('en-US', { style: 'currency', currency }).replace(/[\d.,\s]/g, '')
}

export function formatDate(isoDate) {
  // Adding the time stops the date shifting a day because of time zones.
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function daysUntil(isoDate) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${isoDate}T00:00:00`)
  return Math.round((target - today) / (1000 * 60 * 60 * 24))
}
