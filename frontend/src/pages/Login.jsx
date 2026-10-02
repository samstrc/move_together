import { Link, useNavigate } from 'react-router-dom'

function Login() {
  const navigate = useNavigate()

  function handleSubmit(event) {
    event.preventDefault() // stop the browser reloading the page
    // TODO: Send email + password to the backend and save the login token.
    navigate('/dashboard')
  }

  return (
    <main className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Log in</h1>

        <label className="field">
          Email
          <input type="email" name="email" required />
        </label>

        <label className="field">
          Password
          <input type="password" name="password" required />
        </label>

        <button type="submit" className="btn btn-primary">Log in</button>

        <p className="auth-switch">
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </main>
  )
}

export default Login
