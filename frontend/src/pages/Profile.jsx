import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import { api } from '../api.js'

// The logged-in user's account settings.
function Profile() {
  const { user, setUser, logOut } = useOutletContext()

  if (!user) {
    return (
      <>
        <PageHeader title="Profile" subtitle="Your account settings." />
        <p className="muted">Loading…</p>
      </>
    )
  }
  // key={user.user_id} gives the forms fresh starting values for this user.
  return <ProfileForms key={user.user_id} user={user} setUser={setUser} logOut={logOut} />
}

function ProfileForms({ user, setUser, logOut }) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [profileStatus, setProfileStatus] = useState({ error: '', message: '' })

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordStatus, setPasswordStatus] = useState({ error: '', message: '' })

  async function handleSaveProfile(event) {
    event.preventDefault()
    try {
      const updated = await api('/auth/me', { method: 'PATCH', body: { name, email } })
      setUser(updated) // updates the name in the sidebar too
      setName(updated.name)
      setEmail(updated.email)
      setProfileStatus({ error: '', message: 'Saved.' })
    } catch (err) {
      setProfileStatus({ error: err.message, message: '' })
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault()
    try {
      await api('/auth/me/password', {
        method: 'POST',
        body: { current_password: currentPassword, new_password: newPassword },
      })
      setCurrentPassword('')
      setNewPassword('')
      setPasswordStatus({ error: '', message: 'Password changed.' })
    } catch (err) {
      setPasswordStatus({ error: err.message, message: '' })
    }
  }

  return (
    <>
      <PageHeader title="Profile" subtitle="Your account settings." />

      <div className="two-column">
        <form className="card" onSubmit={handleSaveProfile}>
          <h2>Account</h2>
          <label className="field">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {profileStatus.error && <p className="form-error">{profileStatus.error}</p>}
          {profileStatus.message && <p className="form-success">{profileStatus.message}</p>}
          <button type="submit" className="btn btn-primary">Save changes</button>
        </form>

        <form className="card" onSubmit={handleChangePassword}>
          <h2>Change password</h2>
          <label className="field">
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label className="field">
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </label>
          {passwordStatus.error && <p className="form-error">{passwordStatus.error}</p>}
          {passwordStatus.message && <p className="form-success">{passwordStatus.message}</p>}
          <button type="submit" className="btn btn-primary">Change password</button>
        </form>
      </div>

      <div className="page-actions">
        <button className="btn btn-ghost" onClick={logOut}>Log out</button>
      </div>
    </>
  )
}

export default Profile
