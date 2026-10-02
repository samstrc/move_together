import { useState } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import { currentUser, items as sampleItems } from '../data/sampleData.js'
import { formatMoney } from '../utils/format.js'

const categories = ['Kitchen', 'Living room', 'Bedroom', 'Bathroom', 'Utilities', 'Other']

// The group's shared shopping list.
// Items live in React state for now, so changes reset when you refresh.
// TODO: Load, add, and update items through the backend instead.
function Items() {
  const [items, setItems] = useState(sampleItems)
  const [name, setName] = useState('')
  const [category, setCategory] = useState(categories[0])
  const [price, setPrice] = useState('')

  function handleAdd(event) {
    event.preventDefault()
    const newItem = {
      id: Date.now(),
      name,
      category,
      price: Number(price) || 0,
      status: 'needed',
      addedBy: currentUser.name,
    }
    setItems([...items, newItem])
    setName('')
    setPrice('')
  }

  function toggleBought(id) {
    setItems(
      items.map((item) =>
        item.id === id
          ? { ...item, status: item.status === 'bought' ? 'needed' : 'bought' }
          : item,
      ),
    )
  }

  return (
    <>
      <PageHeader title="Shared list" subtitle="Everything your group needs for the new place." />

      <form className="card inline-form" onSubmit={handleAdd}>
        <label className="field">
          Item
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Est. price
          <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary">Add item</button>
      </form>

      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Bought</th>
              <th>Item</th>
              <th>Category</th>
              <th>Est. price</th>
              <th>Added by</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className={item.status === 'bought' ? 'is-done' : ''}>
                <td>
                  <input
                    type="checkbox"
                    checked={item.status === 'bought'}
                    onChange={() => toggleBought(item.id)}
                    aria-label={`Mark ${item.name} as bought`}
                  />
                </td>
                <td>{item.name}</td>
                <td>{item.category}</td>
                <td>{formatMoney(item.price)}</td>
                <td>{item.addedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default Items
