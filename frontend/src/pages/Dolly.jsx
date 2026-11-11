import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import NoGroup from '../components/NoGroup.jsx'
import { DollyCard } from '../components/DollyCards.jsx'
import { api, streamApi } from '../api.js'
import { useApi } from '../hooks/useApi.js'

const suggestions = [
  'What do we still need for the kitchen?',
  'Find a couch under $600',
  'Are we on track with our budget?',
]

// Shown at the top of every chat. It's only on this page: it isn't saved or
// sent to Dolly.
const greeting = "Hi, I'm Dolly! I can find real products, compare prices, and help build your group's list. What do you need?"

// Which chat you were on in each group, so coming back to this page opens it
// again: a conversation_id, or 'new' for a new chat you hadn't typed in yet.
// Saved in this browser only, like the selected group (see AppLayout).
function savedChat(moveId) {
  return localStorage.getItem(`dollyChat:${moveId}`)
}

function saveChat(moveId, chat) {
  localStorage.setItem(`dollyChat:${moveId}`, String(chat))
}

// Chat with Dolly, the AI shopping assistant. Opens the chat you were last on
// in this group (or your most recently used one); "New chat" starts another.
function Dolly() {
  const { move } = useOutletContext()
  if (!move) return <NoGroup title="Ask Dolly" />

  // A new group gets a fresh chat instead of the previous group's messages.
  return <DollyChat key={move.move_id} moveId={move.move_id} />
}

function DollyChat({ moveId }) {
  const basePath = `/moves/${moveId}/assistant/conversations`

  // null until the first message of a new chat creates it on the backend.
  const [conversationId, setConversationId] = useState(null)
  // { role: 'user' | 'assistant', text }, or { role: 'card', card } for the
  // products and list changes Dolly's tools made (shown under her reply).
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('') // what Dolly is doing, e.g. "Searching the web"
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  // What's on the list, so suggestion cards know if they've been added.
  const items = useApi(`/moves/${moveId}/items`)
  const reloadItems = items.reload

  // Open the chat you were last on: a blank one if you'd started a new chat,
  // otherwise that chat, or else your most recently used one.
  useEffect(() => {
    let ignore = false
    async function load() {
      try {
        const saved = savedChat(moveId)
        if (saved === 'new') return
        let id = Number(saved) || null
        let rows = null
        if (id !== null) {
          try {
            rows = await api(`${basePath}/${id}/messages`)
          } catch (err) {
            // The saved chat is gone, or it's someone else's (another account
            // used this browser): fall back to your most recent chat below.
            if (err.status !== 404) throw err
          }
        }
        if (rows === null) {
          const conversations = await api(basePath) // most recently used first
          if (conversations.length === 0) return
          id = conversations[0].conversation_id
          rows = await api(`${basePath}/${id}/messages`)
        }
        if (ignore) return
        setConversationId(id)
        setMessages(rows.map((m) =>
          m.role === 'tool' ? { role: 'card', card: m.card } : { role: m.role, text: m.content },
        ))
      } catch (err) {
        if (!ignore) setError(err.message)
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [basePath, moveId])

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, sending])

  // Replace the last message (Dolly's reply while it streams in).
  function setLastMessage(message) {
    setMessages((current) => [...current.slice(0, -1), message])
  }

  async function send(text) {
    text = text.trim()
    if (!text || sending) return
    setError('')
    setInput('')
    // Dolly's reply starts empty and fills in as she writes it.
    setMessages((current) => [...current, { role: 'user', text }, { role: 'assistant', text: '' }])
    setSending(true)
    setStatus('')
    try {
      let id = conversationId
      if (id === null) {
        const conversation = await api(basePath, { method: 'POST' })
        id = conversation.conversation_id
        setConversationId(id)
        saveChat(moveId, id)
      }

      let reply = ''
      let finished = false
      let failure = null
      await streamApi(`${basePath}/${id}/messages`, {
        body: { message: text },
        onEvent: (event) => {
          if (event.type === 'status') {
            setStatus(event.text) // e.g. "Searching the web"
          } else if (event.type === 'delta') {
            reply += event.text
            setStatus('')
            setLastMessage({ role: 'assistant', text: reply })
          } else if (event.type === 'done') {
            // The saved reply (cleaned up on the backend) replaces the
            // streamed one, and the cards go under it.
            finished = true
            setMessages((current) => [
              ...current.slice(0, -1),
              { role: 'assistant', text: event.reply },
              ...event.cards.map((card) => ({ role: 'card', card })),
            ])
          } else if (event.type === 'error') {
            failure = event.message
          }
        },
      })
      if (failure) throw new Error(failure)
      if (!finished) throw new Error('the connection was lost')
    } catch (err) {
      // The backend didn't save the message, so take it (and any half
      // reply) back off the screen and put it back in the box to try again.
      setMessages((current) => current.slice(0, -2))
      setInput(text)
      setError(`Dolly couldn't answer: ${err.message}`)
    } finally {
      setSending(false)
      setStatus('')
    }
  }

  // What the cards' buttons can do.
  const actions = {
    // Is an item with this name on the list? (Same check as Dolly's.)
    onList: (name) => (items.data ?? []).some(
      (item) => item.name.trim().toLowerCase() === name.trim().toLowerCase(),
    ),
    addItem: async (body) => {
      setError('')
      try {
        await api(`/moves/${moveId}/items`, { method: 'POST', body })
        reloadItems()
      } catch (err) {
        setError(`Couldn't add it: ${err.message}`)
      }
    },
  }

  function handleSubmit(event) {
    event.preventDefault()
    send(input)
  }

  function newChat() {
    saveChat(moveId, 'new')
    setConversationId(null)
    setMessages([])
    setError('')
  }

  return (
    <>
      <PageHeader title="Ask Dolly" subtitle="Ask for recommendations, shop, or help planning your move.">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={newChat}
          disabled={sending || messages.length === 0}
        >
          New chat
        </button>
      </PageHeader>

      <section className="card chat">
        <div className="chat-messages">
          <div className="chat-bubble assistant">{greeting}</div>
          {messages.map((message, index) =>
            message.role === 'card' ? (
              <DollyCard key={index} card={message.card} actions={actions} />
            ) : (
              // Dolly's reply is empty until her first words arrive.
              message.text && (
                <div key={index} className={`chat-bubble ${message.role}`}>
                  {message.text}
                </div>
              )
            ),
          )}
          {sending && (status || !messages.at(-1)?.text) && (
            <div className="chat-bubble assistant muted">{status || 'Dolly is thinking'}...</div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p className="form-error">{error}</p>}

        {!loading && messages.length === 0 && (
          <div className="chat-suggestions">
            {suggestions.map((s) => (
              <button key={s} type="button" className="btn btn-ghost btn-small" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        <form className="chat-input" onSubmit={handleSubmit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Dolly..."
            aria-label="Message"
            maxLength={2000}
            disabled={loading}
          />
          <button type="submit" className="btn btn-primary" disabled={loading || sending || !input.trim()}>
            Send
          </button>
        </form>
      </section>
    </>
  )
}

export default Dolly
