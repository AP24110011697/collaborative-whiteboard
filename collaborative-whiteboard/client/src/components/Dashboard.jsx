import React, { useState } from 'react';
import { Paintbrush, Plus, ArrowRight } from 'lucide-react';

const PRESENCE_COLORS = [
  '#FF5733', // Coral
  '#33FF57', // Neon Green
  '#3357FF', // Electric Blue
  '#F1C40F', // Sun Yellow
  '#9B59B6', // Amethyst Purple
  '#1ABC9C', // Turquoise
  '#E67E22', // Orange
  '#FF3385', // Hot Pink
  '#2ECC71', // Emerald Green
  '#3498DB', // Blue
  '#E74C3C', // Red
  '#00FFFF', // Cyan
];

export default function Dashboard({ onJoin, initialRoomId }) {
  const [nickname, setNickname] = useState('');
  const [selectedColor, setSelectedColor] = useState(
    PRESENCE_COLORS[Math.floor(Math.random() * PRESENCE_COLORS.length)]
  );
  const [roomIdInput, setRoomIdInput] = useState(initialRoomId || '');
  const [isJoiningExisting, setIsJoiningExisting] = useState(!!initialRoomId);

  const handleSubmit = (e, actionType) => {
    e.preventDefault();
    if (!nickname.trim()) {
      alert('Please enter a nickname first!');
      return;
    }

    let targetRoomId = roomIdInput.trim();

    if (actionType === 'create') {
      // Generate a clean 9-character room code (e.g. xxx-yyy-zzz)
      const randStr = () => Math.random().toString(36).substring(2, 5);
      targetRoomId = `${randStr()}-${randStr()}-${randStr()}`;
    } else {
      if (!targetRoomId) {
        alert('Please enter a Room Code to join!');
        return;
      }
    }

    onJoin({
      nickname: nickname.trim(),
      color: selectedColor,
      roomId: targetRoomId,
    });
  };

  return (
    <div className="dashboard-container">
      {/* Dynamic Ambient Background Blobs */}
      <div className="glow-bg">
        <div className="glow-blob glow-blob-1"></div>
        <div className="glow-blob glow-blob-2"></div>
      </div>

      <div className="dashboard-card glass-panel">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <div style={{
            background: 'var(--primary-glow)',
            padding: '12px',
            borderRadius: '50%',
            color: 'var(--primary)',
            boxShadow: '0 0 15px var(--primary-glow)'
          }}>
            <Paintbrush size={32} />
          </div>
        </div>

        <h1 className="dashboard-title">CanvasCollab</h1>
        <p className="dashboard-subtitle">Real-time collaborative digital whiteboard for sketching, brainstorming, and styling together.</p>

        <form>
          {/* Nickname Input */}
          <div className="dashboard-form-group">
            <label className="dashboard-label" htmlFor="nickname">Your Nickname</label>
            <input
              id="nickname"
              type="text"
              className="dashboard-input"
              placeholder="e.g. Alex, Sarah"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={16}
              required
            />
          </div>

          {/* Color Indicator Selector */}
          <div className="dashboard-form-group">
            <label className="dashboard-label">Presence Color</label>
            <div className="color-selector">
              {PRESENCE_COLORS.map((color) => (
                <div
                  key={color}
                  className={`color-dot ${selectedColor === color ? 'active' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setSelectedColor(color)}
                  title="Choose your cursor color"
                />
              ))}
            </div>
          </div>

          {!isJoiningExisting ? (
            /* Main Dashboard Actions */
            <div className="dashboard-actions">
              <button
                type="submit"
                className="btn btn-primary"
                onClick={(e) => handleSubmit(e, 'create')}
              >
                <Plus size={20} />
                Create New Board
              </button>

              <div className="divider">Or Join Existing</div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsJoiningExisting(true)}
              >
                Join with Room Code
              </button>
            </div>
          ) : (
            /* Joining Flow Actions */
            <div className="dashboard-actions" style={{ animation: 'fadeIn 0.3s ease-out' }}>
              <div className="dashboard-form-group" style={{ marginBottom: '15px' }}>
                <label className="dashboard-label" htmlFor="roomCode">Room Code</label>
                <input
                  id="roomCode"
                  type="text"
                  className="dashboard-input"
                  placeholder="e.g. abc-def-ghi"
                  value={roomIdInput}
                  onChange={(e) => setRoomIdInput(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                onClick={(e) => handleSubmit(e, 'join')}
              >
                Join Room
                <ArrowRight size={20} />
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setIsJoiningExisting(false);
                  if (!initialRoomId) setRoomIdInput('');
                }}
              >
                Back to Options
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
