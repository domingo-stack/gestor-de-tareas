'use client';

import { useState, useRef } from 'react';
import { XMarkIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { EXPORT_FORMATS } from '@/lib/content-social-types';
import SlidePreview from './SlidePreview';
import type { Carousel } from '@/lib/content-social-types';

interface Props {
  carousel: Carousel;
  colorScheme: string;
  onClose: () => void;
  onExported: () => void;
}

export default function ExportModal({ carousel, colorScheme, onClose, onExported }: Props) {
  const [format, setFormat] = useState(EXPORT_FORMATS[0]);
  const [selectedSlides, setSelectedSlides] = useState<Set<number>>(
    new Set(carousel.slides.map((_, i) => i))
  );
  const [includeCaption, setIncludeCaption] = useState(true);
  const [exporting, setExporting] = useState(false);
  const renderRef = useRef<HTMLDivElement>(null);

  const toggleSlide = (i: number) => {
    setSelectedSlides(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const exportSlides = async () => {
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const JSZip = (await import('jszip')).default;
      const { saveAs } = await import('file-saver');

      const zip = new JSZip();

      for (const i of Array.from(selectedSlides).sort()) {
        const slide = carousel.slides[i];
        // Create a temporary container for full-size render
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0';
        document.body.appendChild(container);

        const { createRoot } = await import('react-dom/client');
        const root = createRoot(container);

        await new Promise<void>((resolve) => {
          root.render(
            <div style={{ width: format.width, height: format.height }}>
              <SlidePreview slide={slide} size={format.width} colorScheme={slide.color || colorScheme} />
            </div>
          );
          setTimeout(resolve, 200);
        });

        const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
          width: format.width,
          height: format.height,
          scale: 2,
          useCORS: true,
          backgroundColor: null,
        });

        const blob = await new Promise<Blob>((res) => canvas.toBlob(b => res(b!), 'image/png'));
        zip.file(`slide-${i + 1}-${slide.type}.png`, blob);

        root.unmount();
        document.body.removeChild(container);
      }

      if (includeCaption) {
        const captionText = `${carousel.caption}\n\n${carousel.hashtags.join(' ')}`;
        zip.file('caption.txt', captionText);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, `carrusel-${carousel.id || 'export'}.zip`);
      onExported();
    } catch (err) {
      console.error('Error exporting:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">Exportar Carrusel</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <XMarkIcon className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Formato</label>
          <select value={format.value}
            onChange={e => setFormat(EXPORT_FORMATS.find(f => f.value === e.target.value) || EXPORT_FORMATS[0])}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
            {EXPORT_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-500">Slides a exportar</label>
          {carousel.slides.map((slide, i) => (
            <label key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={selectedSlides.has(i)}
                onChange={() => toggleSlide(i)} className="rounded" />
              <span className="text-sm text-gray-700">
                Slide {i + 1} <span className="text-gray-400">({slide.type === 'cover' ? 'Cover' : slide.type === 'cta' ? 'CTA' : slide.title?.slice(0, 30) + '...'})</span>
              </span>
            </label>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={includeCaption} onChange={e => setIncludeCaption(e.target.checked)} className="rounded" />
          Incluir caption como .txt
        </label>

        <div ref={renderRef} />

        <button onClick={exportSlides} disabled={exporting || selectedSlides.size === 0}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
          <ArrowDownTrayIcon className="w-4 h-4" />
          {exporting ? 'Exportando...' : `Descargar ZIP (${selectedSlides.size} slides)`}
        </button>
      </div>
    </div>
  );
}
