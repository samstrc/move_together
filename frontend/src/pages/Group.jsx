import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import { api } from '../api.js'
import { useApi } from '../hooks/useApi.js'
import { formatDate } from '../utils/format.js'

// Group details, members, inviting people, leaving/deleting, and
// creating/joining a group. Without a group, only join/create show.
//
// Who can do what (the backend enforces this too):
//   - Everyone: edit move details, set their own move-in date, leave.
//   - Owners: also change anyone's share or role, remove people,
//     get a new invite code, and delete the group.
function Group() {
  const { user, move, selectMove, reloadMoves } = useOutletContext()
  const details = useApi(move ? `/moves/${move.move_id}` : null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // "Edit details" form (filled in when you click Edit)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDestination, setEditDestination] = useState('')
  const [editDate, setEditDate] = useState('')

  // "Join" and "Create" forms
  const [joinCode, setJoinCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')

  const group = details.data
  const isOwner = group?.my_role === 'owner'

  // Runs a change on the backend; returns true if it worked.
  async function save(request, successMessage = '') {
    setError('')
    setMessage('')
    try {
      const result = await request()
      setMessage(successMessage)
      return result ?? true
    } catch (err) {
      setError(err.message)
      return false
    }
  }

  function startEditing() {
    setEditName(group.name)
    setEditDestination(group.destination ?? '')
    setEditDate(group.target_date ?? '')
    setEditing(true)
  }

  async function handleSaveDetails(event) {
    event.preventDefault()
    const saved = await save(() =>
      api(`/moves/${move.move_id}`, {
        method: 'PATCH',
        body: { name: editName, destination: editDestination || null, target_date: editDate || null },
      }),
    )
    if (saved) {
      setEditing(false)
      details.reload()
      reloadMoves() // the name also shows in the sidebar
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(group.invite_code)
      setError('')
      setMessage('Invite code copied.')
    } catch {
      setError("Couldn't copy. Select the code and copy it instead.")
    }
  }

  async function newCode() {
    if (!window.confirm('Make a new invite code? The current one will stop working.')) return
    if (await save(() => api(`/moves/${move.move_id}/invite-code`, { method: 'POST' }), 'New invite code made.')) {
      details.reload()
    }
  }

  async function removeMember(member) {
    if (!window.confirm(`Remove ${member.name} from ${group.name}?`)) return
    const removed = await save(
      () => api(`/moves/${move.move_id}/members/${member.user_id}`, { method: 'DELETE' }),
      `${member.name} was removed.`,
    )
    if (removed) {
      details.reload()
      reloadMoves()
    }
  }

  async function leaveGroup() {
    if (!window.confirm(`Leave ${group.name}? You'll need an invite code to rejoin.`)) return
    const left = await save(
      () => api(`/moves/${move.move_id}/members/${user.user_id}`, { method: 'DELETE' }),
      `You left ${group.name}.`,
    )
    if (left) reloadMoves()
  }

  async function deleteGroup() {
    if (!window.confirm(`Delete ${group.name} for everyone? Its list, budget, and expenses will be gone for good.`)) return
    const deleted = await save(
      () => api(`/moves/${move.move_id}`, { method: 'DELETE' }),
      `${group.name} was deleted.`,
    )
    if (deleted) reloadMoves()
  }

  async function handleJoin(event) {
    event.preventDefault()
    const joined = await save(() => api('/moves/join', { method: 'POST', body: { code: joinCode } }), 'You joined the group!')
    if (joined) {
      setJoinCode('')
      selectMove(joined.move_id)
      reloadMoves()
    }
  }

  async function handleCreate(event) {
    event.preventDefault()
    const created = await save(
      () => api('/moves', { method: 'POST', body: { name: newName, target_date: newDate || null } }),
      `Created ${newName}. Share the invite code with your roommates.`,
    )
    if (created) {
      setNewName('')
      setNewDate('')
      selectMove(created.move_id)
      reloadMoves()
    }
  }

  return (
    <>
      <PageHeader title="Group" subtitle="Manage who's moving and the move details." />

      {(error || details.error) && <p className="form-error">{error || details.error}</p>}
      {message && <p className="form-success">{message}</p>}

      {move && group && (
        <>
          <div className="two-column">
            {editing ? (
              <form className="card" onSubmit={handleSaveDetails}>
                <h2>Move details</h2>
                <label className="field">
                  Group name
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} required />
                </label>
                <label className="field">
                  New address
                  <input value={editDestination} onChange={(e) => setEditDestination(e.target.value)} />
                </label>
                <label className="field">
                  Move date
                  <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                </label>
                <div className="button-row">
                  <button type="submit" className="btn btn-primary">Save</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </form>
            ) : (
              <section className="card">
                <h2>Move details</h2>
                <ul className="simple-list">
                  <li><span>Group name</span><span>{group.name}</span></li>
                  <li><span>New address</span><span>{group.destination ?? '—'}</span></li>
                  <li><span>Move date</span><span>{group.target_date ? formatDate(group.target_date) : '—'}</span></li>
                </ul>
                <button className="btn btn-ghost" onClick={startEditing}>Edit details</button>
              </section>
            )}

            <section className="card">
              <h2>Invite people</h2>
              {group.invite_code ? (
                <>
                  <p>Share this code. Anyone who enters it on their Group page joins {group.name}.</p>
                  <p className="invite-code-large">{group.invite_code}</p>
                  <div className="button-row">
                    <button type="button" className="btn btn-ghost btn-small" onClick={copyCode}>Copy code</button>
                    {isOwner && (
                      <button type="button" className="btn btn-ghost btn-small" onClick={newCode}>New code</button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="muted">There's no active invite code.</p>
                  {isOwner && <button type="button" className="btn btn-ghost btn-small" onClick={newCode}>Make a code</button>}
                </>
              )}
            </section>
          </div>

          <section className="card">
            <h2>Members</h2>
            <p className="muted">
              A member's <strong>share</strong> decides how expenses are split: 1 is normal, 2 pays twice as much
              (e.g. for the bigger room). {isOwner ? 'As an owner, you can change anyone\'s share or role.' : 'Owners can change shares.'}
            </p>
            <ul className="member-list">
              {group.members.map((member) => (
                <MemberRow
                  // Including the details in the key resets the editor after they change
                  key={`${member.user_id}-${member.role}-${member.split_weight}-${member.move_in_date}`}
                  moveId={move.move_id}
                  member={member}
                  isMe={member.user_id === user?.user_id}
                  iAmOwner={isOwner}
                  onSaved={() => details.reload()}
                  onRemove={() => removeMember(member)}
                />
              ))}
            </ul>
          </section>

          <section className="card">
            <h2>Leave or delete</h2>
            <div className="button-row">
              <button type="button" className="btn btn-ghost" onClick={leaveGroup}>Leave group</button>
              {isOwner && (
                <button type="button" className="btn btn-danger" onClick={deleteGroup}>Delete group</button>
              )}
            </div>
            <p className="muted">
              {isOwner
                ? 'If you\'re the only owner, make someone else an owner before leaving. Deleting removes the group for everyone.'
                : 'Your past expenses stay in the budget after you leave.'}
            </p>
          </section>
        </>
      )}

      {!move && (
        <section className="card narrow">
          <h2>Get started</h2>
          <p>Join your roommates' group with their invite code, or create a new group for your move.</p>
        </section>
      )}

      <div className="two-column">
        <form className="card" onSubmit={handleJoin}>
          <h2>Join a group</h2>
          <label className="field">
            Invite code
            <input placeholder="MOVE-0000" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} required />
          </label>
          <button type="submit" className="btn btn-primary">Join</button>
        </form>

        <form className="card" onSubmit={handleCreate}>
          <h2>Create a new group</h2>
          <label className="field">
            Group name
            <input placeholder="e.g. Summer sublet" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          </label>
          <label className="field">
            Move date
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary">Create</button>
        </form>
      </div>
    </>
  )
}

// One person in the Members list, with an inline editor.
// Owners can edit everything for anyone; members only their own move-in date.
function MemberRow({ moveId, member, isMe, iAmOwner, onSaved, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [moveInDate, setMoveInDate] = useState(member.move_in_date ?? '')
  const [share, setShare] = useState(String(member.split_weight))
  const [role, setRole] = useState(member.role)
  const [error, setError] = useState('')

  const canEdit = iAmOwner || isMe

  async function handleSave(event) {
    event.preventDefault()
    const body = { move_in_date: moveInDate || null }
    if (iAmOwner) {
      body.split_weight = Number(share)
      body.role = role
    }
    try {
      await api(`/moves/${moveId}/members/${member.user_id}`, { method: 'PATCH', body })
      setError('')
      setEditing(false)
      onSaved()
    } catch (err) {
      setError(err.message)
    }
  }

  if (editing) {
    return (
      <li>
        <form className="inline-form member-form" onSubmit={handleSave}>
          <strong className="member-name">{member.name}</strong>
          <label className="field">
            Move-in date
            <input type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} />
          </label>
          {iAmOwner && (
            <>
              <label className="field">
                Share
                <input type="number" min="0.25" max="999" step="0.25" value={share} onChange={(e) => setShare(e.target.value)} required />
              </label>
              <label className="field">
                Role
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="member">Member</option>
                  <option value="owner">Owner</option>
                </select>
              </label>
            </>
          )}
          <div className="button-row">
            <button type="submit" className="btn btn-primary btn-small">Save</button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </li>
    )
  }

  return (
    <li className="member-row">
      <div>
        <strong className="member-name">{member.name}</strong>
        {isMe && <span className="muted"> (you)</span>}
        <p className="muted member-meta">
          {member.role === 'owner' ? 'Owner' : 'Member'}
          {' · '}share {Number(member.split_weight)}
          {' · '}
          {member.move_in_date ? `moving in ${formatDate(member.move_in_date)}` : 'no move-in date'}
        </p>
      </div>
      <div className="button-row">
        {canEdit && (
          <button type="button" className="btn-link" onClick={() => setEditing(true)}>Edit</button>
        )}
        {iAmOwner && !isMe && (
          <button type="button" className="btn-link" onClick={onRemove}>Remove</button>
        )}
      </div>
    </li>
  )
}

export default Group
