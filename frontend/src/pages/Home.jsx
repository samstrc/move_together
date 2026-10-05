import { Link } from 'react-router-dom'

// Landing page: explains what Move Together is and points people to sign up.

// The three feature cards. Keeping the content in an array means we can
// render every card with one .map() instead of copy-pasting the markup.
const features = [
  {
    title: 'Shared item lists',
    description:
      'Everyone in your group adds what the new place needs, so nothing gets bought twice or forgotten.',
  },
  {
    title: 'Group budgeting',
    description:
      'Set a budget together and see what has been spent, what is left, and who paid for what.',
  },
  {
    title: 'AI shopping assistant',
    description:
      'Ask for recommendations, compare real products and prices, and add picks straight to your list.',
  },
]

const steps = [
  'Create a group and invite your roommates or partner.',
  'Build your shared list and set a budget.',
  'Shop, check items off, and stay in sync.',
]

function Home() {
  return (
    <main>
      <section className="hero">
        <h1>Plan your move, together.</h1>
        <p className="hero-subtitle">
          Moving in with roommates or a partner? Make one list of what the new
          place needs, set a budget, and keep track of who paid for what.
        </p>
        <div className="hero-actions">
          <Link to="/signup" className="btn btn-primary btn-large">Get started</Link>
          <Link to="/login" className="btn btn-ghost btn-large">I already have a group</Link>
        </div>
      </section>

      <section className="features">
        {features.map((feature) => (
          <div className="feature-card" key={feature.title}>
            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
          </div>
        ))}
      </section>

      <section className="how-it-works">
        <h2>How it works</h2>
        <ol>
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </main>
  )
}

export default Home
