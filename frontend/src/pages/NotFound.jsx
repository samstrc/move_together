import { Link } from 'react-router-dom'

// Shown when the URL doesn't match any page.
function NotFound() {
  return (
    <main className="auth-page">
      <div className="card auth-card">
        <h1>Page not found</h1>
        <p>We couldn't find that page.</p>
        <Link to="/" className="btn btn-primary">Go home</Link>
      </div>
    </main>
  )
}

export default NotFound
