import { useState } from 'react'
import { api } from '../api.js'
import { useApi } from '../hooks/useApi.js'
import { CURRENCY, formatMoney } from '../utils/format.js'
import MoneyInput from './MoneyInput.jsx'

// The "Settle up" card on the Budget page:
//   1. Who should pay whom (the fewest payments that clear every balance).
//      Payments you're part of get a "Mark as paid" button.
//   2. Everyone's balance, and how it was worked out.
//   3. A form for recording another payment you made or got, and the history.
//
// Only the person paying or the person getting paid can record or undo a
// payment (the backend checks this too).
//
// members / suggestions come from GET /moves/{id}/budget.
// onChanged: called after a payment is recorded or undone, so the page can
// reload the balances.
function SettleUp({ moveId, user, members, suggestions, onChanged }) {
  const history = useApi(`/moves/${moveId}/settlements`)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [direction, setDirection] = useState('paid') // 'paid' = I paid them, 'got' = they paid me
  const [otherPerson, setOtherPerson] = useState('')
  const [amount, setAmount] = useState('')

  const me = user?.user_id

  async function save(request) {
    setError('')
    try {
      await request()
      history.reload()
      onChanged()
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }

  function markPaid(payment) {
    save(() =>
      api(`/moves/${moveId}/settlements`, {
        method: 'POST',
        body: { from_user: payment.from_user, to_user: payment.to_user, amount: payment.amount },
      }),
    )
  }

  async function handleRecord(event) {
    event.preventDefault()
    const saved = await save(() =>
      api(`/moves/${moveId}/settlements`, {
        method: 'POST',
        body:
          direction === 'paid'
            ? { from_user: me, to_user: Number(otherPerson), amount: Number(amount) }
            : { from_user: Number(otherPerson), to_user: me, amount: Number(amount) },
      }),
    )
    if (saved) {
      setAmount('')
      setShowForm(false)
    }
  }

  function undo(payment) {
    save(() => api(`/moves/${moveId}/settlements/${payment.settlement_id}`, { method: 'DELETE' }))
  }

  // "You", or the person's first name.
  const who = (userId, name) => (userId === me ? 'You' : name.split(' ')[0])
  const whom = (userId, name) => (userId === me ? 'you' : name.split(' ')[0])

  return (
    <section className="card">
      <h2>Settle up</h2>
      {error && <p className="form-error">{error}</p>}

      {suggestions.length === 0 ? (
        <p className="settled">Everyone's square. Nobody owes anything.</p>
      ) : (
        <ul className="payment-list">
          {suggestions.map((p) => {
            const mine = p.from_user === me || p.to_user === me
            return (
              <li key={`${p.from_user}-${p.to_user}`} className={mine ? 'is-mine' : ''}>
                <span>
                  <strong>{who(p.from_user, p.from_name)}</strong>
                  {p.from_user === me ? ' pay ' : ' pays '}
                  <strong>{whom(p.to_user, p.to_name)}</strong>
                </span>
                <span className="payment-amount">{formatMoney(p.amount)}</span>
                {mine ? (
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => markPaid(p)}>
                    Mark as paid
                  </button>
                ) : (
                  <span />
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="muted">
        These are the fewest payments that even everything out. Only the two people in a payment can mark it as paid.
      </p>

      <h3>Balances</h3>
      <ul className="balance-list">
        {members.map((m) => (
          <li key={m.user_id}>
            <div>
              <span>
                {m.user_id === me ? 'You' : m.name}
                {!m.is_member && <span className="muted"> (left)</span>}
              </span>
              <span className="balance-detail">
                paid {formatMoney(m.paid)} · share {formatMoney(m.share)}
                {(m.sent > 0 || m.received > 0) &&
                  ` · paid back ${formatMoney(m.sent)} · got back ${formatMoney(m.received)}`}
              </span>
            </div>
            <span className={balanceClass(m.balance)}>{describeBalance(m.balance, m.user_id === me)}</span>
          </li>
        ))}
      </ul>

      {showForm ? (
        <form className="inline-form record-payment" onSubmit={handleRecord}>
          <label className="field">
            What happened
            <select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="paid">I paid…</option>
              <option value="got">I got paid by…</option>
            </select>
          </label>
          <label className="field">
            Who
            <select value={otherPerson} onChange={(e) => setOtherPerson(e.target.value)} required>
              <option value="">Choose…</option>
              {members
                .filter((m) => m.user_id !== me)
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.name}</option>
                ))}
            </select>
          </label>
          <label className="field">
            Amount ({CURRENCY})
            <MoneyInput min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <div className="button-row">
            <button type="submit" className="btn btn-primary btn-small">Record</button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="btn-link"
          onClick={() => setShowForm(true)}
        >
          Record another payment you made or got
        </button>
      )}

      {(history.data ?? []).length > 0 && (
        <>
          <h3>Payments</h3>
          <ul className="payment-history">
            {history.data.map((p) => (
              <li key={p.settlement_id}>
                <span>
                  {who(p.from_user, p.from_name)} paid {whom(p.to_user, p.to_name)}{' '}
                  <strong>{formatMoney(p.amount)}</strong>
                  <span className="muted"> · {new Date(p.settled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </span>
                {(p.from_user === me || p.to_user === me) && (
                  <button type="button" className="btn-link" onClick={() => undo(p)}>Undo</button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function balanceClass(balance) {
  if (balance <= -0.005) return 'balance owes'
  if (balance >= 0.005) return 'balance is-owed'
  return 'balance'
}

// "is owed $12.00" / "owes $4.50" / "settled up" (or "are owed" for you)
function describeBalance(balance, isMe) {
  if (Math.abs(balance) < 0.005) return 'settled up'
  if (balance > 0) return `${isMe ? 'are' : 'is'} owed ${formatMoney(balance)}`
  return `${isMe ? 'owe' : 'owes'} ${formatMoney(-balance)}`
}

export default SettleUp
