'use client';

import { useState, useCallback } from 'react';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import SlidePreview from './SlidePreview';
import SlideEditor from './SlideEditor';
import type { Carousel, Slide } from '@/lib/content-social-types';

interface Props {
  carousel: Carousel;
  onChange: (updated: Carousel) => void;
}

export default function CarouselEditor({ carousel, onChange }: Props) {
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [colorScheme, setColorScheme] = useState('naranja');

  const currentSlide = carousel.slides[selectedSlide];

  const updateSlide = useCallback((updated: Slide) => {
    const newSlides = [...carousel.slides];
    newSlides[selectedSlide] = updated;
    if (updated.color) setColorScheme(updated.color);
    onChange({ ...carousel, slides: newSlides });
  }, [carousel, selectedSlide, onChange]);

  const updateCaption = useCallback((caption: string) => {
    onChange({ ...carousel, caption });
  }, [carousel, onChange]);

  const updateHashtags = useCallback((value: string) => {
    onChange({ ...carousel, hashtags: value.split(' ').filter(Boolean) });
  }, [carousel, onChange]);

  const copyCaption = () => {
    const text = `${carousel.caption}\n\n${carousel.hashtags.join(' ')}`;
    navigator.clipboard.writeText(text);
    toast.success('Caption copiado al clipboard');
  };

  return (
    <div className="space-y-5">
      {/* Slide thumbnails */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex gap-3 overflow-x-auto pb-2">
          {carousel.slides.map((slide, i) => (
            <button key={i} onClick={() => setSelectedSlide(i)}
              className={`relative flex-shrink-0 rounded-lg overflow-hidden transition-all ${
                selectedSlide === i
                  ? 'ring-2 ring-blue-500 ring-offset-2 scale-105'
                  : 'hover:ring-1 hover:ring-gray-300'
              }`}>
              <SlidePreview slide={slide} size={140} colorScheme={slide.color || colorScheme} />
              <div className={`absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                selectedSlide === i ? 'bg-blue-600 text-white' : 'bg-black/50 text-white'
              }`}>
                {slide.type === 'cover' ? 'Cover' : slide.type === 'cta' ? 'CTA' : i + 1}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Selected slide preview + editor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="flex justify-center">
          <SlidePreview slide={currentSlide} size={420} colorScheme={currentSlide.color || colorScheme} />
        </div>
        <SlideEditor
          slide={currentSlide}
          onChange={updateSlide}
          onApplyAllTemplate={(template) => {
            const newSlides = carousel.slides.map(s => ({ ...s, template: template as 'centered' | 'split' | 'minimal' }));
            onChange({ ...carousel, slides: newSlides });
          }}
          onApplyAllColor={(color) => {
            const newSlides = carousel.slides.map(s => ({ ...s, color }));
            onChange({ ...carousel, slides: newSlides });
            setColorScheme(color);
          }}
        />
      </div>

      {/* Caption & hashtags */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-gray-700">Caption & Hashtags</h4>
          <button onClick={copyCaption}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">
            <ClipboardDocumentIcon className="w-3.5 h-3.5" />
            Copiar caption
          </button>
        </div>
        <textarea value={carousel.caption} onChange={e => updateCaption(e.target.value)} rows={4}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none" />
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Hashtags</label>
          <input value={carousel.hashtags.join(' ')} onChange={e => updateHashtags(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-blue-600" />
        </div>
      </div>
    </div>
  );
}
