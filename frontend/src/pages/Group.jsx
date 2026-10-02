import PageHeader from '../components/PageHeader.jsx'
import { group } from '../data/sampleData.js'
import { formatDate } from '../utils/format.js'

// Group details, members, inviting people, and creating/joining a group.
// TODO: Hook the forms and buttons up to the backend.
function Group() {
  return (
    <>
      <PageHeader title="Group" subtitle="Manage who's moving and the move details." />

      <div className="two-column">
        <section className="card">
          <h2>Move details</h2>
          <ul className="simple-list">
            <li><span>Group name</span><span>{group.name}</span></li>
            <li><span>New address</span><span>{group.address}</span></li>
            <li><span>Move date</span><span>{formatDate(group.moveDate)}</span></li>
          </ul>
          <button className="btn btn-ghost">Edit details</button>
        </section>

        <section className="card">
          <h2>Members</h2>
          <ul className="simple-list">
            {group.members.map((member) => (
              <li key={member.id}>
                <span>{member.name}</span>
                <span className="muted">{member.role}</span>
              </li>
            ))}
          </ul>
          <p className="muted">
            Invite code: <strong className="invite-code">{group.inviteCode}</strong>
          </p>
        </section>
      </div>

      <div className="two-column">
        <form className="card" onSubmit={(e) => e.preventDefault()}>
          <h2>Join a group</h2>
          <label className="field">
            Invite code
            <input placeholder="MOVE-0000" />
          </label>
          <button type="submit" className="btn btn-primary">Join</button>
        </form>

        <form className="card" onSubmit={(e) => e.preventDefault()}>
          <h2>Create a new group</h2>
          <label className="field">
            Group name
            <input placeholder="e.g. Summer sublet" />
          </label>
          <label className="field">
            Move date
            <input type="date" />
          </label>
          <button type="submit" className="btn btn-primary">Create</button>
        </form>
      </div>
    </>
  )
}

export default Group
