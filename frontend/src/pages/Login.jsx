import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { api, setToken } from '../api.js'

function Login() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault() // stop the browser reloading the page
    setError('')
    setLoading(true)

    const form = new FormData(event.target)

    try {
      // Send email + password to the backend and save the login token
      const data = await api('/auth/login', {
        method: 'POST',
        body: {
          email: form.get('email'),
          password: form.get('password'),
        },
      })
      setToken(data.access_token)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message) // e.g. "Invalid email or password"
    } finally {
      setLoading(false)
    }
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

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Logging in…' : 'Log in'}
        </button>

        <p className="auth-switch">
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </main>
  )
}

export default Login
