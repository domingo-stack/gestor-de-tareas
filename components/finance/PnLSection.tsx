'use client';

import React, { useState } from 'react';

interface PnLSectionProps {
  title: string;
  data: Record<string, Record<string, number>>;
  details?: Record<string, Record<string, Record<string, Record<string, number>>>>;
  months: string[];
  parentKey: string;
  totalColor?: string;
  defaultOpen?: boolean;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

export default function PnLSection({
  title,
  data,
  details,
  months,
  parentKey,
  totalColor = 'bg-gray-50',
  defaultOpen = true,
}: PnLSectionProps) {
  const [isSectionOpen, setIsSectionOpen] = useState(defaultOpen);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (catName: string) => {
    setOpenCategories((prev) => ({ ...prev, [catName]: !prev[catName] }));
  };

  const monthlyTotals = months.map((m) => {
    return Object.values(data).reduce((sum, catObj) => sum + (catObj[m] || 0), 0);
  });

  return (
    <>
      {/* CABECERA DE SECCIÓN */}
      <tr
        onClick={() => setIsSectionOpen(!isSectionOpen)}
        className={`${totalColor} hover:bg-gray-100 cursor-pointer transition-colors border-b border-gray-200`}
      >
        <td className="px-6 py-3 font-bold text-gray-800 flex items-center gap-2 border-r border-gray-200 sticky left-0 z-10 bg-inherit">
          <span className="text-gray-400 text-xs">{isSectionOpen ? '▼' : '▶'}</span>
          {title}
        </td>
        {monthlyTotals.map((val, i) => (
          <td key={i} className="px-6 py-3 text-right font-semibold text-gray-800">
            {fmt(val)}
          </td>
        ))}
      </tr>

      {/* FILAS DE CATEGORÍAS */}
      {isSectionOpen &&
        Object.keys(data)
          .sort()
          .map((catName) => {
            const isCatOpen = openCategories[catName];
            const catDetails = details?.[parentKey]?.[catName] || {};
            const hasDetails = Object.keys(catDetails).length > 0;

            return (
              <React.Fragment key={catName}>
                <tr
                  onClick={() => hasDetails && toggleCategory(catName)}
                  className={`hover:bg-gray-50 border-b border-gray-100 group ${hasDetails ? 'cursor-pointer' : ''}`}
                >
                  <td className="px-6 py-2 text-sm font-medium text-gray-700 pl-8 border-r border-gray-100 sticky left-0 bg-white group-hover:bg-gray-50 z-10 flex items-center gap-2">
                    {hasDetails && <span className="text-[10px] text-gray-400">{isCatOpen ? '▼' : '▶'}</span>}
                    {!hasDetails && <span className="w-3"></span>}
                    {catName}
                  </td>
                  {months.map((m) => (
                    <td key={m} className="px-6 py-2 text-right text-sm text-gray-600">
                      {data[catName][m] ? fmt(data[catName][m]) : '-'}
                    </td>
                  ))}
                </tr>

                {/* FILAS DE DETALLE */}
                {isCatOpen &&
                  Object.keys(catDetails)
                    .sort()
                    .map((desc) => (
                      <tr key={desc} className="bg-gray-50/50 border-b border-gray-100">
                        <td
                          className="px-6 py-1.5 text-xs text-gray-500 pl-16 border-r border-gray-100 sticky left-0 bg-gray-50/50 z-10 italic truncate max-w-[200px]"
                          title={desc}
                        >
                          {desc}
                        </td>
                        {months.map((m) => (
                          <td key={m} className="px-6 py-1.5 text-right text-xs text-gray-400">
                            {catDetails[desc][m] ? fmt(catDetails[desc][m]) : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
              </React.Fragment>
            );
          })}
    </>
  );
}
