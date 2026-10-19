import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOutletContext } from 'react-router-dom'
import NoGroup from '../components/NoGroup.jsx'
import MoneyInput from '../components/MoneyInput.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { api } from '../api.js'
import { useApi } from '../hooks/useApi.js'
import { CURRENCY, formatMoney } from '../utils/format.js'

// The group's shared shopping list: search/filter it, add items, check them
// off, assign who's getting each one, and remove them.
function SharedList() {
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

  const [error, setError] = useState('')
  const [itemDialog, setItemDialog] = useState(null)

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

  function updateItem(item, changes) {
    save(() => api(`/moves/${moveId}/items/${item.item_id}`, { method: 'PATCH', body: changes }))
  }

  async function saveItemDetails(item, changes) {
    const path = item ? `/moves/${moveId}/items/${item.item_id}` : `/moves/${moveId}/items`
    await api(path, {
      method: item ? 'PATCH' : 'POST',
      body: changes,
    })
    items.reload()
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
            {items.loading ? 'Loading…' : filtering ? 'No items match.' : 'Nothing on the list yet. Add the first item below.'}
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
                <th><span className="visually-hidden">Item actions</span></th>
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
                  <td className="item-name-cell">
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
                    <div className="item-actions">
                      <button
                        type="button"
                        className="item-action-button item-action-edit"
                        onClick={() => setItemDialog({ mode: 'edit', item })}
                        aria-label={`Edit ${item.name}`}
                        title={`Edit ${item.name}`}
                      >
                        <img src="/pencil.svg" alt="" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="item-action-button item-action-remove"
                        onClick={() => removeItem(item)}
                        aria-label={`Remove ${item.name}`}
                        title={`Remove ${item.name}`}
                      >
                        <img src="/trash.svg" alt="" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="add-item-action">
          <button type="button" className="btn btn-primary" onClick={() => setItemDialog({ mode: 'add' })}>
            Add item
          </button>
        </div>
      </div>

      {itemDialog && (
        <ItemModal
          key={itemDialog.mode === 'edit' ? `edit-${itemDialog.item.item_id}` : 'add'}
          item={itemDialog.mode === 'edit' ? itemDialog.item : null}
          categories={categories.data ?? []}
          members={members}
          onCancel={() => setItemDialog(null)}
          onConfirm={(changes) => saveItemDetails(itemDialog.item ?? null, changes)}
        />
      )}
    </>
  )
}

function ItemModal({ item, categories, members, onCancel, onConfirm }) {
  const isEditing = Boolean(item)
  const dialogRef = useRef(null)
  const [name, setName] = useState(item?.name ?? '')
  const [categoryId, setCategoryId] = useState(item?.category_id == null ? '' : String(item.category_id))
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1))
  const [price, setPrice] = useState(item?.est_cost == null ? '' : String(item.est_cost))
  const [responsibleId, setResponsibleId] = useState(
    item?.responsible_user_id == null ? '' : String(item.responsible_user_id),
  )
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => {
      if (dialog?.open) dialog.close()
    }
  }, [])

  function close() {
    if (!saving) onCancel()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onConfirm({
        name: name.trim(),
        category_id: categoryId ? Number(categoryId) : null,
        quantity: Number(quantity),
        est_cost: price === '' ? null : Number(price),
        responsible_user_id: responsibleId ? Number(responsibleId) : null,
        notes: notes.trim() || null,
      })
      onCancel()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="item-edit-dialog"
      aria-labelledby="item-dialog-title"
      aria-describedby="item-dialog-description"
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
    >
      <h2 id="item-dialog-title">{isEditing ? 'Edit item' : 'Add item'}</h2>
      <p id="item-dialog-description" className="muted">
        {isEditing ? `Update the details for ${item.name}.` : 'Add an item to your group’s list.'}
      </p>

      <form onSubmit={handleSubmit}>
        <div className="item-edit-fields">
          <label className="field item-edit-wide">
            Item
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={150}
              required
              autoFocus
              spellCheck={true}
              autoCorrect="on"
              autoCapitalize="sentences"
              lang="en"
            />
          </label>
          <label className="field">
            Category
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">—</option>
              {categories.map((category) => (
                <option key={category.category_id} value={category.category_id}>{category.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Quantity
            <input
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              required
            />
          </label>
          <label className="field">
            Est. price ({CURRENCY})
            <MoneyInput value={price} onChange={(event) => setPrice(event.target.value)} />
          </label>
          <label className="field">
            Who's getting it
            <select value={responsibleId} onChange={(event) => setResponsibleId(event.target.value)}>
              <option value="">Anyone</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>{member.name}</option>
              ))}
            </select>
          </label>
          <label className="field item-edit-wide">
            Notes
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
          </label>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="item-edit-actions">
          <button type="button" className="btn btn-ghost" onClick={close} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEditing ? 'Confirm' : 'Add item'}
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  )
}

export default SharedList
