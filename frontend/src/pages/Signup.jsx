import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { api, setToken } from '../api.js'

function Signup() { // React componenet called Signup
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)

    // 1. Read the values from the form (uses each input's name="...")
    const form = new FormData(event.target)

    try {
      // 2–3. Send them to the server, which validates and creates the account
      const data = await api('/auth/signup', {
        method: 'POST',
        body: {
          name: form.get('name'),
          email: form.get('email'),
          password: form.get('password'),
        },
      })

      // 4. Store the login token (signup logs you in right away)
      setToken(data.access_token)

      // 5. Navigate only if signup succeeded
      navigate('/group')
    } catch (err) {
      setError(err.message) // e.g. "An account with that email already exists"
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Create an account</h1>

        <label className="field">
          Name
          <input type="text" name="name" required />
        </label>

        <label className="field">
          Email
          <input type="email" name="email" required />
        </label>

        <label className="field">
          Password
          <input type="password" name="password" minLength={8} required />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Creating account…' : 'Sign up'}
        </button>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </main>
  )
}

export default Signup
