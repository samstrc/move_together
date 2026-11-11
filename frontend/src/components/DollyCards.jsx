import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatMoney } from '../utils/format.js'

// The boxes Dolly's tools add under her replies: a product she found, an item
// she suggests for the list, or a change she made to the list. Each card has
// a `type` (see save_product in backend/shopping.py and the tools in
// backend/dolly_agent.py).
//
// Dolly can't add to the list herself: suggestions have an "Add to list"
// button. Cards are saved with the chat, so the page passes in
// actions.onList(name) to tell whether something has been added since.

// Money from the API comes as a string ("99.99") or a number.
function money(amount) {
  return amount === null || amount === undefined ? '' : formatMoney(Number(amount))
}

export function DollyCard({ card, actions }) {
  if (card.type === 'product') return <ProductCard card={card} actions={actions} />
  if (card.type === 'suggested_item') return <SuggestedItemCard card={card} actions={actions} />
  if (card.type === 'item') return <ItemCard card={card} />
  return null
}

// "Kitchen · Kitchen · x2" -> "Kitchen · x2": the room often has the
// category's name.
function joinDetails(details) {
  return [...new Set(details.filter(Boolean))].join(' · ')
}

// "Add to list", or "On the list" once an item with this name is there.
function AddButton({ name, body, actions }) {
  const [adding, setAdding] = useState(false)
  if (actions.onList(name)) {
    return (
      <span className="dolly-card-added">
        ✓ On the list <Link className="btn-link" to="/items">View list</Link>
      </span>
    )
  }
  async function add() {
    setAdding(true)
    await actions.addItem(body)
    setAdding(false)
  }
  return (
    <button type="button" className="btn btn-primary btn-small" onClick={add} disabled={adding}>
      {adding ? 'Adding...' : `Add ${name} to list`}
    </button>
  )
}

function ProductCard({ card, actions }) {
  // No item_id: it's for something not on the list yet, so it can be added
  // (with this product saved as its option).
  const newItem = card.item_id === null || card.item_id === undefined
  return (
    <div className="dolly-card">
      <p className="dolly-card-label">
        {newItem ? `Product for a new item: ${card.item_name}` : `Product for ${card.item_name}`}
      </p>
      <a className="dolly-card-title" href={card.url} target="_blank" rel="noreferrer">
        {card.title}
      </a>
      <p className="dolly-card-meta">
        <strong>{money(card.price)}</strong> at {card.retailer}
      </p>
      <div className="dolly-card-row">
        {newItem && (
          <AddButton
            name={card.item_name}
            body={{
              name: card.item_name,
              category_id: card.category_id ?? null,
              est_cost: card.price,
              product_id: card.product_id,
            }}
            actions={actions}
          />
        )}
        <a
          className={newItem ? 'btn-link' : 'btn btn-primary btn-small'}
          href={card.url}
          target="_blank"
          rel="noreferrer"
        >
          View at {card.retailer}
        </a>
      </div>
    </div>
  )
}

function SuggestedItemCard({ card, actions }) {
  const { item } = card
  const details = [item.category, item.room, item.quantity > 1 && `x${item.quantity}`,
    item.est_cost && `est. ${money(item.est_cost)}`, item.responsible && `for ${item.responsible}`]
  // The body for POST /moves/{id}/items: the item without its display names.
  const body = {
    name: item.name,
    quantity: item.quantity,
    category_id: item.category_id,
    room_id: item.room_id,
    est_cost: item.est_cost,
    responsible_user_id: item.responsible_user_id,
    notes: item.notes,
    product_id: item.product_id ?? null, // a product Dolly found for it
  }
  return (
    <div className="dolly-card">
      <p className="dolly-card-label">Suggested for the list</p>
      <p className="dolly-card-title">{item.name}</p>
      {details.some(Boolean) && <p className="dolly-card-meta">{joinDetails(details)}</p>}
      {item.notes && <p className="dolly-card-meta">{item.notes}</p>}
      <div className="dolly-card-row">
        <AddButton name={item.name} body={body} actions={actions} />
      </div>
    </div>
  )
}

function ItemCard({ card }) {
  const { item } = card
  const verb = { added: 'Added', updated: 'Updated', removed: 'Removed' }[card.action]
  const details = [item.category, item.room, item.quantity > 1 && `x${item.quantity}`,
    item.est_cost && `est. ${money(item.est_cost)}`, item.status === 'bought' && 'bought']
  return (
    <div className="dolly-card dolly-card-small">
      {verb} <strong>{item.name}</strong>
      {card.action === 'removed' ? ' from the list' : ` · ${joinDetails(details)}`}
      {card.action !== 'removed' && (
        <>
          {' '}
          <Link className="btn-link" to="/items">View list</Link>
        </>
      )}
    </div>
  )
}
