import { Link } from 'react-router-dom'
import PageHeader from './PageHeader.jsx'

// Shown on pages that need a group when you haven't joined or created one.
function NoGroup({ title }) {
  return (
    <>
      <PageHeader title={title} />
      <section className="card narrow">
        <h2>You're not in a group yet</h2>
        <p>Create a group for your move, or join one with an invite code from a roommate.</p>
        <Link to="/group" className="btn btn-primary">Create or join a group</Link>
      </section>
    </>
  )
}

export default NoGroup
