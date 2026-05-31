import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import Toolbar from './Toolbar';
import UserList from './UserList';
import Chat from './Chat';

export default function Whiteboard({ roomId, nickname, color, socket }) {
  const canvasRef = useRef(null);
  
  // Canvas Transform State
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  
  // Drawing configurations
  const [currentTool, setCurrentTool] = useState('pencil'); // pencil, line, rectangle, circle, text, eraser, select, pan
  const [strokeColor, setStrokeColor] = useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(5);
  const [useFill, setUseFill] = useState(false);
  
  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [activeElement, setActiveElement] = useState(null);
  const startPanRef = useRef({ x: 0, y: 0 });
  
  // Text Input tool state
  const [textInputPos, setTextInputPos] = useState(null); // { x, y, canvasX, canvasY }
  const [textInputValue, setTextInputValue] = useState('');
  const textInputRef = useRef(null);

  // Selection & drag state
  const [selectedElement, setSelectedElement] = useState(null);
  const [isDraggingElement, setIsDraggingElement] = useState(false);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  
  // Vector database and undo/redo stacks
  const [elements, setElements] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  
  // Socket-synced Presence lists
  const [usersInRoom, setUsersInRoom] = useState([]);
  const [liveCursors, setLiveCursors] = useState({}); // socketId -> { nickname, color, x, y, currentTool }
  const [otherActiveDrawings, setOtherActiveDrawings] = useState({}); // socketId -> element
  const [chatMessages, setChatMessages] = useState([]);
  const [localSocketId, setLocalSocketId] = useState('');
  const [notification, setNotification] = useState('');

  // Setup Notification Timer
  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification((prev) => (prev === msg ? '' : prev));
    }, 3000);
  };

  // Convert screen coordinates to canvas space coordinates
  const getCanvasCoords = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panOffset.x) / scale,
      y: (clientY - rect.top - panOffset.y) / scale
    };
  }, [panOffset, scale]);

  // Convert canvas coordinates to screen space (for cursor overlays)
  const getScreenCoords = useCallback((canvasX, canvasY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: canvasX * scale + panOffset.x + rect.left,
      y: canvasY * scale + panOffset.y + rect.top
    };
  }, [panOffset, scale]);

  // Handle Zoom shortcuts / buttons
  const handleZoom = (factor) => {
    setScale((prev) => {
      let newScale = factor === 'reset' ? 1 : prev * factor;
      newScale = Math.min(Math.max(newScale, 0.1), 10);
      return newScale;
    });
    if (factor === 'reset') {
      setPanOffset({ x: 0, y: 0 });
    }
  };

  // --- Hitting Algorithms for Element Selection ---
  const distance = (a, b) => Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
  
  const isPointOnLine = (x, y, x1, y1, x2, y2, maxDistance = 8) => {
    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    
    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    let param = -1;
    if (len_sq !== 0) param = dot / len_sq;
    
    let xx, yy;
    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }
    
    const dx = x - xx;
    const dy = y - yy;
    return Math.sqrt(dx * dx + dy * dy) < maxDistance;
  };

  const getElementAtPosition = useCallback((x, y, elementsList) => {
    // Search backwards to select the topmost drawn element first
    for (let i = elementsList.length - 1; i >= 0; i--) {
      const el = elementsList[i];
      if (el.type === 'rectangle') {
        const minX = Math.min(el.x1, el.x2);
        const maxX = Math.max(el.x1, el.x2);
        const minY = Math.min(el.y1, el.y2);
        const maxY = Math.max(el.y1, el.y2);
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) return el;
      } else if (el.type === 'circle') {
        const r = Math.sqrt(Math.pow(el.x2 - el.x1, 2) + Math.pow(el.y2 - el.y1, 2));
        const dist = Math.sqrt(Math.pow(x - el.x1, 2) + Math.pow(y - el.y1, 2));
        if (dist <= r) return el;
      } else if (el.type === 'line') {
        if (isPointOnLine(x, y, el.x1, el.y1, el.x2, el.y2)) return el;
      } else if (el.type === 'pencil' || el.type === 'eraser') {
        // Check if cursor is close to any point on path
        const onPath = el.points.some(p => distance(p, { x, y }) < (el.width + 5));
        if (onPath) return el;
      } else if (el.type === 'text') {
        const approxW = 150;
        const approxH = el.width * 3 + 12;
        if (x >= el.x1 && x <= el.x1 + approxW && y >= el.y1 - approxH && y <= el.y1 + 5) return el;
      }
    }
    return null;
  }, []);

  // --- Real-time Socket Event Integrations ---
  useEffect(() => {
    if (!socket) return;

    // Join room
    socket.emit('join-room', { roomId, nickname, color });

    // Initialize state on join
    socket.on('room-init', ({ elements: serverElements, users: serverUsers, chatHistory, yourSocketId }) => {
      setElements(serverElements);
      setUsersInRoom(serverUsers);
      setChatMessages(chatHistory);
      setLocalSocketId(yourSocketId);
      showNotification(`Connected to room: ${roomId}`);
    });

    // Handle new users
    socket.on('user-joined', (newUser) => {
      setUsersInRoom((prev) => [...prev.filter(u => u.socketId !== newUser.socketId), newUser]);
      showNotification(`${newUser.nickname} joined the board`);
    });

    // Handle user disconnect
    socket.on('user-left', ({ socketId }) => {
      setUsersInRoom((prev) => prev.filter((u) => u.socketId !== socketId));
      setLiveCursors((prev) => {
        const copy = { ...prev };
        delete copy[socketId];
        return copy;
      });
      setOtherActiveDrawings((prev) => {
        const copy = { ...prev };
        delete copy[socketId];
        return copy;
      });
    });

    // Sync cursors
    socket.on('cursor-moved', ({ socketId, nickname, color, x, y, currentTool }) => {
      setLiveCursors((prev) => ({
        ...prev,
        [socketId]: { nickname, color, x, y, currentTool }
      }));
    });

    // Sync drawing progress
    socket.on('drawing-progress-update', ({ socketId, element }) => {
      setOtherActiveDrawings((prev) => ({
        ...prev,
        [socketId]: element
      }));
    });

    // Sync committed shapes
    socket.on('drawing-committed', (element) => {
      setElements((prev) => [...prev.filter(el => el.id !== element.id), element]);
      // Remove progress stroke
      setOtherActiveDrawings((prev) => {
        const copy = { ...prev };
        delete copy[element.userId]; // elements carry userId
        return copy;
      });
    });

    // Sync undo actions
    socket.on('drawing-undone', ({ elementId }) => {
      setElements((prev) => prev.filter((el) => el.id !== elementId));
    });

    // Sync redo actions
    socket.on('drawing-redone', (element) => {
      setElements((prev) => [...prev.filter(el => el.id !== element.id), element]);
    });

    // Sync clear canvas
    socket.on('canvas-cleared', () => {
      setElements([]);
      setOtherActiveDrawings({});
      setSelectedElement(null);
      showNotification('Canvas cleared by room coordinator');
    });

    // Sync Chat Messages
    socket.on('new-message', (message) => {
      setChatMessages((prev) => [...prev, message]);
    });

    return () => {
      socket.off('room-init');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('cursor-moved');
      socket.off('drawing-progress-update');
      socket.off('drawing-committed');
      socket.off('drawing-undone');
      socket.off('drawing-redone');
      socket.off('canvas-cleared');
      socket.off('new-message');
    };
  }, [socket, roomId, nickname, color]);

  // --- Send Chat Message ---
  const handleSendMessage = (text) => {
    if (socket) {
      socket.emit('send-message', text);
    }
  };

  // --- Draw Elements Helper ---
  const drawSingleElement = (ctx, el) => {
    ctx.strokeStyle = el.color;
    ctx.lineWidth = el.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = el.color;

    switch (el.type) {
      case 'pencil':
      case 'eraser':
        // If eraser, we override color with canvas background
        if (el.type === 'eraser') {
          ctx.strokeStyle = '#121214';
        }
        if (el.points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x, el.points[i].y);
        }
        ctx.stroke();
        break;

      case 'line':
        ctx.beginPath();
        ctx.moveTo(el.x1, el.y1);
        ctx.lineTo(el.x2, el.y2);
        ctx.stroke();
        break;

      case 'rectangle':
        const rx = Math.min(el.x1, el.x2);
        const ry = Math.min(el.y1, el.y2);
        const rw = Math.abs(el.x2 - el.x1);
        const rh = Math.abs(el.y2 - el.y1);
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        if (el.fill) {
          ctx.fill();
        } else {
          ctx.stroke();
        }
        break;

      case 'circle':
        const radius = Math.sqrt(Math.pow(el.x2 - el.x1, 2) + Math.pow(el.y2 - el.y1, 2));
        ctx.beginPath();
        ctx.arc(el.x1, el.y1, radius, 0, 2 * Math.PI);
        if (el.fill) {
          ctx.fill();
        } else {
          ctx.stroke();
        }
        break;

      case 'text':
        ctx.font = `${el.width * 3 + 12}px 'Plus Jakarta Sans', sans-serif`;
        ctx.fillStyle = el.color;
        ctx.fillText(el.text, el.x1, el.y1);
        break;

      default:
        break;
    }
  };

  // --- Rendering Loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    // Translate & Zoom
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(scale, scale);

    // Draw all committed shapes
    elements.forEach((el) => {
      drawSingleElement(ctx, el);
    });

    // Draw in-progress drawings of other users
    Object.values(otherActiveDrawings).forEach((el) => {
      if (el) drawSingleElement(ctx, el);
    });

    // Draw current user's active stroke
    if (activeElement) {
      drawSingleElement(ctx, activeElement);
    }

    ctx.restore();

    // Render selection bounding box (in screen space coordinates)
    if (currentTool === 'select' && selectedElement) {
      const el = selectedElement;
      let minX, minY, maxX, maxY;
      
      if (el.type === 'rectangle' || el.type === 'line' || el.type === 'circle') {
        minX = Math.min(el.x1, el.x2);
        maxX = Math.max(el.x1, el.x2);
        minY = Math.min(el.y1, el.y2);
        maxY = Math.max(el.y1, el.y2);
      } else if (el.type === 'pencil' || el.type === 'eraser') {
        const xs = el.points.map(p => p.x);
        const ys = el.points.map(p => p.y);
        minX = Math.min(...xs);
        maxX = Math.max(...xs);
        minY = Math.min(...ys);
        maxY = Math.max(...ys);
      } else if (el.type === 'text') {
        minX = el.x1;
        maxX = el.x1 + 150;
        minY = el.y1 - (el.width * 3 + 12);
        maxY = el.y1 + 5;
      }

      if (minX !== undefined) {
        // Map canvas coords back to screen coordinates
        const pMin = getScreenCoords(minX, minY);
        const pMax = getScreenCoords(maxX, maxY);
        
        ctx.strokeStyle = 'var(--primary)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(
          pMin.x - 4 - canvas.getBoundingClientRect().left, 
          pMin.y - 4 - canvas.getBoundingClientRect().top, 
          (pMax.x - pMin.x) + 8, 
          (pMax.y - pMin.y) + 8
        );
        ctx.setLineDash([]); // Reset
      }
    }
  }, [elements, activeElement, otherActiveDrawings, panOffset, scale, selectedElement, currentTool, getScreenCoords]);

  // Handle Resize canvas
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      // Dynamic high DPI scaling
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Mouse / Touch Interactivity Handlers ---
  const handleMouseDown = (e) => {
    if (textInputPos) return; // Prevent clicking while editing text
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;
    const coords = getCanvasCoords(clientX, clientY);
    
    // PAN MODE / Space drag / Middle click
    if (currentTool === 'pan' || e.button === 1 || (e.button === 0 && e.shiftKey)) {
      setIsPanning(true);
      startPanRef.current = {
        x: clientX - panOffset.x,
        y: clientY - panOffset.y
      };
      return;
    }

    // SELECT MODE
    if (currentTool === 'select') {
      const clickedEl = getElementAtPosition(coords.x, coords.y, elements);
      if (clickedEl) {
        setSelectedElement(clickedEl);
        setIsDraggingElement(true);
        setDragStartPos({ x: coords.x, y: coords.y });
      } else {
        setSelectedElement(null);
      }
      return;
    }

    // TEXT TOOL
    if (currentTool === 'text') {
      setTextInputPos({
        x: clientX - rect.left,
        y: clientY - rect.top,
        canvasX: coords.x,
        canvasY: coords.y
      });
      return;
    }

    // DRAWING TOOLS
    setIsDrawing(true);
    const elementId = `el-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newElement = {
      id: elementId,
      userId: localSocketId,
      type: currentTool,
      x1: coords.x,
      y1: coords.y,
      x2: coords.x,
      y2: coords.y,
      points: [{ x: coords.x, y: coords.y }],
      color: strokeColor,
      width: strokeWidth,
      fill: useFill
    };
    
    setActiveElement(newElement);
    if (socket) {
      socket.emit('drawing-progress', newElement);
    }
  };

  const handleMouseMove = (e) => {
    const clientX = e.clientX;
    const clientY = e.clientY;
    const coords = getCanvasCoords(clientX, clientY);

    // Broadcast cursor positions
    if (socket && localSocketId) {
      socket.emit('cursor-move', { x: coords.x, y: coords.y, currentTool });
    }

    // If panning canvas
    if (isPanning) {
      setPanOffset({
        x: clientX - startPanRef.current.x,
        y: clientY - startPanRef.current.y
      });
      return;
    }

    // If dragging an element in select mode
    if (isDraggingElement && selectedElement) {
      const dx = coords.x - dragStartPos.x;
      const dy = coords.y - dragStartPos.y;
      setDragStartPos({ x: coords.x, y: coords.y });
      
      setElements((prev) =>
        prev.map((el) => {
          if (el.id === selectedElement.id) {
            const updated = { ...el };
            if (el.type === 'pencil' || el.type === 'eraser') {
              updated.points = el.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
            } else {
              updated.x1 = el.x1 + dx;
              updated.y1 = el.y1 + dy;
              updated.x2 = el.x2 + dx;
              updated.y2 = el.y2 + dy;
            }
            // Temporarily update selected element reference too
            setSelectedElement(updated);
            
            // Sync this edit in real-time as a "drawing progress stroke" to others
            if (socket) {
              socket.emit('drawing-progress', updated);
            }
            return updated;
          }
          return el;
        })
      );
      return;
    }

    // If drawing a stroke
    if (isDrawing && activeElement) {
      const updatedElement = { ...activeElement };
      if (currentTool === 'pencil' || currentTool === 'eraser') {
        updatedElement.points = [...activeElement.points, { x: coords.x, y: coords.y }];
      } else {
        updatedElement.x2 = coords.x;
        updatedElement.y2 = coords.y;
      }
      
      setActiveElement(updatedElement);
      if (socket) {
        socket.emit('drawing-progress', updatedElement);
      }
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isDraggingElement && selectedElement) {
      setIsDraggingElement(false);
      
      // Dragging finished. Commit updated drawing element
      if (socket) {
        // Send undo event for old state, then commit updated element
        socket.emit('drawing-undo', { elementId: selectedElement.id });
        socket.emit('drawing-commit', selectedElement);
      }
      
      // Update history stacks
      setUndoStack((prev) => [...prev, { action: 'edit', oldElement: selectedElement, newElement: selectedElement }]);
      setRedoStack([]);
      return;
    }

    if (isDrawing && activeElement) {
      setIsDrawing(false);
      
      // Commit shape locally
      setElements((prev) => [...prev, activeElement]);
      
      // Broadcast committed shape
      if (socket) {
        socket.emit('drawing-commit', activeElement);
      }

      // Add to local undo stack
      setUndoStack((prev) => [...prev, { action: 'draw', element: activeElement }]);
      setRedoStack([]); // Clear redo
      setActiveElement(null);
    }
  };

  // Zoom with scroll wheel centered on cursor
  const handleWheel = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Get current coordinate under cursor before zoom
    const wheelX = (mouseX - panOffset.x) / scale;
    const wheelY = (mouseY - panOffset.y) / scale;

    const zoomIntensity = 0.08;
    const zoomFactor = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
    
    let newScale = scale * zoomFactor;
    newScale = Math.min(Math.max(newScale, 0.15), 8); // clamp zoom 15% to 800%

    // Calculate new pan offsets to pin under mouse cursor
    const newPanX = mouseX - wheelX * newScale;
    const newPanY = mouseY - wheelY * newScale;

    setScale(newScale);
    setPanOffset({ x: newPanX, y: newPanY });
  };

  // --- Keyboard Event Listeners for Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore shortcuts if in chat input or text editing
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        return;
      }

      // Undo shortcut (Ctrl + Z or Cmd + Z)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
      
      // Redo shortcut (Ctrl + Y or Cmd + Shift + Z)
      if (((e.ctrlKey || e.metaKey) && e.key === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        handleRedo();
      }

      // Escape selection
      if (e.key === 'Escape') {
        setSelectedElement(null);
      }

      // Delete selected element
      if ((e.key === 'Delete' || e.key === 'Backspace') && currentTool === 'select' && selectedElement) {
        const elToDelete = selectedElement;
        setSelectedElement(null);
        
        // Remove from elements list
        setElements((prev) => prev.filter(el => el.id !== elToDelete.id));
        if (socket) {
          socket.emit('drawing-undo', { elementId: elToDelete.id });
        }
        
        setUndoStack((prev) => [...prev, { action: 'delete', element: elToDelete }]);
        setRedoStack([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [elements, undoStack, redoStack, selectedElement, currentTool]);

  // --- Canvas Actions (Undo / Redo / Clear / Export) ---
  
  // Undo handler (strictly undos user's own last action)
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    
    const lastAction = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    
    if (lastAction.action === 'draw') {
      const el = lastAction.element;
      setElements((prev) => prev.filter((item) => item.id !== el.id));
      if (socket) {
        socket.emit('drawing-undo', { elementId: el.id });
      }
      setRedoStack((prev) => [...prev, lastAction]);
    } else if (lastAction.action === 'delete') {
      const el = lastAction.element;
      setElements((prev) => [...prev, el]);
      if (socket) {
        socket.emit('drawing-commit', el);
      }
      setRedoStack((prev) => [...prev, lastAction]);
    } else if (lastAction.action === 'edit') {
      // Revert edit
      const { oldElement } = lastAction;
      setElements((prev) => prev.map(el => el.id === oldElement.id ? oldElement : el));
      if (socket) {
        socket.emit('drawing-undo', { elementId: oldElement.id });
        socket.emit('drawing-commit', oldElement);
      }
      setRedoStack((prev) => [...prev, lastAction]);
    }
    setSelectedElement(null);
  };

  // Redo handler
  const handleRedo = () => {
    if (redoStack.length === 0) return;
    
    const lastRedo = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));

    if (lastRedo.action === 'draw') {
      const el = lastRedo.element;
      setElements((prev) => [...prev, el]);
      if (socket) {
        socket.emit('drawing-commit', el);
      }
      setUndoStack((prev) => [...prev, lastRedo]);
    } else if (lastRedo.action === 'delete') {
      const el = lastRedo.element;
      setElements((prev) => prev.filter((item) => item.id !== el.id));
      if (socket) {
        socket.emit('drawing-undo', { elementId: el.id });
      }
      setUndoStack((prev) => [...prev, lastRedo]);
    } else if (lastRedo.action === 'edit') {
      // Re-apply edit
      const { newElement } = lastRedo;
      setElements((prev) => prev.map(el => el.id === newElement.id ? newElement : el));
      if (socket) {
        socket.emit('drawing-undo', { elementId: newElement.id });
        socket.emit('drawing-commit', newElement);
      }
      setUndoStack((prev) => [...prev, lastRedo]);
    }
    setSelectedElement(null);
  };

  const handleClear = () => {
    if (window.confirm('Are you sure you want to clear the entire whiteboard for everyone in this room?')) {
      if (socket) {
        socket.emit('canvas-clear');
      }
    }
  };

  // Export board as PNG
  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // To export properly, we need to create a temporary off-screen canvas 
    // that captures only the drawn elements bounding box with a clean background color.
    if (elements.length === 0) {
      alert('Draw something first before exporting!');
      return;
    }

    // Find bounding box coordinates of all drawings to crop nicely
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    elements.forEach(el => {
      if (el.type === 'pencil' || el.type === 'eraser') {
        el.points.forEach(p => {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        });
      } else {
        minX = Math.min(minX, el.x1, el.x2);
        minY = Math.min(minY, el.y1, el.y2);
        maxX = Math.max(maxX, el.x1, el.x2);
        maxY = Math.max(maxY, el.y1, el.y2);
      }
    });

    // Add padding (padding: 40px)
    minX -= 40;
    minY -= 40;
    maxX += 40;
    maxY += 40;

    const exportWidth = maxX - minX;
    const exportHeight = maxY - minY;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = exportWidth;
    tempCanvas.height = exportHeight;
    const tempCtx = tempCanvas.getContext('2d');

    // Fill background color
    tempCtx.fillStyle = '#121214';
    tempCtx.fillRect(0, 0, exportWidth, exportHeight);

    // Apply translation offset to draw coordinates relative to crop bounding box
    tempCtx.translate(-minX, -minY);

    // Draw all items on the export canvas
    elements.forEach(el => {
      drawSingleElement(tempCtx, el);
    });

    // Trigger download of canvas stream
    const dataUrl = tempCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `whiteboard-${roomId}.png`;
    link.href = dataUrl;
    link.click();
    showNotification('Exported whiteboard as PNG successfully!');
  };

  // --- Complete Text Tool input box ---
  const handleTextSubmit = () => {
    if (!textInputValue.trim() || !textInputPos) {
      setTextInputPos(null);
      setTextInputValue('');
      return;
    }

    const elementId = `el-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newTextElement = {
      id: elementId,
      userId: localSocketId,
      type: 'text',
      x1: textInputPos.canvasX,
      y1: textInputPos.canvasY,
      x2: textInputPos.canvasX + 150,
      y2: textInputPos.canvasY + 20,
      points: [],
      text: textInputValue.trim(),
      color: strokeColor,
      width: strokeWidth,
      fill: false
    };

    setElements((prev) => [...prev, newTextElement]);
    
    if (socket) {
      socket.emit('drawing-commit', newTextElement);
    }
    
    setUndoStack((prev) => [...prev, { action: 'draw', element: newTextElement }]);
    setRedoStack([]);
    
    // Clear input
    setTextInputPos(null);
    setTextInputValue('');
  };

  const handleTextKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTextSubmit();
    }
    if (e.key === 'Escape') {
      setTextInputPos(null);
      setTextInputValue('');
    }
  };

  // Auto focus text tool inputs
  useEffect(() => {
    if (textInputPos && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [textInputPos]);

  // Copy Room Link to clipboard helper
  const handleCopyRoomCode = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      showNotification('Share link copied to clipboard!');
    });
  };

  return (
    <div className="workspace-container" onWheel={handleWheel}>
      
      {/* Top Header Overlay info */}
      <div className="header-overlay glass-panel">
        <span className="room-logo">CanvasCollab</span>
        <div className="room-code-tag">
          <span>Room: {roomId}</span>
          <button 
            className="room-code-copy-btn" 
            onClick={handleCopyRoomCode}
            title="Copy board share link"
          >
            <RotateCcw size={12} style={{ transform: 'rotate(135deg)' }} />
          </button>
        </div>
      </div>

      {/* Online users presence overlay (top right) */}
      <UserList users={usersInRoom} localSocketId={localSocketId} />

      {/* Canvas Drawing Board */}
      <div className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          className={`canvas-element ${currentTool === 'pan' ? 'pan-mode' : ''} ${currentTool === 'select' ? 'select-mode' : ''}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {/* Real-time Custom Pointer Cursors Overlay */}
      <div className="cursors-container">
        {Object.entries(liveCursors).map(([socketId, data]) => {
          if (socketId === localSocketId) return null;
          // Filter offscreen / null coordinates
          if (data.x === null || data.y === null) return null;
          
          // Map canvas coordinates to current pan/zoom viewport screen coordinates
          const screenCoords = getScreenCoords(data.x, data.y);
          
          return (
            <div 
              key={socketId}
              className="live-cursor"
              style={{
                transform: `translate(${screenCoords.x}px, ${screenCoords.y}px)`
              }}
            >
              {/* Pointer Arrow */}
              <svg 
                width="16" 
                height="16" 
                viewBox="0 0 16 16" 
                fill="none" 
                style={{ transform: 'rotate(-45deg)' }}
              >
                <path 
                  d="M1 1L6 15L9.5 9.5L15 6L1 1Z" 
                  fill={data.color} 
                  stroke="white" 
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
              {/* Label */}
              <div 
                className="live-cursor-label"
                style={{ 
                  backgroundColor: data.color,
                  border: '1.5px solid white'
                }}
              >
                <span>{data.nickname}</span>
                <span className="live-cursor-tool">{data.currentTool}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Text Tool Textarea Popover */}
      {textInputPos && (
        <div 
          className="text-tool-input-box"
          style={{
            left: `${textInputPos.x}px`,
            top: `${textInputPos.y}px`
          }}
        >
          <textarea
            ref={textInputRef}
            className="text-tool-textarea"
            placeholder="Type text annotation..."
            value={textInputValue}
            onChange={(e) => setTextInputValue(e.target.value)}
            onKeyDown={handleTextKeyDown}
            onBlur={handleTextSubmit}
          />
        </div>
      )}

      {/* Ambient Zoom HUD overlay (bottom left) */}
      <div className="zoom-controls glass-panel">
        <button className="zoom-btn" onClick={() => handleZoom(0.85)} title="Zoom Out"><ZoomOut size={16} /></button>
        <span className="zoom-percentage">{Math.round(scale * 100)}%</span>
        <button className="zoom-btn" onClick={() => handleZoom(1.15)} title="Zoom In"><ZoomIn size={16} /></button>
        <button className="zoom-btn" onClick={() => handleZoom('reset')} title="Reset Fit"><RotateCcw size={14} /></button>
      </div>

      {/* Floating Canvas notification notifications */}
      {notification && (
        <div className="notification-toast">
          {notification}
        </div>
      )}

      {/* Whiteboard Options Toolbar (bottom center) */}
      <Toolbar
        currentTool={currentTool}
        setCurrentTool={setCurrentTool}
        strokeColor={strokeColor}
        setStrokeColor={setStrokeColor}
        fillColor={strokeColor} // Keep fill color matches stroke for presets
        setUseFill={setUseFill}
        useFill={useFill}
        strokeWidth={strokeWidth}
        setStrokeWidth={setStrokeWidth}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClear={handleClear}
        onExport={handleExport}
        undoDisabled={undoStack.length === 0}
        redoDisabled={redoStack.length === 0}
      />

      {/* Collapsible Chat Box (bottom right) */}
      <Chat 
        messages={chatMessages} 
        onSendMessage={handleSendMessage} 
        localSocketId={localSocketId} 
      />

    </div>
  );
}
