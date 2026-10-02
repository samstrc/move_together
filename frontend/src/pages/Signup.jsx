import { Link, useNavigate } from 'react-router-dom'

function Signup() {
  const navigate = useNavigate()

  function handleSubmit(event) {
    event.preventDefault()
    // TODO: Create the account on the backend, then log the user in.
    navigate('/group')
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

        <button type="submit" className="btn btn-primary">Sign up</button>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </main>
  )
}

export default Signup
