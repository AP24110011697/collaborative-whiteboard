import React, { useState } from 'react';
import { Users, ChevronDown, ChevronUp } from 'lucide-react';

export default function UserList({ users, localSocketId }) {
  const [isOpen, setIsOpen] = useState(false);

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <>
      {/* Floating Panel Toggle Button */}
      <button 
        className={`user-list-trigger glass-panel ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="View Online Users"
        style={{
          border: isOpen ? '1px solid var(--primary)' : '1px solid var(--panel-border)',
          color: isOpen ? 'white' : 'var(--text-secondary)'
        }}
      >
        <Users size={18} />
      </button>

      {/* Online Users List Panel */}
      {isOpen && (
        <div className="user-list-panel glass-panel">
          <div className="user-list-title">
            Online Users ({users.length})
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {users.map((user) => {
              const isSelf = user.socketId === localSocketId;
              const initials = getInitials(user.nickname);
              
              return (
                <div key={user.socketId} className="user-item">
                  <div 
                    className="user-avatar" 
                    style={{ 
                      backgroundColor: user.color,
                      boxShadow: `0 0 10px ${user.color}40`
                    }}
                  >
                    {initials}
                  </div>
                  
                  <div className="user-name-text" style={{ fontWeight: isSelf ? '600' : '400' }}>
                    {user.nickname}
                  </div>
                  
                  {isSelf && (
                    <span className="user-self-badge">You</span>
                  )}
                  
                  <span className="user-indicator-dot" />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
