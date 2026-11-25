import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatMoney } from '../utils/format.js'
import { Icon } from './Icons.jsx'

// The boxes Dolly's tools add under her replies: products she found (to
// choose from), an item she suggests for the list, or a change she made to
// the list. Each card has
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
  if (card.type === 'products') return <ProductOptionsCard card={card} actions={actions} />
  // Chats from before options were added have one product per card.
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
// Right after you add it, says so with a short "Added" confirmation.
function AddButton({ name, body, actions }) {
  const [adding, setAdding] = useState(false)
  const [justAdded, setJustAdded] = useState(false)
  if (actions.onList(name)) {
    return (
      <span className={justAdded ? 'dolly-card-added just-saved' : 'dolly-card-added'} role="status">
        <Icon name="check" size={16} />
        {justAdded ? `Added ${name} to your list` : 'On the list'}
        <Link className="btn-link" to="/items">View list</Link>
      </span>
    )
  }
  async function add() {
    setAdding(true)
    const ok = await actions.addItem(body)
    setAdding(false)
    if (ok) setJustAdded(true)
  }
  return (
    <button type="button" className="btn btn-primary btn-small" onClick={add} disabled={adding}>
      {adding ? 'Adding...' : `Add ${name} to list`}
    </button>
  )
}

// A small "open the store's page" button, for next to Choose / Add.
function ViewLink({ url, retailer, label = false }) {
  return (
    <a
      className={label ? 'btn btn-ghost btn-small view-link' : 'icon-btn view-link'}
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`View at ${retailer} (opens in a new tab)`}
      title={`View at ${retailer}`}
    >
      {label && `View at ${retailer}`}
      <Icon name="external" size={16} />
    </a>
  )
}

// The product's picture, or a placeholder with the store's name if there
// isn't one (some stores don't let us read their pages) or it doesn't load.
// The picture fades in once it has loaded.
function ProductImage({ src, retailer }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  if (!src || failed) {
    return (
      <div className="option-placeholder">
        <Icon name="image" size={22} />
        <span>{retailer}</span>
      </div>
    )
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className={loaded ? 'is-loaded' : ''}
      // Some stores refuse images requested from other sites.
      referrerPolicy="no-referrer"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  )
}

function ProductCard({ card, actions }) {
  // No item_id: it's for something not on the list yet, so it can be added
  // (with this product saved as its option).
  const newItem = card.item_id === null || card.item_id === undefined
  return (
    <div className="dolly-card product-card">
      <a className="option-image" href={card.url} target="_blank" rel="noreferrer" tabIndex={-1} aria-hidden="true">
        <ProductImage src={card.image_url} retailer={card.retailer} />
      </a>
      <div>
        <p className="dolly-card-label">
          {newItem ? <>New item: <strong>{card.item_name}</strong></> : <>For <strong>{card.item_name}</strong></>}
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
          <ViewLink url={card.url} retailer={card.retailer} label />
        </div>
      </div>
    </div>
  )
}

// Products Dolly found for one item, side by side. The user picks one:
// it becomes the item's chosen product (or, for something not on the list
// yet, picking one adds the item). Once saved, the card says so.
function ProductOptionsCard({ card, actions }) {
  const [choosing, setChoosing] = useState(null) // product_id being saved
  const [saved, setSaved] = useState(null) // the option just saved
  const item = actions.itemFor(card)
  const onList = Boolean(item || card.item_id)

  async function choose(option) {
    setChoosing(option.product_id)
    const ok = await actions.chooseProduct(card, option)
    setChoosing(null)
    if (ok) setSaved(option)
  }

  return (
    <div className="dolly-card dolly-options">
      <p className="dolly-card-label">
        Options for <strong>{card.item_name}</strong>
        {onList ? ' · pick one' : ' · picking one adds it to your list'}
      </p>
      <div className="option-grid">
        {card.options.map((option) => {
          const chosen = item?.selected_product_id === option.product_id
          return (
            <div key={option.product_id} className={chosen ? 'option chosen' : 'option'}>
              <a className="option-image" href={option.url} target="_blank" rel="noreferrer" tabIndex={-1} aria-hidden="true">
                <ProductImage src={option.image_url} retailer={option.retailer} />
                {chosen && (
                  <span className="option-badge">
                    <Icon name="check" size={14} />Picked
                  </span>
                )}
              </a>
              <a className="option-title" href={option.url} target="_blank" rel="noreferrer">
                {option.title}
              </a>
              <p className="option-meta">
                <strong>{money(option.price)}</strong> at {option.retailer}
              </p>
              <div className="option-actions">
                {chosen ? (
                  <span className="dolly-card-added">
                    <Icon name="check" size={16} />Your pick
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    onClick={() => choose(option)}
                    disabled={choosing !== null}
                  >
                    {choosing === option.product_id ? 'Saving...' : 'Choose this'}
                  </button>
                )}
                <ViewLink url={option.url} retailer={option.retailer} />
              </div>
            </div>
          )
        })}
      </div>
      {saved && (
        <SaveToast
          key={saved.product_id}
          option={saved}
          itemName={card.item_name}
          onDone={() => setSaved(null)}
        />
      )}
    </div>
  )
}

// "Saved to your Shared List": pops up under the options after a pick, with
// the product's picture, and goes away by itself after 20 seconds. The thin
// line along the bottom shows the time left; hovering or focusing it pauses.
const TOAST_MS = 20000

function SaveToast({ option, itemName, onDone }) {
  const [leaving, setLeaving] = useState(false)
  const done = useRef(onDone)
  const toastRef = useRef(null)
  useEffect(() => {
    done.current = onDone
  })

  function dismiss() {
    setLeaving(true)
  }

  // Scroll the chat so the toast isn't hidden behind the message box.
  useEffect(() => {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    toastRef.current?.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // With less motion the countdown line doesn't animate, so use a timer.
  useEffect(() => {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setTimeout(() => setLeaving(true), TOAST_MS)
    return () => clearTimeout(id)
  }, [])

  return (
    <div
      ref={toastRef}
      className={leaving ? 'save-toast leaving' : 'save-toast'}
      role="status"
      style={{ '--toast-ms': `${TOAST_MS}ms` }}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && leaving) done.current()
      }}
    >
      <span className="save-toast-thumb">
        <ProductImage src={option.image_url} retailer={option.retailer} />
        <span className="save-toast-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </span>
      </span>
      <span className="save-toast-text">
        <strong>Saved to your Shared List</strong>
        <span>
          {option.title} · as your {itemName}
        </span>
      </span>
      <Link className="btn btn-ghost btn-small" to="/items">
        View list
      </Link>
      <button type="button" className="icon-btn save-toast-close" onClick={dismiss} aria-label="Dismiss">
        <Icon name="plus" size={16} />
      </button>
      <span
        className="save-toast-timer"
        aria-hidden="true"
        onAnimationEnd={(e) => {
          e.stopPropagation()
          dismiss()
        }}
      />
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
    <div className={card.action === 'removed' ? 'dolly-card dolly-card-small' : 'dolly-card dolly-card-small is-done'}>
      {card.action !== 'removed' && <Icon name="check" size={16} />}
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
