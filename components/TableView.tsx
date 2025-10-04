// components/TableView.tsx
'use client';

import { useReactTable, getCoreRowModel, flexRender, ColumnDef } from '@tanstack/react-table';

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
  const table = useReactTable({
    data: events,
    columns, // Usamos las columnas que nos pasan
    getCoreRowModel: getCoreRowModel(),
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
        <div className="overflow-x-auto">
            <table className="min-w-full bg-white border rounded-lg">
                <thead>
                {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id} className="border-b">
                    {headerGroup.headers.map(header => (
                        <th key={header.id} className="text-left p-4 font-semibold" style={{ color: '#383838' }}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                    ))}
                    </tr>
                ))}
                </thead>
                <tbody>
                {table.getRowModel().rows.map(row => (
                     <tr 
                     key={row.id} 
                     className="border-b hover:bg-gray-50 cursor-pointer"
                   >
                     {row.getVisibleCells().map(cell => (
                       <td key={cell.id} className="p-4 text-sm text-gray-700">
                         {flexRender(cell.column.columnDef.cell, cell.getContext())}
                       </td>
                     ))}
                   </tr>
                ))}
                </tbody>
            </table>
        </div>
    </div>
  );
}