// Inline editable name (fish, tank) with a ✏️ hint so it reads as editable. Enter saves, Esc reverts,
// an empty name reverts.
import { useEffect, useState } from 'react';

export function NameField({ value, onSave, maxLength, label, size = 'lg' }: { value: string; onSave: (name: string) => void; maxLength: number; label: string; size?: 'md' | 'lg' }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft.trim()) onSave(draft);
    else setDraft(value);
  };
  return (
    <label className={`namefield namefield-${size}`}>
      <input
        value={draft}
        maxLength={maxLength}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(value);
            e.stopPropagation();
            e.currentTarget.blur();
          }
        }}
      />
      <span className="namefield-pencil" aria-hidden="true">
        ✏️
      </span>
    </label>
  );
}
