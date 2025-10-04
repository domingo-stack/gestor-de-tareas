// components/EditableDateCell.tsx
'use client';

import { useState, useEffect } from 'react';

type EditableDateCellProps = {
  initialValue: string;
  onSave: (newValue: string) => void;
};

export default function EditableDateCell({ initialValue, onSave }: EditableDateCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  // Las fechas de HTML necesitan el formato YYYY-MM-DD
  const [value, setValue] = useState(new Date(initialValue).toISOString().split('T')[0]);

  useEffect(() => {
    setValue(new Date(initialValue).toISOString().split('T')[0]);
  }, [initialValue]);

  const handleSave = () => {
    onSave(value);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        autoFocus
        className="w-full p-0 border-none rounded-md bg-gray-100"
      />
    );
  }

  return (
    <div onClick={() => setIsEditing(true)} className="cursor-pointer w-full h-full">
      {new Date(value).toLocaleDateString('es-CL')}
    </div>
  );
}