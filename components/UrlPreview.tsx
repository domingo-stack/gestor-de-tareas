import React from 'react';

type UrlPreviewProps = {
  url: string;
  onClear?: () => void;
};

export default function UrlPreview({ url, onClear }: UrlPreviewProps) {
  if (!url) return null;

  // Detectar tipo de archivo
  const isImage = /\.(jpeg|jpg|gif|png|webp|bmp|svg)$/i.test(url);
  const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(url);
  
  // Detectar YouTube
  const youtubeMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^#&?]*).*/);
  const isYoutube = youtubeMatch && youtubeMatch[1];

  return (
    <div className="mt-3 relative group">
      
      {/* Botón X para borrar (solo aparece si pasas el mouse) */}
      {onClear && (
        <button 
            onClick={onClear}
            type="button"
            className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1 shadow-sm hover:bg-red-200 z-20 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Quitar adjunto"
        >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
        </button>
      )}

      {/* VISTA PREVIA IMAGEN */}
      {isImage && (
        <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
            <img src={url} alt="Preview" className="w-full h-auto max-h-60 object-contain" />
        </div>
      )}

      {/* VISTA PREVIA VIDEO */}
      {isVideo && (
        <div className="rounded-lg overflow-hidden border border-gray-200 bg-black">
            <video src={url} controls className="w-full max-h-60" />
        </div>
      )}

      {/* VISTA PREVIA YOUTUBE */}
      {isYoutube && (
        <div className="relative w-full pt-[56.25%] rounded-lg overflow-hidden border border-gray-200 bg-black">
            <iframe
                src={`https://www.youtube.com/embed/${youtubeMatch[1]}`}
                className="absolute top-0 left-0 w-full h-full"
                allowFullScreen
                title="YouTube Preview"
            />
        </div>
      )}

      {/* VISTA PREVIA GENÉRICA (LINK) */}
      {!isImage && !isVideo && !isYoutube && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-md flex items-center gap-2 text-sm text-blue-600">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
                <path fillRule="evenodd" d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.451a.75.75 0 111.061 1.06l-3.45 3.451a1.125 1.125 0 001.587 1.595l3.454-3.553a3 3 0 000-4.242z" clipRule="evenodd" />
            </svg>
            <a href={url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline font-medium">
                {url}
            </a>
        </div>
      )}
    </div>
  );
}