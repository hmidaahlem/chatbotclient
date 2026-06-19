'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, UtensilsCrossed, Loader2, Bot, User } from 'lucide-react';
import './globals.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatbotClient() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "👋 Bienvenue chez AeroServe ! Je suis votre assistant virtuel. Vous pouvez me poser des questions sur nos plats, les allergènes ou l'hygiène. (مرحباً! أنا المساعد الافتراضي، يمكنك سؤالي عن أطباقنا بأي لغة).",
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMsg,
          messages: messages.slice(-4) // Send last 4 messages for context
        }),
      });

      const data = await res.json();
      
      if (data.response) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        throw new Error('No response');
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "Désolé, une erreur de connexion est survenue. (عذراً، حدث خطأ في الاتصال)." 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="glass-panel">
        <header className="header">
          <div className="logo-container">
            <UtensilsCrossed size={24} className="logo-icon" />
            <h1>AeroServe Assistant</h1>
          </div>
          <p className="subtitle">Posez vos questions sur nos produits</p>
        </header>

        <main className="chat-container">
          {messages.map((msg, idx) => (
            <div key={idx} className={`message-wrapper ${msg.role === 'user' ? 'message-user' : 'message-bot'}`}>
              <div className="avatar">
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className="message-bubble">
                <p>{msg.content}</p>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="message-wrapper message-bot">
              <div className="avatar"><Bot size={16} /></div>
              <div className="message-bubble typing">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </main>

        <footer className="footer">
          <form onSubmit={sendMessage} className="input-form">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Écrivez votre message..."
              disabled={isLoading}
              className="chat-input"
            />
            <button type="submit" disabled={isLoading || !input.trim()} className="send-btn">
              {isLoading ? <Loader2 className="spinner" size={20} /> : <Send size={20} />}
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}
