'use client';

import { useRef, useState, useEffect } from 'react';
import {
  FunnelIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

const COUNTRIES_LIST = ['Chile', 'Peru', 'Mexico', 'Colombia', 'Argentina', 'Ecuador', 'Costa Rica', 'Panama', 'El Salvador', 'Honduras', 'Guatemala', 'Venezuela', 'Bolivia', 'Uruguay', 'Paraguay', 'Republica Dominicana', 'Puerto Rico', 'Nicaragua', 'Espana'];
const PROVIDERS_LIST = ['Stripe', 'Dlocal', 'MercadoPago', 'Paypal', 'Manual'];
const TYPES_LIST = ['Nuevo', 'Renovacion'];
const PLANS = ['Mensual', 'Anual'];

interface GrowthFiltersProps {
  selectedCountries: string[];
  setSelectedCountries: (v: string[]) => void;
  selectedProviders: string[];
  setSelectedProviders: (v: string[]) => void;
  selectedTypes: string[];
  setSelectedTypes: (v: string[]) => void;
  selectedPlan: string;
  setSelectedPlan: (v: string) => void;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  onFilterChange: () => void;
}

export default function GrowthFilters({
  selectedCountries, setSelectedCountries,
  selectedProviders, setSelectedProviders,
  selectedTypes, setSelectedTypes,
  selectedPlan, setSelectedPlan,
  searchTerm, setSearchTerm,
  onFilterChange,
}: GrowthFiltersProps) {
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [isProviderOpen, setIsProviderOpen] = useState(false);
  const [isTypeOpen, setIsTypeOpen] = useState(false);

  const countryRef = useRef<HTMLDivElement>(null);
  const providerRef = useRef<HTMLDivElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: any) {
      if (countryRef.current && !countryRef.current.contains(event.target)) setIsCountryOpen(false);
      if (providerRef.current && !providerRef.current.contains(event.target)) setIsProviderOpen(false);
      if (typeRef.current && !typeRef.current.contains(event.target)) setIsTypeOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleFilter = (item: string, list: string[], setList: (v: string[]) => void) => {
    if (list.includes(item)) setList(list.filter(c => c !== item));
    else setList([...list, item]);
    onFilterChange();
  };

  const MultiSelect = ({ label, items, selected, setSelected, isOpen, setIsOpen, refEl }: {
    label: string; items: string[]; selected: string[]; setSelected: (v: string[]) => void;
    isOpen: boolean; setIsOpen: (v: boolean) => void; refEl: React.RefObject<HTMLDivElement | null>;
  }) => (
    <div className="relative w-full md:w-auto" ref={refEl}>
      <button onClick={() => setIsOpen(!isOpen)} className="w-full md:w-48 bg-gray-50 border border-gray-300 text-gray-700 text-sm rounded-md px-3 py-2 text-left flex justify-between items-center hover:bg-gray-100 transition-colors">
        <span className="truncate">{selected.length === 0 ? label : `${selected.length} seleccionados`}</span>
        <ChevronDownIcon className="w-4 h-4 text-gray-500" />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-2 max-h-60 overflow-y-auto">
          <div className="space-y-1">
            {items.map((c) => (
              <label key={c} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                <input type="checkbox" className="rounded text-blue-600 border-gray-300" checked={selected.includes(c)} onChange={() => toggleFilter(c, selected, setSelected)} />
                <span className="text-sm text-gray-700">{c}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <button onClick={() => { setSelected([]); onFilterChange(); }} className="w-full mt-2 text-xs text-center text-red-500 hover:text-red-700 py-1 border-t border-gray-100">Limpiar</button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-center z-20 relative">
      <div className="flex items-center gap-2 text-gray-400">
        <FunnelIcon className="w-5 h-5" />
        <span className="text-xs font-semibold uppercase tracking-wide">Filtros:</span>
      </div>

      <MultiSelect label="Todos los Paises" items={COUNTRIES_LIST} selected={selectedCountries} setSelected={setSelectedCountries} isOpen={isCountryOpen} setIsOpen={setIsCountryOpen} refEl={countryRef} />
      <MultiSelect label="Medio de Pago" items={PROVIDERS_LIST} selected={selectedProviders} setSelected={setSelectedProviders} isOpen={isProviderOpen} setIsOpen={setIsProviderOpen} refEl={providerRef} />
      <MultiSelect label="Tipo Cliente" items={TYPES_LIST} selected={selectedTypes} setSelected={setSelectedTypes} isOpen={isTypeOpen} setIsOpen={setIsTypeOpen} refEl={typeRef} />

      <select className="block w-full md:w-40 rounded-md border-gray-300 shadow-sm sm:text-sm py-2 px-3 border bg-gray-50" value={selectedPlan} onChange={(e) => { setSelectedPlan(e.target.value); onFilterChange(); }}>
        <option value="all">Planes</option>
        {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
      </select>

      <div className="relative flex-grow w-full md:w-auto">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
        </div>
        <input type="text" className="block w-full rounded-md border-gray-300 pl-10 sm:text-sm py-2 border" placeholder="Buscar..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); onFilterChange(); }} />
      </div>
    </div>
  );
}
