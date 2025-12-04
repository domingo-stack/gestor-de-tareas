'use client';

import { useState, forwardRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import UrlPreview from './UrlPreview';

type MediaTextareaProps = {
  value: string;
  // Aceptamos el evento nativo para que las menciones funcionen
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; 
  // Función extra para cuando el componente inyecta una URL (Paste)
  onTextInsert?: (newValue: string) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  className?: string;
  // Permitimos pasar otros eventos como onKeyDown, onBlur, etc.
  [key: string]: any; 
};

// Usamos forwardRef para exponer el textarea real al padre (Crucial para mentions)
const MediaTextarea = forwardRef<HTMLTextAreaElement, MediaTextareaProps>(({ 
  value, 
  onChange,
  onTextInsert,
  disabled = false,
  rows = 4,
  className = "",
  placeholder = "Escribe aquí...",
  ...props // Resto de props (onKeyDown, onBlur, etc.)
}, ref) => {
  
  const { supabase } = useAuth();
  const [uploading, setUploading] = useState(false);

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Si el padre pasó un onPaste propio, lo ejecutamos también
    if (props.onPaste) {
        props.onPaste(e);
    }

    if (e.clipboardData.files.length > 0) {
        e.preventDefault();
        const file = e.clipboardData.files[0];

        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;
        if (!supabase) return;

        try {
            setUploading(true);
            const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
            const fileName = `${Date.now()}_${cleanName}`;

            const { error } = await supabase
                .storage
                .from('media-attachments')
                .upload(fileName, file);

            if (error) throw error;

            const { data: urlData } = supabase
                .storage
                .from('media-attachments')
                .getPublicUrl(fileName);

            // AÑADIR URL: Usamos el prop especial para actualizar el texto
            const textToAppend = ` ${urlData.publicUrl} `;
            const newValue = value ? `${value}\n${textToAppend}` : textToAppend;
            
            if (onTextInsert) {
                onTextInsert(newValue);
            } else {
                // Fallback si no nos pasaron onTextInsert, intentamos simular un evento (limitado)
                // Pero lo ideal es usar onTextInsert en el padre.
            }

        } catch (error: any) {
            console.error('Error subiendo:', error);
            alert('Error al subir archivo: ' + error.message);
        } finally {
            setUploading(false);
        }
    }
  };

  const urls = value?.match(/(https?:\/\/[^\s]+)/g) || [];
  const uniqueUrls = Array.from(new Set(urls));

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="relative">
        <textarea
            ref={ref} // 👈 Pasamos la referencia aquí
            value={value}
            onChange={onChange}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={disabled || uploading}
            rows={rows}
            className={`w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 resize-y ${disabled ? 'bg-gray-100' : 'bg-white'}`}
            {...props} // Pasamos onKeyDown, onBlur, etc.
        />
        {uploading && (
            <div className="absolute bottom-3 right-3 text-xs text-orange-500 font-medium animate-pulse bg-white px-2 py-1 rounded shadow-sm border border-orange-100">
                Subiendo archivo... ⏳
            </div>
        )}
      </div>
      
      {uniqueUrls.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-1">
            {uniqueUrls.map((url, index) => (
                <div key={index} className="max-w-xs w-full">
                    <UrlPreview url={url as string} />
                </div>
            ))}
        </div>
      )}
    </div>
  );
});

MediaTextarea.displayName = 'MediaTextarea';
export default MediaTextarea;