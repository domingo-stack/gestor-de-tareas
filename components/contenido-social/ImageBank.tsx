'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { PhotoIcon, TrashIcon, ArrowUpTrayIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';

interface Props {
  onSelectImage: (url: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

interface StoredImage {
  name: string;
  url: string;
  created_at: string;
}

export default function ImageBank({ onSelectImage, isOpen, onClose }: Props) {
  const { supabase } = useAuth();
  const [images, setImages] = useState<StoredImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchImages = async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase.storage.from('content-images').list('', {
      limit: 100,
      sortBy: { column: 'created_at', order: 'desc' },
    });
    if (data) {
      const imgs = data
        .filter(f => !f.name.startsWith('.'))
        .map(f => ({
          name: f.name,
          url: supabase.storage.from('content-images').getPublicUrl(f.name).data.publicUrl,
          created_at: f.created_at || '',
        }));
      setImages(imgs);
    }
    if (error) console.error('Error listing images:', error);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) fetchImages();
  }, [isOpen, supabase]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !supabase) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop();
      const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('content-images').upload(name, file, {
        cacheControl: '31536000',
        upsert: false,
      });
      if (error) {
        toast.error(`Error subiendo ${file.name}`);
        console.error(error);
      }
    }

    toast.success(`${files.length} imagen(es) subida(s)`);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    fetchImages();
  };

  const handleDelete = async (name: string) => {
    if (!supabase) return;
    const { error } = await supabase.storage.from('content-images').remove([name]);
    if (error) {
      toast.error('Error eliminando imagen');
    } else {
      toast.success('Imagen eliminada');
      setImages(prev => prev.filter(i => i.name !== name));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <PhotoIcon className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-800">Banco de Imágenes</h3>
            <span className="text-xs text-gray-400">{images.length} imágenes</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 cursor-pointer">
              <ArrowUpTrayIcon className="w-3.5 h-3.5" />
              {uploading ? 'Subiendo...' : 'Subir imagen'}
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload}
                className="hidden" disabled={uploading} />
            </label>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
              <XMarkIcon className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-12 text-gray-400">Cargando imágenes...</div>
          ) : images.length === 0 ? (
            <div className="text-center py-12">
              <PhotoIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No hay imágenes. Sube logos, fotos o iconos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {images.map((img) => (
                <div key={img.name} className="group relative rounded-lg overflow-hidden border border-gray-200 hover:border-blue-300 transition-colors">
                  <img src={img.url} alt={img.name}
                    className="w-full aspect-square object-cover cursor-pointer"
                    onClick={() => { onSelectImage(img.url); onClose(); }} />
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(img.name); }}
                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                  <p className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-2 py-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                    {img.name}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
