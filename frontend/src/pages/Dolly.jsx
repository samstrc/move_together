import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import NoGroup from '../components/NoGroup.jsx'
import { api } from '../api.js'

const suggestions = [
  'What do we still need for the kitchen?',
  'Find a couch under $600',
  'Are we on track with our budget?',
]

// Shown at the top of every chat. It's only on this page: it isn't saved or
// sent to Dolly.
const greeting = "Hi, I'm Dolly! I can help you find products, compare prices, and build your group's list. What do you need?"

// Chat with Dolly, the AI shopping assistant. Opens your most recent chat for
// this group; "New chat" starts another one.
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
  const [messages, setMessages] = useState([]) // { role: 'user' | 'assistant', text }
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  // Open the most recent chat, if there is one.
  useEffect(() => {
    let ignore = false
    async function load() {
      try {
        const conversations = await api(basePath)
        if (conversations.length === 0) return
        const latest = conversations[0].conversation_id
        const saved = await api(`${basePath}/${latest}/messages`)
        if (ignore) return
        setConversationId(latest)
        setMessages(saved.map((m) => ({ role: m.role, text: m.content })))
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
  }, [basePath])

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, sending])

  async function send(text) {
    text = text.trim()
    if (!text || sending) return
    setError('')
    setInput('')
    setMessages((current) => [...current, { role: 'user', text }])
    setSending(true)
    try {
      let id = conversationId
      if (id === null) {
        const conversation = await api(basePath, { method: 'POST' })
        id = conversation.conversation_id
        setConversationId(id)
      }
      const { reply } = await api(`${basePath}/${id}/messages`, {
        method: 'POST',
        body: { message: text },
      })
      setMessages((current) => [...current, { role: 'assistant', text: reply }])
    } catch (err) {
      // The backend didn't save the message, so take it back off the screen
      // and put it back in the box to try again.
      setMessages((current) => current.slice(0, -1))
      setInput(text)
      setError(`Dolly couldn't answer: ${err.message}`)
    } finally {
      setSending(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    send(input)
  }

  function newChat() {
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
          {messages.map((message, index) => (
            <div key={index} className={`chat-bubble ${message.role}`}>
              {message.text}
            </div>
          ))}
          {sending && <div className="chat-bubble assistant muted">Dolly is typing...</div>}
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
