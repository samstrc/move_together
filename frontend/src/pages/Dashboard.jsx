import { Link, useOutletContext } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

import PageHeader from '../components/PageHeader.jsx'
import { useApi } from '../hooks/useApi.js'
import { formatMoney } from '../utils/format.js'

const sections = [
  {
    to: '/items',
    title: 'Shared list',
    text: 'Add, assign, and check off things the new place needs.',
  },
  {
    to: '/budget',
    title: 'Budget',
    text: 'Track spending against your group budget and who paid.',
  },
  {
    to: '/assistant',
    title: 'AI assistant',
    text: 'Get product recommendations and price comparisons.',
  },
  {
    to: '/group',
    title: 'Group',
    text: 'Invite members and manage move details.',
  },
]

function Dashboard() {
  const { user, move } = useOutletContext()

  // A new group gets fresh request state instead of the previous group's data.
  return <DashboardContent key={move?.move_id ?? 'no-group'} user={user} move={move} />
}

function DashboardContent({ user, move }) {
  const firstName = user ? user.name.split(' ')[0] : ''
  const moveId = move?.move_id

  const summary = useApi(
    moveId ? `/moves/${moveId}/budget` : null
  )

  const chartData = (summary.data?.categories ?? []).map((row) => ({
    category: row.name,
    budget: Number(row.budget ?? 0),
    spent: Number(row.spent ?? 0),
  }))

  const notifications = chartData
    .filter(({ spent, budget }) =>
      spent > budget || (budget > 0 && spent >= budget * 0.8)
    )
    .map((row) => ({
      ...row,
      overBudget: row.spent > row.budget,
      percentUsed: row.budget > 0
        ? `${((row.spent / row.budget) * 100).toFixed(1)}%`
        : 'N/A (zero budget)',
    }))

  return (
    <>
      <PageHeader
        title={`Welcome back${firstName ? `, ${firstName}` : ''}`}
        subtitle={
          move
            ? `You're planning ${move.name}.`
            : 'No group selected. Create, join, or select a group to see your dashboard.'
        }
      />

      <section className="section-links">
        {sections.map((section) => (
          <Link
            to={section.to}
            className="card section-link"
            key={section.to}
          >
            <h2>{section.title}</h2>
            <p>{section.text}</p>
          </Link>
        ))}
      </section>

      <section className="card" aria-labelledby="notifications-heading">
        <h2 id="notifications-heading">Alerts &amp; Notifications</h2>
        <div aria-live="polite">
          {!moveId ? (
            <p className="muted">Join a group to see budget notifications.</p>
          ) : summary.error ? (
            <p className="form-error">{summary.error}</p>
          ) : summary.loading ? (
            <p className="muted">Loading budget notifications...</p>
          ) : notifications.length === 0 ? (
            <p style={{ color: '#166534' }}>All categories are within budget</p>
          ) : (
            notifications.map((notification) => (
              <p
                key={notification.category}
                style={{
                  color: notification.overBudget ? '#991b1b' : '#854d0e',
                  backgroundColor: notification.overBudget ? '#fee2e2' : '#fef9c3',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                }}
              >
                <strong>
                  {notification.overBudget ? 'Over budget' : 'Budget warning'}: {notification.category}
                </strong>
                <br />
                Spent: ${notification.spent.toFixed(2)} · Budget: ${notification.budget.toFixed(2)} · Used: {notification.percentUsed}
              </p>
            ))
          )}
        </div>
      </section>

      <section className="two-column" aria-label="Expense statistics">
        {[
          { label: 'Largest Expense', amount: summary.data?.expense_stats?.maximum },
          { label: 'Smallest Expense', amount: summary.data?.expense_stats?.minimum },
        ].map(({ label, amount }) => (
          <div className="card stat" key={label}>
            <h2 className="stat-label">{label}</h2>
            {!moveId ? (
              <p className="muted">Join a group to see expense statistics.</p>
            ) : summary.error ? (
              <p className="form-error">{summary.error}</p>
            ) : summary.loading ? (
              <p className="muted">Loading expense statistics...</p>
            ) : (
              <p className="stat-value">{formatMoney(Number(amount ?? 0))}</p>
            )}
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Budget vs. Spending by Category</h2>

        {!moveId ? (
          <p className="muted">
            Create, join, or select a group to see budget and spending data.
          </p>
        ) : summary.error ? (
          <p className="form-error">{summary.error}</p>
        ) : summary.loading ? (
          <p className="muted">Loading budget data…</p>
        ) : chartData.length === 0 ? (
          <p className="muted">
            No budget or expense data yet. Add a category budget or log an
            expense to generate this chart.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip
                formatter={(value) => [
                  `$${Number(value).toFixed(2)}`,
                ]}
              />
              <Legend />
              <Bar
                dataKey="budget"
                name="Budget"
                fill="#9acbed"
              />
              <Bar
                dataKey="spent"
                name="Spent"
                fill="#315b7d"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>
    </>
  )
}

export default Dashboard
