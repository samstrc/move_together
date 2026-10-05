import { Link, useOutletContext } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'

const sections = [
  { to: '/items', title: 'Shared list', text: 'Add, assign, and check off things the new place needs.' },
  { to: '/budget', title: 'Budget', text: 'Track spending against your group budget and who paid.' },
  { to: '/assistant', title: 'AI assistant', text: 'Get product recommendations and price comparisons.' },
  { to: '/group', title: 'Group', text: 'Invite members and manage move details.' },
]

// Home page after logging in.
//
// TODO (Qiaozhi, issue #16): build the dashboard here, e.g. stats and charts.
// The data is already available:
//   const { user, move } = useOutletContext()   // move: name, target_date, member_count
//   useApi(`/moves/${move.move_id}/items`)      // the shared list (status, category, est_cost, ...)
//   useApi(`/moves/${move.move_id}/budget`)     // totals, per-category budget vs. spent, members' balances
//   useApi(`/moves/${move.move_id}/expenses`)   // every expense, with how it was split
// (useApi is in src/hooks/useApi.js; see Budget.jsx or Items.jsx for examples.)
// If `move` is null the user isn't in a group yet; <NoGroup /> handles that.
function Dashboard() {
  const { user, move } = useOutletContext()
  const firstName = user ? user.name.split(' ')[0] : ''

  return (
    <>
      <PageHeader
        title={`Welcome back${firstName ? `, ${firstName}` : ''}`}
        subtitle={move ? `You're planning ${move.name}.` : "You're not in a group yet."}
      />

      <section className="section-links">
        {sections.map((section) => (
          <Link to={section.to} className="card section-link" key={section.to}>
            <h2>{section.title}</h2>
            <p>{section.text}</p>
          </Link>
        ))}
      </section>
    </>
  )
}

export default Dashboard
