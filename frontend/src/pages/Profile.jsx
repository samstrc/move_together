import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import { currentUser } from '../data/sampleData.js'

// The logged-in user's account settings.
function Profile() {
  const navigate = useNavigate()

  function handleLogout() {
    // TODO: Clear the saved login token.
    navigate('/')
  }

  return (
    <>
      <PageHeader title="Profile" subtitle="Your account settings." />

      <form className="card narrow" onSubmit={(e) => e.preventDefault()}>
        <label className="field">
          Name
          <input defaultValue={currentUser.name} />
        </label>
        <label className="field">
          Email
          <input type="email" defaultValue={currentUser.email} />
        </label>
        {/* TODO: Save changes to the backend */}
        <button type="submit" className="btn btn-primary">Save changes</button>
      </form>

      <button className="btn btn-ghost" onClick={handleLogout}>Log out</button>
    </>
  )
}

export default Profile
