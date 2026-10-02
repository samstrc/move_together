// Small helpers for showing numbers and dates nicely.

export function formatMoney(amount) {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
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
