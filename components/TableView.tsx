// components/TableView.tsx
'use client';

import { useState } from 'react';
import { useReactTable, getCoreRowModel, flexRender, ColumnDef, getPaginationRowModel, getSortedRowModel, SortingState } from '@tanstack/react-table';

// El tipo CompanyEvent debe estar aquí o importado
type CompanyEvent = {
  id: string;
  title: string;
  start: string; 
  end: string | undefined; 
  extendedProps: {
    description: string | null;
    video_link: string | null;
    team: string;
    // Añadimos la posibilidad de tener cualquier dato extra
    [key: string]: any; 
  }
};

type TableViewProps = {
  events: CompanyEvent[];
  columns: ColumnDef<CompanyEvent>[]; // 👈 Recibimos las columnas como prop
  onUpdateEvent: (eventId: string, columnId: string, value: string | number | null) => void;
  
};

export default function TableView({ events, columns, onUpdateEvent }: TableViewProps) {

  const [pagination, setPagination] = useState({
    pageIndex: 0, // Empezamos en la página 0
    pageSize: 10,  // Mostramos 10 filas por página
  });

  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data: events,
    columns,
    // PASO 3: Conectamos el estado y la lógica al "cerebro" de la tabla
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(), // <-- Encendemos la paginación
    getSortedRowModel: getSortedRowModel(), // <-- ¡Encendemos el ordenamiento!
    onSortingChange: setSorting, // Le decimos cómo actualizarse
    onPaginationChange: setPagination, // Le decimos cómo actualizarse
    state: {
      pagination,
      sorting, // Le pasamos el estado actual
    },
    // Añadimos una meta para pasar la función de actualización a las celdas
    meta: {
        updateData: (eventId: string, columnId: string, value: string | number | null) => { 
        onUpdateEvent(eventId, columnId, value);
      }
    }
  });

  // El JSX de la tabla se queda igual
  return (
    <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4" style={{ color: '#383838' }}>
            Vista de Tabla
        </h2>
        
        {/* CORRECCIÓN 2: Eliminamos el 'overflow-x-auto' y solo dejamos el borde */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
            
            {/* CORRECCIÓN 2: Usamos 'w-full' (ancho 100%) en lugar de 'min-w-full' */}
            <table className="w-full bg-white table-fixed">
                
                {/* CORRECCIÓN 1: Limpiamos los espacios en blanco dentro de <colgroup> para arreglar el error de hidratación */}
                <colgroup>
                  <col style={{ width: '25%' }} /><col style={{ width: '12,5%' }} /><col style={{ width: '12,5%' }} /><col style={{ width: '12,5%' }} /><col style={{ width: '12,5%' }} /><col style={{ width: '12,5%' }} /><col style={{ width: '12,5%' }} />
                </colgroup>

                <thead>
                {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id} className="border-b bg-gray-50">
                    {headerGroup.headers.map(header => (
                        <th 
                          key={header.id} 
                          className="text-left p-4 font-semibold cursor-pointer select-none"
                          onClick={header.column.getToggleSortingHandler()}
                          style={{ color: '#383838' }}
                        >
                          <div className="flex items-center gap-1 whitespace-nowrap">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <span className="text-sm">
                              {{ 'asc': '🔼', 'desc': '🔽' }[header.column.getIsSorted() as string] ?? ''}
                            </span>
                          </div>
                        </th>
                    ))}
                    </tr>
                ))}
                </thead>
                <tbody>
                {table.getRowModel().rows.map(row => (
                    <tr key={row.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    {row.getVisibleCells().map(cell => {
                      
                      // --- CORRECCIÓN 2: Lógica para estilos de celda ---
                      // Por defecto, las celdas alinean el texto arriba
                      let cellClasses = "p-4 text-sm text-gray-700 align-top"; 
                      
                      // Si es la columna 'title', AÑADIMOS las clases de truncado
                      if (cell.column.id === 'title') {
                        cellClasses += " whitespace-nowrap overflow-hidden text-ellipsis";
                      }

                      return (
                        <td 
                          key={cell.id} 
                          className={cellClasses}
                          // El tooltip solo se aplica a la columna 'title'
                          title={
                            cell.column.id === 'title' 
                            ? String(cell.getValue()) 
                            : undefined
                          }
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                    </tr>
                ))}
                </tbody>
            </table>
        </div>

        {/* El paginado se queda igual */}
        <div className="flex items-center justify-end gap-2 mt-4">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 rounded-md disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-sm text-gray-600">
              Página{' '}
              <strong>
                {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
              </strong>
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 rounded-md disabled:opacity-50"
            >
              Siguiente
            </button>
        </div>
    </div>
  );
}