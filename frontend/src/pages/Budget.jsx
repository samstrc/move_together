import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import MoneyInput from '../components/MoneyInput.jsx'
import NoGroup from '../components/NoGroup.jsx'
import PageHeader from '../components/PageHeader.jsx'
import SettleUp from '../components/SettleUp.jsx'
import { api } from '../api.js'
import { useApi } from '../hooks/useApi.js'
import { CURRENCY, formatDate, formatMoney } from '../utils/format.js'

function today() {
  return new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time
}

// Group budget: budgets per category, what's been spent, and who owes what.
function Budget() {
  const { user, move } = useOutletContext()
  const moveId = move?.move_id
  const summary = useApi(moveId ? `/moves/${moveId}/budget` : null)
  const expenses = useApi(moveId ? `/moves/${moveId}/expenses` : null)
  const categories = useApi('/categories')
  const [error, setError] = useState('')

  // "Log expense" form
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [expenseCategory, setExpenseCategory] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [date, setDate] = useState(today)
  // How to split it: 'everyone' (by each person's share), 'some' (evenly
  // between the people ticked in splitWith), or 'custom' (exact amounts).
  const [splitMode, setSplitMode] = useState('everyone')
  const [splitWith, setSplitWith] = useState([])
  const [customAmounts, setCustomAmounts] = useState({})

  // "Set a category budget" form
  const [budgetCategory, setBudgetCategory] = useState('')
  const [budgetAmount, setBudgetAmount] = useState('')

  if (!move) return <NoGroup title="Budget" />

  // Runs a change on the backend, then reloads both lists (or shows the error).
  async function save(request) {
    setError('')
    try {
      await request()
      summary.reload()
      expenses.reload()
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }

  async function handleLogExpense(event) {
    event.preventDefault()
    const saved = await save(() =>
      api(`/moves/${moveId}/expenses`, {
        method: 'POST',
        body: {
          description,
          amount: Number(amount),
          category_id: expenseCategory ? Number(expenseCategory) : null,
          paid_by: paidBy ? Number(paidBy) : null, // null = me
          expense_date: date,
          ...splitOption(),
        },
      }),
    )
    if (saved) {
      setDescription('')
      setAmount('')
      setSplitMode('everyone')
      setSplitWith([])
      setCustomAmounts({})
      setShowExpenseForm(false)
    }
  }

  // The part of the request that says how to split the expense.
  function splitOption() {
    if (splitMode === 'some') return { split_between: splitWith }
    if (splitMode === 'custom') {
      return {
        custom_splits: currentMembers.map((m) => ({
          user_id: m.user_id,
          amount: Number(customAmounts[m.user_id] || 0),
        })),
      }
    }
    return {} // everyone, by share
  }

  function toggleSplitWith(userId) {
    setSplitWith(splitWith.includes(userId) ? splitWith.filter((id) => id !== userId) : [...splitWith, userId])
  }

  async function handleSetBudget(event) {
    event.preventDefault()
    const saved = await save(() =>
      api(`/moves/${moveId}/budgets/${budgetCategory}`, { method: 'PUT', body: { amount: Number(budgetAmount) } }),
    )
    if (saved) setBudgetAmount('')
  }

  function removeBudget(category) {
    if (!window.confirm(`Remove the ${category.name} budget? Its expenses are kept.`)) return
    save(() => api(`/moves/${moveId}/budgets/${category.category_id}`, { method: 'DELETE' }))
  }

  function deleteExpense(expense) {
    if (!window.confirm(`Delete "${expense.description}" (${formatMoney(expense.amount)})?`)) return
    save(() => api(`/moves/${moveId}/expenses/${expense.expense_id}`, { method: 'DELETE' }))
  }

  const totals = summary.data?.totals ?? { budget: 0, spent: 0 }
  const remaining = totals.budget - totals.spent
  const percentSpent = totals.budget > 0 ? Math.min(100, Math.round((totals.spent / totals.budget) * 100)) : 0
  const categoryRows = summary.data?.categories ?? []
  const members = summary.data?.members ?? [] // includes people who left but still owe/are owed
  const currentMembers = members.filter((m) => m.is_member)
  const customTotal = currentMembers.reduce((total, m) => total + Number(customAmounts[m.user_id] || 0), 0)
  const customLeft = Math.round((Number(amount || 0) - customTotal) * 100) / 100
  const expenseList = expenses.data ?? []

  return (
    <>
      <PageHeader title="Budget" subtitle="Keep spending on track as a group.">
        <button className="btn btn-primary" onClick={() => setShowExpenseForm(!showExpenseForm)}>
          {showExpenseForm ? 'Cancel' : 'Log expense'}
        </button>
      </PageHeader>

      {showExpenseForm && (
        <form className="card" onSubmit={handleLogExpense}>
          <div className="inline-form">
            <label className="field">
              What was it?
              <input value={description} onChange={(e) => setDescription(e.target.value)} required />
            </label>
            <label className="field">
              Amount ({CURRENCY})
              <MoneyInput min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </label>
            <label className="field">
              Category
              <select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}>
                <option value="">—</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.category_id} value={c.category_id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Paid by
              <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
                <option value="">Me</option>
                {currentMembers
                  .filter((m) => m.user_id !== user?.user_id)
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>{m.name}</option>
                  ))}
              </select>
            </label>
            <label className="field">
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
          </div>

          <fieldset className="split-options">
            <legend>Split it</legend>
            <label>
              <input type="radio" name="split" checked={splitMode === 'everyone'} onChange={() => setSplitMode('everyone')} />
              {' '}Between everyone, by each person's share (set on the Group page)
            </label>
            <label>
              <input type="radio" name="split" checked={splitMode === 'some'} onChange={() => setSplitMode('some')} />
              {' '}Evenly between only some people
            </label>
            <label>
              <input type="radio" name="split" checked={splitMode === 'custom'} onChange={() => setSplitMode('custom')} />
              {' '}Custom amounts
            </label>

            {splitMode === 'some' && (
              <div className="split-people">
                {currentMembers.map((m) => (
                  <label key={m.user_id}>
                    <input type="checkbox" checked={splitWith.includes(m.user_id)} onChange={() => toggleSplitWith(m.user_id)} />
                    {' '}{m.name}
                  </label>
                ))}
              </div>
            )}

            {splitMode === 'custom' && (
              <div className="split-people">
                {currentMembers.map((m) => (
                  <label key={m.user_id} className="split-amount">
                    {m.name}
                    <MoneyInput
                      value={customAmounts[m.user_id] ?? ''}
                      onChange={(e) => setCustomAmounts({ ...customAmounts, [m.user_id]: e.target.value })}
                    />
                  </label>
                ))}
                <p className={customLeft === 0 ? 'muted' : 'owes'}>
                  {customLeft === 0
                    ? 'Adds up to the total.'
                    : customLeft > 0
                      ? `${formatMoney(customLeft)} left to assign`
                      : `${formatMoney(-customLeft)} too much`}
                </p>
              </div>
            )}
          </fieldset>

          <button type="submit" className="btn btn-primary">Save expense</button>
        </form>
      )}

      {(error || summary.error || expenses.error) && (
        <p className="form-error">{error || summary.error || expenses.error}</p>
      )}

      <section className="card">
        <div className="budget-numbers">
          <div>
            <p className="stat-label">Total budget</p>
            <p className="stat-value">{formatMoney(totals.budget)}</p>
          </div>
          <div>
            <p className="stat-label">Spent</p>
            <p className="stat-value">{formatMoney(totals.spent)}</p>
          </div>
          <div>
            <p className="stat-label">Remaining</p>
            <p className="stat-value">{formatMoney(remaining)}</p>
          </div>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={percentSpent} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${percentSpent}%` }} />
        </div>
        <p className="muted">
          {totals.budget > 0 ? `${percentSpent}% of the budget used` : 'Set a category budget below to start tracking.'}
        </p>
      </section>

      <div className="two-column align-top">
        <section className="card table-card">
          <h2>By category</h2>
          {categoryRows.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Budget</th>
                  <th>Spent</th>
                  <th>Left</th>
                  <th><span className="visually-hidden">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {categoryRows.map((c) => (
                  <tr key={c.category_id}>
                    <td>{c.name}</td>
                    <td>{c.budget === null ? '—' : formatMoney(c.budget)}</td>
                    <td>{formatMoney(c.spent)}</td>
                    <td className={c.budget !== null && c.spent > c.budget ? 'over-budget' : ''}>
                      {c.budget === null ? '—' : formatMoney(c.budget - c.spent)}
                    </td>
                    <td>
                      {c.budget !== null && (
                        <button type="button" className="btn-link" onClick={() => removeBudget(c)}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <form className="inline-form budget-form" onSubmit={handleSetBudget}>
            <label className="field">
              Category
              <select value={budgetCategory} onChange={(e) => setBudgetCategory(e.target.value)} required>
                <option value="">Choose…</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.category_id} value={c.category_id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Budget ({CURRENCY})
              <MoneyInput value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} required />
            </label>
            <button type="submit" className="btn btn-ghost">Set budget</button>
          </form>
        </section>

        <SettleUp
          moveId={moveId}
          user={user}
          members={members}
          suggestions={summary.data?.settle_up ?? []}
          onChanged={summary.reload}
        />
      </div>

      <section className="card table-card">
        <h2>Expenses</h2>
        {expenseList.length === 0 ? (
          <p className="muted">{expenses.loading ? 'Loading…' : 'No expenses yet.'}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Paid by</th>
                <th>Amount</th>
                <th><span className="visually-hidden">Delete</span></th>
              </tr>
            </thead>
            <tbody>
              {expenseList.map((expense) => (
                <tr key={expense.expense_id}>
                  <td>{formatDate(expense.expense_date)}</td>
                  <td>
                    {expense.description}
                    {expense.category && <span className="muted"> · {expense.category}</span>}
                    {expense.splits && (
                      <span className="split-summary">
                        Split: {expense.splits.map((s) => `${s.name.split(' ')[0]} ${formatMoney(s.amount)}`).join(', ')}
                      </span>
                    )}
                  </td>
                  <td>{expense.paid_by}</td>
                  <td>{formatMoney(expense.amount)}</td>
                  <td>
                    <button type="button" className="btn-link" onClick={() => deleteExpense(expense)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}

export default Budget
