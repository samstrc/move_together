import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import NoGroup from '../components/NoGroup.jsx'
import { DollyCard } from '../components/DollyCards.jsx'
import { Mark } from '../components/Icons.jsx'
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

// Dolly's little avatar: the Move Together dolly.
function Avatar() {
  return (
    <span className="dolly-avatar" aria-hidden="true">
      <Mark size={24} />
    </span>
  )
}

// Dolly's reply, one word at a time: each word fades in when it arrives.
// Words are keyed by position, so only new ones animate as the reply grows.
function StreamedText({ text }) {
  return text.split(/(\s+)/).map((part, index) =>
    /^\s*$/.test(part) ? part : <span key={index} className="w">{part}</span>,
  )
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
  const listRef = useRef(null)

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

  // Keep the newest message in view (the messages scroll inside the chat),
  // unless you've scrolled up to read something while Dolly is writing.
  const pinnedRef = useRef(true)
  useEffect(() => {
    const list = listRef.current
    if (!list || !pinnedRef.current) return
    // Jump (not glide) while her reply streams in, so the scroll keeps up
    // and isn't mistaken for you scrolling away.
    const smooth = !sending && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [messages, sending, status])

  function handleScroll() {
    const list = listRef.current
    pinnedRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 160
  }

  // Replace the last message (Dolly's reply while it streams in).
  function setLastMessage(message) {
    setMessages((current) => [...current.slice(0, -1), message])
  }

  async function send(text) {
    text = text.trim()
    if (!text || sending) return
    setError('')
    setInput('')
    pinnedRef.current = true // sending a message jumps back to the newest
    // Dolly's reply starts empty and fills in as she writes it.
    setMessages((current) => [...current, { role: 'user', text, live: true }, { role: 'assistant', text: '', live: true }])
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
            setLastMessage({ role: 'assistant', text: reply, live: true })
          } else if (event.type === 'done') {
            // The saved reply (cleaned up on the backend) replaces the
            // streamed one, and the cards go under it.
            finished = true
            setMessages((current) => [
              ...current.slice(0, -1),
              { role: 'assistant', text: event.reply, live: true },
              ...event.cards.map((card) => ({ role: 'card', card, live: true })),
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
    // The list item a products card is for: by id, or by name for one that
    // wasn't on the list when Dolly found the products.
    itemFor: (card) => (items.data ?? []).find((item) =>
      card.item_id ? item.item_id === card.item_id
        : item.name.trim().toLowerCase() === card.item_name.trim().toLowerCase(),
    ),
    // Picking a product: it becomes the item's choice, or, if the item isn't
    // on the list yet, adding it with this product is the user's go-ahead.
    // Both return true when it worked, so the card can say it's saved.
    chooseProduct: async (card, option) => {
      setError('')
      try {
        const item = actions.itemFor(card)
        if (item) {
          await api(`/moves/${moveId}/items/${item.item_id}/choose`, {
            method: 'POST',
            body: { product_id: option.product_id },
          })
        } else {
          await api(`/moves/${moveId}/items`, {
            method: 'POST',
            body: {
              name: card.item_name,
              category_id: card.category_id ?? null,
              est_cost: option.price,
              product_id: option.product_id,
            },
          })
        }
        reloadItems()
        return true
      } catch (err) {
        setError(`Couldn't save your pick: ${err.message}`)
        return false
      }
    },
    addItem: async (body) => {
      setError('')
      try {
        await api(`/moves/${moveId}/items`, { method: 'POST', body })
        reloadItems()
        return true
      } catch (err) {
        setError(`Couldn't add it: ${err.message}`)
        return false
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

  const last = messages.at(-1)
  // Dolly is working but hasn't written anything yet (or is using a tool).
  const thinking = sending && (status || !last?.text)

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

      <section className="card chat" aria-label="Chat with Dolly">
        <div className="chat-messages" ref={listRef} onScroll={handleScroll} role="log" aria-label="Messages" aria-busy={sending} tabIndex={0}>
          <div className="msg">
            <Avatar />
            <div className="chat-bubble assistant">{greeting}</div>
          </div>
          {messages.map((message, index) => {
            if (message.role === 'card') {
              return <DollyCard key={index} card={message.card} actions={actions} />
            }
            // Dolly's reply is empty until her first words arrive.
            if (!message.text) return null
            const isUser = message.role === 'user'
            const streaming = sending && !isUser && index === messages.length - 1
            return (
              <div key={index} className={`msg${isUser ? ' user' : ''}${streaming ? ' streaming' : ''}`}>
                {!isUser && <Avatar />}
                <div className={`chat-bubble ${message.role}`}>
                  <span className="visually-hidden">{isUser ? 'You: ' : 'Dolly: '}</span>
                  {message.live && !isUser ? <StreamedText text={message.text} /> : message.text}
                </div>
              </div>
            )
          })}
          {thinking && (
            <div className="msg">
              <Avatar />
              <div className="chat-bubble assistant typing">
                <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
                <span className="typing-status">{status || 'Dolly is thinking'}</span>
              </div>
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="chat-suggestions">
              {suggestions.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="form-error chat-error">{error}</p>}

        <form className="composer glass glass-strong" onSubmit={handleSubmit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Dolly..."
            aria-label="Message Dolly"
            maxLength={2000}
            disabled={loading}
            enterKeyHint="send"
          />
          <button
            type="submit"
            className={input.trim() && !sending ? 'btn btn-primary ready' : 'btn btn-primary'}
            disabled={loading || sending || !input.trim()}
          >
            Send
          </button>
        </form>
      </section>
    </>
  )
}

export default Dolly
