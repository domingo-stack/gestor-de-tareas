// components/EditableSelectCell.tsx
'use client';

import { useState, useEffect } from 'react';

type EditableSelectCellProps = {
  initialValue: string;
  onSave: (newValue: string) => void;
  options: string[]; // Recibimos la lista de opciones
};

export default function EditableSelectCell({ initialValue, onSave, options }: EditableSelectCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleSave = (newValue: string) => {
    onSave(newValue);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <select
        value={value}
        onChange={(e) => handleSave(e.target.value)}
        onBlur={() => setIsEditing(false)} // Sale del modo edición si se hace clic fuera
        autoFocus
        className="w-full p-0 border-none rounded-md bg-gray-100"
      >
        {options.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    );
  }

  return (
    <div onClick={() => setIsEditing(true)} className="cursor-pointer w-full h-full">
      {value || <span className="text-gray-400">Sin estado</span>}
    </div>
  );
}