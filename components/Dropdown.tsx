// components/Dropdown.tsx
'use client'

import { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import React from 'react';

type DropdownOption<T extends string> = {
  value: T;
  label: string;
};

// Usamos genéricos (<T>) para que el componente sea más flexible con los tipos
type DropdownProps<T extends string> = {
  options: DropdownOption<T>[];
  selectedValue: T;
  onSelect: React.Dispatch<React.SetStateAction<T>>;
  label: string;
  className?: string;
};

export default function Dropdown<T extends string>({ 
  options, 
  selectedValue, 
  onSelect, 
  label, 
  className = '' 
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOptionLabel = options.find(option => option.value === selectedValue)?.label || label;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownRef]);

  const handleOptionClick = (value: T) => {
    onSelect(value);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        className="inline-flex justify-between items-center w-full sm:w-auto gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedOptionLabel}
        <ChevronDownIcon className="-mr-1 h-5 w-5 text-gray-400" />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
        >
          <div className="py-1">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => handleOptionClick(option.value)}
                className={`block w-full text-left px-4 py-2 text-sm ${
                  selectedValue === option.value ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}