// Fake data so the pages have something to show.
// TODO: Delete this file once the pages fetch real data from the FastAPI backend.

export const currentUser = {
  id: 1,
  name: 'Sam Strickler',
  email: 'sam@example.com',
}

export const group = {
  id: 1,
  name: 'Our First Apartment',
  address: '123 Main St, Akron, OH',
  moveDate: '2026-12-15',
  inviteCode: 'MOVE-4821',
  members: [
    { id: 1, name: 'Sam Strickler', role: 'Owner' },
    { id: 2, name: 'Caius Price', role: 'Member' },
    { id: 3, name: 'Qiaozhi Yong', role: 'Member' },
  ],
}

export const items = [
  { id: 1, name: 'Couch', category: 'Living room', price: 650, status: 'needed', addedBy: 'Caius Price' },
  { id: 2, name: 'Shower curtain', category: 'Bathroom', price: 25, status: 'bought', addedBy: 'Sam Strickler' },
  { id: 3, name: 'Pots and pans set', category: 'Kitchen', price: 120, status: 'needed', addedBy: 'Qiaozhi Yong' },
  { id: 4, name: 'Wi-Fi router', category: 'Utilities', price: 90, status: 'bought', addedBy: 'Sam Strickler' },
  { id: 5, name: 'Dining table', category: 'Kitchen', price: 300, status: 'needed', addedBy: 'Caius Price' },
]

export const budget = {
  total: 2500,
}

export const expenses = [
  { id: 1, description: 'Shower curtain', amount: 25, paidBy: 'Sam Strickler', date: '2026-09-20' },
  { id: 2, description: 'Wi-Fi router', amount: 90, paidBy: 'Sam Strickler', date: '2026-09-24' },
  { id: 3, description: 'Moving truck deposit', amount: 150, paidBy: 'Qiaozhi Yong', date: '2026-09-28' },
]
