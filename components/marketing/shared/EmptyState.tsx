'use client';

import { SignalSlashIcon } from '@heroicons/react/24/outline';

interface EmptyStateProps {
  platform: string;
  message?: string;
}

export default function EmptyState({ platform, message }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <SignalSlashIcon className="w-10 h-10 text-gray-300 mb-3" />
      <p className="text-sm font-medium text-gray-500">{platform} no está conectada</p>
      <p className="text-xs text-gray-400 mt-1 max-w-sm">
        {message || 'Agrega las credenciales en la configuración para ver sus datos.'}
      </p>
    </div>
  );
}
