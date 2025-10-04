// components/EditableCell.tsx
'use client';

import { useState, useEffect } from 'react';

type EditableCellProps = {
  initialValue: string;
  onSave: (newValue: string) => void;
};

export default function EditableCell({ initialValue, onSave }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleSave = () => {
    onSave(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setValue(initialValue); // Revierte el cambio
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave} // Guarda al perder el foco
        onKeyDown={handleKeyDown} // Guarda con Enter, cancela con Escape
        autoFocus // Pone el cursor en el input automáticamente
        className="w-full px-1 py-0.5 border border-gray-300 rounded-md"
      />
    );
  }

  return (
    <div onClick={() => setIsEditing(true)} className="cursor-pointer w-full h-full">
      {value || <span className="text-gray-400">Vacío</span>}
    </div>
  );
}