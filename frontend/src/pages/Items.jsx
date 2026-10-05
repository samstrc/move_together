import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import NoGroup from '../components/NoGroup.jsx'
import MoneyInput from '../components/MoneyInput.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { api } from '../api.js'
import { useApi } from '../hooks/useApi.js'
import { CURRENCY, formatMoney } from '../utils/format.js'

// The group's shared shopping list: search/filter it, add items, check them
// off, assign who's getting each one, and remove them.
function Items() {
  const { move } = useOutletContext()
  const moveId = move?.move_id

  // Filters. Changing one changes the URL below, which reloads the list.
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const params = new URLSearchParams()
  if (search.trim()) params.set('q', search.trim())
  if (statusFilter) params.set('status', statusFilter)
  if (categoryFilter) params.set('category_id', categoryFilter)

  const items = useApi(moveId ? `/moves/${moveId}/items?${params}` : null)
  const categories = useApi('/categories')
  const details = useApi(moveId ? `/moves/${moveId}` : null) // for the members list

  // "Add item" form
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [price, setPrice] = useState('')
  const [responsibleId, setResponsibleId] = useState('')
  const [error, setError] = useState('')

  if (!move) return <NoGroup title="Shared list" />

  const members = details.data?.members ?? []

  // Runs a change on the backend, then reloads the list (or shows the error).
  async function save(request) {
    setError('')
    try {
      await request()
      items.reload()
    } catch (err) {
      setError(err.message)
    }
  }

  function handleAdd(event) {
    event.preventDefault()
    save(async () => {
      await api(`/moves/${moveId}/items`, {
        method: 'POST',
        body: {
          name,
          category_id: categoryId ? Number(categoryId) : null,
          est_cost: price === '' ? null : Number(price),
          responsible_user_id: responsibleId ? Number(responsibleId) : null,
        },
      })
      setName('')
      setPrice('')
    })
  }

  function updateItem(item, changes) {
    save(() => api(`/moves/${moveId}/items/${item.item_id}`, { method: 'PATCH', body: changes }))
  }

  function removeItem(item) {
    if (!window.confirm(`Remove "${item.name}" from the list?`)) return
    save(() => api(`/moves/${moveId}/items/${item.item_id}`, { method: 'DELETE' }))
  }

  const itemList = items.data ?? []
  const filtering = search || statusFilter || categoryFilter

  return (
    <>
      <PageHeader title="Shared list" subtitle="Everything your group needs for the new place." />

      <form className="card inline-form" onSubmit={handleAdd}>
        <label className="field">
          Item
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            spellCheck={true}
            autoCorrect="on"
            autoCapitalize="sentences"
            lang="en"
            required
          />
        </label>
        <label className="field">
          Category
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">—</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.category_id} value={c.category_id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Est. price ({CURRENCY})
          <MoneyInput value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="field">
          Who's getting it
          <select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
            <option value="">Anyone</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.name}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary">Add item</button>
      </form>

      {(error || items.error) && <p className="form-error">{error || items.error}</p>}

      <div className="card table-card">
        <div className="inline-form filters">
          <label className="field">
            Search
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. couch" />
          </label>
          <label className="field">
            Status
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="needed">Still needed</option>
              <option value="bought">Bought</option>
            </select>
          </label>
          <label className="field">
            Category
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.category_id} value={c.category_id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>

        {itemList.length === 0 ? (
          <p className="muted">
            {items.loading ? 'Loading…' : filtering ? 'No items match.' : 'Nothing on the list yet. Add the first item above.'}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Bought</th>
                <th>Item</th>
                <th>Category</th>
                <th>Est. price</th>
                <th>Who's getting it</th>
                <th>Added by</th>
                <th><span className="visually-hidden">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {itemList.map((item) => (
                <tr key={item.item_id} className={item.status === 'bought' ? 'is-done' : ''}>
                  <td>
                    <input
                      type="checkbox"
                      checked={item.status === 'bought'}
                      onChange={() => updateItem(item, { status: item.status === 'bought' ? 'needed' : 'bought' })}
                      aria-label={`Mark ${item.name} as bought`}
                    />
                  </td>
                  <td>
                    {item.name}
                    {item.quantity > 1 && <span className="muted"> ×{item.quantity}</span>}
                  </td>
                  <td>{item.category ?? '—'}</td>
                  <td>{item.est_cost === null ? '—' : formatMoney(item.est_cost)}</td>
                  <td>
                    <select
                      className="table-select"
                      value={item.responsible_user_id ?? ''}
                      onChange={(e) => updateItem(item, { responsible_user_id: e.target.value ? Number(e.target.value) : null })}
                      aria-label={`Who's getting ${item.name}`}
                    >
                      <option value="">Anyone</option>
                      {members.map((m) => (
                        <option key={m.user_id} value={m.user_id}>{m.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>{item.added_by ?? 'Dolly'}</td>
                  <td>
                    <button type="button" className="btn-link" onClick={() => removeItem(item)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default Items
