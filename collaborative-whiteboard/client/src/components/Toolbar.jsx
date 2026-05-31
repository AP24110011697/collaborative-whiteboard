import React, { useState } from 'react';
import { 
  Square, 
  Circle, 
  Minus, 
  Pencil, 
  Type, 
  Eraser, 
  Undo2, 
  Redo2, 
  Trash2, 
  Download, 
  Hand,
  MousePointer,
  Palette
} from 'lucide-react';

const BRUSH_SIZES = [
  { label: 'S', value: 2 },
  { label: 'M', value: 5 },
  { label: 'L', value: 10 },
  { label: 'XL', value: 20 }
];

const PRESET_COLORS = [
  '#ffffff', // White
  '#f3f4f6', // Light gray
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Yellow
  '#10b981', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#ec4899'  // Pink
];

export default function Toolbar({ 
  currentTool, 
  setCurrentTool, 
  strokeColor, 
  setStrokeColor,
  fillColor,
  setUseFill,
  useFill,
  strokeWidth, 
  setStrokeWidth, 
  onUndo, 
  onRedo, 
  onClear, 
  onExport,
  undoDisabled,
  redoDisabled
}) {
  const [showColorPopover, setShowColorPopover] = useState(false);

  const tools = [
    { id: 'select', icon: <MousePointer size={18} />, label: 'Select & Move' },
    { id: 'pan', icon: <Hand size={18} />, label: 'Pan Canvas (Space+Drag)' },
    { id: 'pencil', icon: <Pencil size={18} />, label: 'Pencil Tool' },
    { id: 'line', icon: <Minus size={18} />, label: 'Line Tool' },
    { id: 'rectangle', icon: <Square size={18} />, label: 'Rectangle Tool' },
    { id: 'circle', icon: <Circle size={18} />, label: 'Circle Tool' },
    { id: 'text', icon: <Type size={18} />, label: 'Text Annotation' },
    { id: 'eraser', icon: <Eraser size={18} />, label: 'Eraser Tool' }
  ];

  return (
    <div className="toolbar-container glass-panel">
      {/* Drawing Tools Section */}
      <div className="toolbar-section">
        {tools.map((t) => (
          <button
            key={t.id}
            className={`tool-btn ${currentTool === t.id ? 'active' : ''}`}
            onClick={() => {
              setCurrentTool(t.id);
              setShowColorPopover(false);
            }}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className="toolbar-separator"></div>

      {/* Brush Styles & Colors (Popover triggered) */}
      <div className="toolbar-section config-trigger">
        <button
          className={`tool-btn ${showColorPopover ? 'active' : ''}`}
          onClick={() => setShowColorPopover(!showColorPopover)}
          title="Color & Style Settings"
        >
          <Palette size={18} />
        </button>

        {showColorPopover && (
          <div className="config-popover glass-panel">
            {/* Brush Size Selector */}
            <div>
              <div className="popover-title" style={{ marginBottom: '8px' }}>Thickness</div>
              <div className="size-selector">
                {BRUSH_SIZES.map((size) => (
                  <button
                    key={size.value}
                    className={`size-dot-btn ${strokeWidth === size.value ? 'active' : ''}`}
                    onClick={() => setStrokeWidth(size.value)}
                    type="button"
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Palette */}
            <div>
              <div className="popover-title" style={{ marginBottom: '8px' }}>Colors</div>
              <div className="color-palette-grid">
                {PRESET_COLORS.map((color) => (
                  <div
                    key={color}
                    className={`palette-color ${strokeColor === color ? 'active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setStrokeColor(color)}
                  />
                ))}
              </div>
            </div>

            {/* Custom Color Input */}
            <div className="custom-color-row">
              <input
                type="color"
                className="custom-color-input"
                value={strokeColor}
                onChange={(e) => setStrokeColor(e.target.value)}
              />
              <span className="custom-color-label">Custom Hex</span>
            </div>

            {/* Shapes Fill Option (relevant for shapes only) */}
            {['rectangle', 'circle'].includes(currentTool) && (
              <div className="fill-toggle-row" style={{ marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={useFill}
                    onChange={(e) => setUseFill(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  Fill Shape
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="toolbar-separator"></div>

      {/* Undo & Redo */}
      <div className="toolbar-section">
        <button
          className="tool-btn"
          onClick={onUndo}
          disabled={undoDisabled}
          style={{ opacity: undoDisabled ? 0.35 : 1, cursor: undoDisabled ? 'not-allowed' : 'pointer' }}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={18} />
        </button>
        <button
          className="tool-btn"
          onClick={onRedo}
          disabled={redoDisabled}
          style={{ opacity: redoDisabled ? 0.35 : 1, cursor: redoDisabled ? 'not-allowed' : 'pointer' }}
          title="Redo (Ctrl+Y)"
        >
          <Redo2 size={18} />
        </button>
      </div>

      <div className="toolbar-separator"></div>

      {/* Canvas Utilities */}
      <div className="toolbar-section">
        <button
          className="tool-btn"
          onClick={onClear}
          title="Clear Canvas"
          style={{ color: 'rgba(239, 68, 68, 0.85)' }}
        >
          <Trash2 size={18} />
        </button>
        <button
          className="tool-btn"
          onClick={onExport}
          title="Export Canvas (PNG)"
        >
          <Download size={18} />
        </button>
      </div>
    </div>
  );
}
