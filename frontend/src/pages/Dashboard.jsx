import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import { budget, currentUser, expenses, group, items } from '../data/sampleData.js'
import { daysUntil, formatDate, formatMoney } from '../utils/format.js'

// Summary of everything in the group, with links to each section.
function Dashboard() {
  const firstName = currentUser.name.split(' ')[0]
  const neededCount = items.filter((item) => item.status === 'needed').length
  const boughtCount = items.length - neededCount
  const spent = expenses.reduce((total, expense) => total + expense.amount, 0)
  const recentItems = items.slice(-3).reverse()

  const stats = [
    { label: 'Days until move', value: daysUntil(group.moveDate), note: formatDate(group.moveDate) },
    { label: 'Items still needed', value: neededCount, note: `${boughtCount} bought` },
    { label: 'Budget spent', value: formatMoney(spent), note: `of ${formatMoney(budget.total)}` },
    { label: 'Group members', value: group.members.length, note: group.name },
  ]

  const sections = [
    { to: '/items', title: 'Shared list', text: 'Add, assign, and check off things the new place needs.' },
    { to: '/budget', title: 'Budget', text: 'Track spending against your group budget and who paid.' },
    { to: '/assistant', title: 'AI assistant', text: 'Get product recommendations and price comparisons.' },
    { to: '/group', title: 'Group', text: 'Invite members and manage move details.' },
  ]

  return (
    <>
      <PageHeader title={`Welcome back, ${firstName}`} subtitle={`Here's where ${group.name} stands.`} />

      <section className="stats">
        {stats.map((stat) => (
          <div className="card stat" key={stat.label}>
            <p className="stat-label">{stat.label}</p>
            <p className="stat-value">{stat.value}</p>
            <p className="stat-note">{stat.note}</p>
          </div>
        ))}
      </section>

      <section className="section-links">
        {sections.map((section) => (
          <Link to={section.to} className="card section-link" key={section.to}>
            <h2>{section.title}</h2>
            <p>{section.text}</p>
          </Link>
        ))}
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Recently added</h2>
          <Link to="/items">View all</Link>
        </div>
        <ul className="simple-list">
          {recentItems.map((item) => (
            <li key={item.id}>
              <span>{item.name}</span>
              <span className="muted">added by {item.addedBy}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

export default Dashboard
