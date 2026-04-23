'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import ModuleGuard from '@/components/ModuleGuard';
import { ArrowLeftIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import CarouselEditor from '@/components/contenido-social/CarouselEditor';
import ExportModal from '@/components/contenido-social/ExportModal';
import type { ContentGeneration, Carousel } from '@/lib/content-social-types';

export default function EditorPage() {
  const { blogId, generationId } = useParams<{ blogId: string; generationId: string }>();
  const router = useRouter();
  const { supabase } = useAuth();
  const [generation, setGeneration] = useState<ContentGeneration | null>(null);
  const [carousels, setCarousels] = useState<Carousel[]>([]);
  const [activeCarousel, setActiveCarousel] = useState(0);
  const [showExport, setShowExport] = useState(false);
  const [colorScheme, setColorScheme] = useState('naranja');
  const saveTimer = useRef<NodeJS.Timeout>(undefined);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('content_generations').select('*').eq('id', generationId).single()
      .then(({ data }) => {
        if (data) {
          const gen = data as ContentGeneration;
          setGeneration(gen);
          const source = gen.edited_result || gen.result;
          setCarousels(source.carousels || []);
        }
      });
  }, [supabase, generationId]);

  const saveEdits = useCallback((updatedCarousels: Carousel[]) => {
    if (!supabase || !generation) return;
    const editedResult = {
      ...generation.result,
      carousels: updatedCarousels,
    };
    supabase.from('content_generations').update({
      edited_result: editedResult,
      status: 'edited',
    }).eq('id', generationId).then(({ error }) => {
      if (error) console.error('Error saving:', error);
    });
  }, [supabase, generation, generationId]);

  const handleCarouselChange = useCallback((updated: Carousel) => {
    setCarousels(prev => {
      const next = [...prev];
      next[activeCarousel] = updated;
      // Debounce save
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveEdits(next), 1500);
      return next;
    });
  }, [activeCarousel, saveEdits]);

  const handleExported = async () => {
    if (!supabase) return;
    await supabase.from('content_generations').update({
      status: 'exported',
      exported_at: new Date().toISOString(),
    }).eq('id', generationId);
    toast.success('Carrusel exportado');
    setShowExport(false);
  };

  if (!generation) {
    return (
      <AuthGuard>
        <ModuleGuard module="mod_contenido_social">
          <div className="p-6 max-w-5xl mx-auto">
            <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
          </div>
        </ModuleGuard>
      </AuthGuard>
    );
  }

  const currentCarousel = carousels[activeCarousel];

  return (
    <AuthGuard>
      <ModuleGuard module="mod_contenido_social">
        <div className="p-6 max-w-5xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push(`/contenido-social/${blogId}`)}
                className="p-1.5 hover:bg-gray-100 rounded-lg">
                <ArrowLeftIcon className="w-4 h-4 text-gray-500" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-gray-900 truncate max-w-md">{generation.blog_title}</h1>
                <p className="text-xs text-gray-400">
                  {generation.model_used?.split('/').pop()} · {carousels.length} carruseles · {generation.result?.metadata?.total_tokens?.toLocaleString()} tokens
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowExport(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                <ArrowDownTrayIcon className="w-4 h-4" />
                Exportar
              </button>
            </div>
          </div>

          {/* Carousel tabs */}
          {carousels.length > 1 && (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
              {carousels.map((_, i) => (
                <button key={i} onClick={() => setActiveCarousel(i)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeCarousel === i ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  Carrusel {i + 1}
                </button>
              ))}
            </div>
          )}

          {/* Editor */}
          {currentCarousel && (
            <CarouselEditor carousel={currentCarousel} onChange={handleCarouselChange} />
          )}

          {/* Export modal */}
          {showExport && currentCarousel && (
            <ExportModal
              carousel={currentCarousel}
              colorScheme={colorScheme}
              onClose={() => setShowExport(false)}
              onExported={handleExported}
            />
          )}
        </div>
      </ModuleGuard>
    </AuthGuard>
  );
}
