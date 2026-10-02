import { useState } from 'react'
import PageHeader from '../components/PageHeader.jsx'

const suggestions = [
  'What do we still need for the kitchen?',
  'Find a couch under $600',
  'Are we on track with our budget?',
]

// Chat with the AI shopping assistant.
// TODO: Send messages to a backend endpoint that calls the LLM, and let it
// add items to the shared list.
function Assistant() {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi, I'm Dolly! I can help you find products, compare prices, and build your group's list. What do you need?" },
  ])
  const [input, setInput] = useState('')

  function send(text) {
    if (!text.trim()) return
    setMessages([
      ...messages,
      { role: 'user', text },
      { role: 'assistant', text: "I'm not connected yet, but soon I'll be able to answer that!" },
    ])
    setInput('')
  }

  function handleSubmit(event) {
    event.preventDefault()
    send(input)
  }

  return (
    <>
      <PageHeader title="Ask Dolly" subtitle="Ask for recommendations, shop, or help planning your move." />

      <section className="card chat">
        <div className="chat-messages">
          {messages.map((message, index) => (
            <div key={index} className={`chat-bubble ${message.role}`}>
              {message.text}
            </div>
          ))}
        </div>

        <div className="chat-suggestions">
          {suggestions.map((s) => (
            <button key={s} type="button" className="btn btn-ghost btn-small" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>

        <form className="chat-input" onSubmit={handleSubmit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the assistant..."
            aria-label="Message"
          />
          <button type="submit" className="btn btn-primary">Send</button>
        </form>
      </section>
    </>
  )
}

export default Assistant
