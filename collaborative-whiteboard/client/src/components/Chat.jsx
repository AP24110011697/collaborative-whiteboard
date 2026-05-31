import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';

export default function Chat({ messages, onSendMessage, localSocketId }) {
  const [isOpen, setIsOpen] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef(null);

  // Monitor incoming messages for unread badge when chat is closed
  useEffect(() => {
    if (!isOpen && messages.length > 0) {
      setUnreadCount((prev) => prev + 1);
    }
  }, [messages, isOpen]);

  // Handle open toggle (resets badge)
  const handleToggleOpen = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setUnreadCount(0);
    }
  };

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    onSendMessage(textInput.trim());
    setTextInput('');
  };

  return (
    <>
      {/* Floating Chat Bubble Button */}
      <button 
        className={`chat-trigger glass-panel ${isOpen ? 'active' : ''}`}
        onClick={handleToggleOpen}
        title="Open Chat"
      >
        <MessageSquare size={20} />
        {!isOpen && unreadCount > 0 && (
          <span className="chat-unread-badge">{unreadCount}</span>
        )}
      </button>

      {/* Slide-Up Chat Window Panel */}
      {isOpen && (
        <div className="chat-panel glass-panel">
          {/* Header */}
          <div className="chat-header">
            <div className="chat-header-title">
              <MessageSquare size={16} style={{ color: 'var(--primary)' }} />
              <span>Room Chat</span>
            </div>
            <button className="chat-close-btn" onClick={() => setIsOpen(false)}>
              <X size={16} />
            </button>
          </div>

          {/* Messages Log */}
          <div className="chat-messages">
            {messages.length === 0 ? (
              <div style={{ 
                margin: 'auto', 
                color: 'var(--text-muted)', 
                fontSize: '0.8rem',
                textAlign: 'center'
              }}>
                No messages yet.<br />Say hello to the room!
              </div>
            ) : (
              messages.map((msg) => {
                const isSelf = msg.senderId === localSocketId;
                return (
                  <div 
                    key={msg.id} 
                    className={`chat-msg-row ${isSelf ? 'self' : ''}`}
                  >
                    <div className="chat-msg-info">
                      <span 
                        className="chat-msg-sender" 
                        style={{ color: isSelf ? '#ffffff' : msg.color }}
                      >
                        {isSelf ? 'You' : msg.senderName}
                      </span>
                      <span className="chat-msg-time">{msg.timestamp}</span>
                    </div>
                    <div className="chat-msg-text">
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <form className="chat-input-form" onSubmit={handleSubmit}>
            <input
              type="text"
              className="chat-input"
              placeholder="Type a message..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              maxLength={200}
            />
            <button type="submit" className="chat-send-btn">
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
