import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Dashboard from './components/Dashboard';
import Whiteboard from './components/Whiteboard';

export default function App() {
  const [roomInfo, setRoomInfo] = useState(null);
  const [socket, setSocket] = useState(null);
  const [initialRoomId, setInitialRoomId] = useState('');

  // Check URL query parameters for room keys on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setInitialRoomId(roomParam);
    }
  }, []);

  // Handle joining/creating a room
  const handleJoinRoom = ({ nickname, color, roomId }) => {
    // Set connection credentials
    setRoomInfo({ nickname, color, roomId });
    
    // Update browser URL query parameter in-place without page reload
    const newUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);
  };

  // Socket connection manager lifecycle
  useEffect(() => {
    if (!roomInfo) return;

    // Connect to Socket.io gateway (relative socket works due to Vite proxy)
    const newSocket = io();
    setSocket(newSocket);

    // Error handling
    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      alert('Failed to connect to the drawing server. Please check if the server is running!');
      // Revert room join
      setRoomInfo(null);
      setSocket(null);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [roomInfo]);

  // Handle back to landing / logout (cleans up URL as well)
  const handleLeaveRoom = () => {
    if (socket) {
      socket.disconnect();
    }
    setSocket(null);
    setRoomInfo(null);
    
    // Clean up browser url
    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
  };

  if (!roomInfo || !socket) {
    return (
      <Dashboard 
        onJoin={handleJoinRoom} 
        initialRoomId={initialRoomId} 
      />
    );
  }

  return (
    <Whiteboard
      roomId={roomInfo.roomId}
      nickname={roomInfo.nickname}
      color={roomInfo.color}
      socket={socket}
      onLeave={handleLeaveRoom}
    />
  );
}
