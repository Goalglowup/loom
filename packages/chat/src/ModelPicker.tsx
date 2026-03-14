import { useState, useRef, useEffect } from 'react';

interface ModelPickerProps {
  value: string;
  onChange: (model: string) => void;
  options: string[];
  disabled?: boolean;
}

const DEFAULT_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
];

export default function ModelPicker({ value, onChange, options, disabled }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const modelList = options.length > 0 ? options : DEFAULT_MODELS;
  const filtered = modelList.filter(o => o.toLowerCase().includes(value.toLowerCase()));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="arachne-chat-model-picker">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Model"
        disabled={disabled}
        className="arachne-chat-model-input"
      />
      {open && filtered.length > 0 && (
        <div className="arachne-chat-model-dropdown">
          {filtered.map(opt => (
            <button
              key={opt}
              type="button"
              onMouseDown={e => {
                e.preventDefault();
                onChange(opt);
                setOpen(false);
              }}
              className={`arachne-chat-model-option ${opt === value ? 'active' : ''}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
