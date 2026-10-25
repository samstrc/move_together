import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [notesItem, setNotesItem] = useState(null)
  const [sort, setSort] = useState(null)

  const itemList = useMemo(() => sortItems(items.data ?? [], sort), [items.data, sort])

  if (!move) return <NoGroup title="Shared List" />

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

  function cycleSort(key) {
    setSort((current) => {
      if (!current || current.key !== key) return { key, direction: 'asc' }
      if (current.direction === 'asc') return { key, direction: 'desc' }
      return null
    })
  }

  const filtering = search || statusFilter || categoryFilter

  return (
    <>
      <PageHeader title="Shared List" subtitle="Everything your group needs for the new place." />

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
                <SortableHeader label="Bought" sortKey="bought" sort={sort} onSort={cycleSort} />
                <SortableHeader label="Item" sortKey="name" sort={sort} onSort={cycleSort} />
                <SortableHeader label="Category" sortKey="category" sort={sort} onSort={cycleSort} />
                <SortableHeader label="Est. price" sortKey="price" sort={sort} onSort={cycleSort} />
                <SortableHeader label="Who's getting it" sortKey="responsible" sort={sort} onSort={cycleSort} />
                <SortableHeader label="Added by" sortKey="addedBy" sort={sort} onSort={cycleSort} />
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
                        className="item-action-button item-action-note"
                        onClick={() => setNotesItem(item)}
                        aria-label={`View notes for ${item.name}`}
                        title={`View note for ${item.name}`}
                      >
                        <img src="/note.svg" alt="" aria-hidden="true" />
                      </button>
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
            Add Item
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
      {notesItem && (
        <NotesModal item={notesItem} onClose={() => setNotesItem(null)} />
      )}
    </>
  )
}

function SortableHeader({ label, sortKey, sort, onSort }) {
  const isActive = sort?.key === sortKey
  const indicator = isActive ? (sort.direction === 'asc' ? '↑' : '↓') : '–'
  const currentOrder = isActive ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'natural order'

  return (
    <th scope="col">
      {label}{' '}
      <button
        type="button"
        className="sort-toggle"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}; currently ${currentOrder}. Click to change order.`}
        title={`Sort by ${label}`}
      >
        {indicator}
      </button>
    </th>
  )
}

function sortItems(items, sort) {
  if (!sort) return items

  const direction = sort.direction === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    const aValue = getSortValue(a, sort.key)
    const bValue = getSortValue(b, sort.key)

    // Keep missing categories and prices at the end in either direction.
    if (aValue == null && bValue == null) return 0
    if (aValue == null) return 1
    if (bValue == null) return -1

    const comparison = typeof aValue === 'number' && typeof bValue === 'number'
      ? aValue - bValue
      : String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: 'base' })
    return comparison * direction
  })
}

function getSortValue(item, key) {
  switch (key) {
    case 'bought':
      return item.status === 'bought' ? 1 : 0
    case 'name':
      return item.name ?? ''
    case 'category':
      return item.category
    case 'price':
      return item.est_cost == null ? null : Number(item.est_cost)
    case 'responsible':
      return item.responsible ?? 'Anyone'
    case 'addedBy':
      return item.added_by ?? 'Dolly'
    default:
      return ''
  }
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
      <h2 id="item-dialog-title">{isEditing ? 'Edit Item' : 'Add Item'}</h2>
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
            {saving ? 'Saving…' : isEditing ? 'Confirm' : 'Add Item'}
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  )
}

function NotesModal({ item, onClose }) {
  const dialogRef = useRef(null)
  const notes = item.notes?.trim()

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => {
      if (dialog?.open) dialog.close()
    }
  }, [])

  return createPortal(
    <dialog
      ref={dialogRef}
      className="item-notes-dialog"
      aria-labelledby="item-notes-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <h2 id="item-notes-title">Note for {item.name}</h2>
      <div className="item-notes-content">
        {notes
          ? <p>{notes}</p>
          : <p className="item-notes-empty">There is no note for this item.</p>}
      </div>
      <div className="item-edit-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} autoFocus>
          Close
        </button>
      </div>
    </dialog>,
    document.body,
  )
}

export default SharedList
