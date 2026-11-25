import { Link, useOutletContext } from 'react-router-dom'

import PageHeader from '../components/PageHeader.jsx'
import { Icon } from '../components/Icons.jsx'
import { useApi } from '../hooks/useApi.js'
import { useCountUp } from '../hooks/useCountUp.js'
import { formatMoney } from '../utils/format.js'

// Whole dollars for the big numbers and the category list ("$1,620").
function dollars(amount) {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function Dashboard() {
  const { user, move } = useOutletContext()

  // A new group gets fresh request state instead of the previous group's data.
  return <DashboardContent key={move?.move_id ?? 'no-group'} user={user} move={move} />
}

function DashboardContent({ user, move }) {
  const firstName = user ? user.name.split(' ')[0] : ''
  const moveId = move?.move_id

  const summary = useApi(moveId ? `/moves/${moveId}/budget` : null)

  const categories = (summary.data?.categories ?? []).map((row) => ({
    name: row.name,
    budget: row.budget === null ? null : Number(row.budget),
    spent: Number(row.spent ?? 0),
  }))

  // Over budget, or 80%+ of it used. Worst first.
  const attention = categories
    .filter(({ spent, budget }) => budget !== null && (spent > budget || (budget > 0 && spent >= budget * 0.8)))
    .map((row) => ({ ...row, over: row.spent > row.budget }))
    .sort((a, b) => b.spent / (b.budget || 1) - a.spent / (a.budget || 1))

  const totals = summary.data?.totals
  const totalBudget = Number(totals?.budget ?? 0)
  const totalSpent = Number(totals?.spent ?? 0)
  const stats = summary.data?.expense_stats

  // Messages shown in place of the data while there's nothing to show.
  const placeholder = !moveId
    ? 'Create, join, or select a group to see your budget here.'
    : summary.error
      ? null
      : summary.loading
        ? 'Loading…'
        : null

  return (
    <>
      <PageHeader
        title={`Welcome back${firstName ? `, ${firstName}` : ''}`}
        subtitle={move ? `You're planning ${move.name}.` : 'No group selected yet.'}
      />

      <div className="stack">
        {summary.error && <p className="form-error">{summary.error}</p>}

        <section className="card attention" aria-labelledby="attention-heading">
          <div className="card-head">
            <h2 id="attention-heading">Needs attention</h2>
            {attention.length > 0 && (
              <span className="meta">{attention.length} of {categories.length} categories</span>
            )}
          </div>
          <div aria-live="polite">
            {placeholder ? (
              <p className="muted attention-empty">{placeholder}</p>
            ) : attention.length === 0 ? (
              <p className="attention-empty all-good">
                <Icon name="check" size={18} />
                {categories.length === 0
                  ? 'Nothing yet. Set a category budget to start tracking.'
                  : 'All categories are within budget.'}
              </p>
            ) : (
              attention.map((row, index) => (
                <Link
                  key={row.name}
                  to="/budget"
                  className={row.over ? 'alert over' : 'alert warn'}
                  style={{ '--i': index }}
                  aria-label={
                    row.over
                      ? `${row.name}: ${dollars(row.spent - row.budget)} over budget. Review in Budget`
                      : `${row.name}: ${Math.round((row.spent / row.budget) * 100)}% of budget used. Review in Budget`
                  }
                >
                  <div>
                    <p className="alert-name">{row.name}</p>
                    <p className="alert-sub money">{dollars(row.spent)} spent of {dollars(row.budget)}</p>
                  </div>
                  <span className="alert-status money">
                    {row.over ? `${dollars(row.spent - row.budget)} over` : `${Math.round((row.spent / row.budget) * 100)}% used`}
                  </span>
                  <Icon name="chevronRight" className="alert-go" />
                </Link>
              ))
            )}
          </div>
        </section>

        {moveId && !summary.loading && !summary.error && (
          <section className="stats" aria-label="Key numbers">
            <LeftToSpend budget={totalBudget} spent={totalSpent} />
            <div className="card taped stat" style={{ '--i': 2 }}>
              <h2 className="stat-label">Largest expense</h2>
              <CountUpMoney className="stat-value mid" amount={Number(stats?.maximum ?? 0)} />
              {Number(stats?.minimum ?? 0) > 0 && (
                <p className="stat-minor money">Smallest: {formatMoney(Number(stats.minimum))}</p>
              )}
            </div>
          </section>
        )}

        <section className="card chart-card" aria-labelledby="chart-heading">
          <div className="card-head">
            <h2 id="chart-heading">Spending by category</h2>
            {categories.length > 0 && <span className="meta">Spent / budget</span>}
          </div>

          {placeholder ? (
            <p className="muted">{placeholder}</p>
          ) : summary.error ? null : categories.length === 0 ? (
            <p className="muted">
              No budget or expense data yet. Add a category budget or log an expense to see it here.
            </p>
          ) : (
            <>
              <ul className="cat-list">
                {categories.map((row, index) => {
                  const over = row.budget !== null && row.spent > row.budget
                  const pct = row.budget ? Math.min(row.spent / row.budget, 1) * 100 : row.spent > 0 ? 100 : 0
                  return (
                    <li key={row.name} className={over ? 'cat-row is-over' : 'cat-row'} style={{ '--i': index }}>
                      <span className="cat-name">{row.name}</span>
                      <span
                        className="track"
                        role="img"
                        aria-label={
                          row.budget
                            ? `${row.name}: ${Math.round((row.spent / row.budget) * 100)}% of budget used`
                            : `${row.name}: no budget set`
                        }
                      >
                        <span className={row.budget === null ? 'fill no-budget' : 'fill'} style={{ '--pct': `${pct}%` }} />
                      </span>
                      <span className="cat-val money">
                        <span>
                          <strong>{dollars(row.spent)}</strong>
                          {row.budget !== null && ` / ${dollars(row.budget)}`}
                        </span>
                        {row.budget === null ? (
                          <span className="status">No budget</span>
                        ) : over ? (
                          <span className="status over">{dollars(row.spent - row.budget)} over</span>
                        ) : (
                          <span className="status">{dollars(row.budget - row.spent)} left</span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <div className="cat-total money">
                <span>Total</span>
                <span>
                  <strong>{dollars(totalSpent)}</strong> / {dollars(totalBudget)}
                </span>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  )
}

function LeftToSpend({ budget, spent }) {
  const left = budget - spent
  // No budget yet: show what's been spent instead of "over budget".
  const label = budget === 0 ? 'Spent so far' : left >= 0 ? 'Left to spend' : 'Over budget'
  const shown = useCountUp(budget === 0 ? spent : Math.abs(left))
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0
  return (
    <div className="card taped stat" style={{ '--i': 1 }}>
      <h2 className="stat-label">{label}</h2>
      <p className={budget > 0 && left < 0 ? 'stat-value is-over' : 'stat-value'}>{dollars(Math.round(shown))}</p>
      {budget > 0 ? (
        <>
          <div className="meter" aria-hidden="true">
            <span className={left < 0 ? 'is-over' : ''} style={{ width: `${pct}%` }} />
          </div>
          <p className="stat-note money">
            {dollars(spent)} spent of {dollars(budget)} ({Math.round((spent / budget) * 100)}%)
          </p>
        </>
      ) : (
        <p className="stat-note">
          No budget set yet. <Link to="/budget">Set one</Link>
        </p>
      )}
    </div>
  )
}

function CountUpMoney({ amount, className }) {
  const shown = useCountUp(amount)
  return <p className={className}>{dollars(Math.round(shown))}</p>
}

export default Dashboard
