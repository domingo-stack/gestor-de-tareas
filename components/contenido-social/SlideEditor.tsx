'use client';

import { useState } from 'react';
import { PhotoIcon, TrashIcon, ArrowsPointingOutIcon, ArrowPathIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import ImageBank from './ImageBank';
import type { Slide, SlideImage, SlideTypography, FontFamily, FontWeight, TextAlign } from '@/lib/content-social-types';
import { FONT_OPTIONS } from '@/lib/content-social-types';

interface Props {
  slide: Slide;
  onChange: (updated: Slide) => void;
  onApplyAllTemplate?: (template: string) => void;
  onApplyAllColor?: (color: string) => void;
}

const TEMPLATE_OPTIONS = [
  { value: 'centered', label: 'Centrado' },
  { value: 'split', label: 'Dividido' },
  { value: 'minimal', label: 'Minimal' },
] as const;

const COLOR_OPTIONS = [
  { value: 'naranja', label: 'Naranja', color: '#FF6768' },
  { value: 'navy', label: 'Navy', color: '#2F4060' },
  { value: 'blanco', label: 'Blanco', color: '#FFFFFF' },
  { value: 'negro', label: 'Oscuro', color: '#1A1A2E' },
  { value: 'lima', label: 'Lima', color: '#e1f5ad' },
  { value: 'arena', label: 'Arena', color: '#fbeaaa' },
  { value: 'lavanda', label: 'Lavanda', color: '#cbd8fb' },
];

const ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
  { value: 'left', label: '⫷' },
  { value: 'center', label: '⫿' },
  { value: 'right', label: '⫸' },
];

function CharCount({ text, max }: { text: string; max: number }) {
  const len = text.length;
  const lines = text.split('\n').length;
  const isOver = len > max;
  return (
    <span className={`text-[10px] tabular-nums ${isOver ? 'text-red-500' : 'text-gray-400'}`}>
      {len}/{max} · {lines}L
    </span>
  );
}

function Section({ title, defaultOpen = true, children, actions }: {
  title: string; defaultOpen?: boolean; children: React.ReactNode; actions?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <div onClick={() => setOpen(!open)} role="button" tabIndex={0}
        className="w-full flex items-center justify-between py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide hover:text-gray-800 cursor-pointer select-none">
        <span>{title}</span>
        <div className="flex items-center gap-2">
          {actions && <div onClick={e => e.stopPropagation()}>{actions}</div>}
          <ChevronDownIcon className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </div>
      {open && <div className="pb-3 space-y-3">{children}</div>}
    </div>
  );
}

export default function SlideEditor({ slide, onChange, onApplyAllTemplate, onApplyAllColor }: Props) {
  const [showImageBank, setShowImageBank] = useState(false);

  const update = (field: string, value: unknown) => {
    onChange({ ...slide, [field]: value } as Slide);
  };

  const updateTypo = (changes: Partial<SlideTypography>) => {
    onChange({ ...slide, typography: { ...(slide.typography || {}), ...changes } });
  };

  const updateImage = (changes: Partial<SlideImage>) => {
    const current = slide.image || { url: '', x: 50, y: 50, width: 30, opacity: 1, rotation: 0, layer: 'behind' as const };
    onChange({ ...slide, image: { ...current, ...changes } });
  };

  const typo = slide.typography || {};

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-800">
            Slide {slide.number}
            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium bg-gray-200 text-gray-600 rounded uppercase">{slide.type}</span>
          </h4>
        </div>
      </div>

      <div className="px-4 py-1">
        {/* ─── TEXTOS ─── */}
        <Section title="Textos" defaultOpen={true}>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-gray-500">Título</label>
              <CharCount text={slide.title} max={60} />
            </div>
            <textarea value={slide.title} onChange={e => update('title', e.target.value)} rows={2}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:ring-1 focus:ring-blue-300 focus:border-blue-300" />
          </div>

          {slide.type === 'cover' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-500">Subtítulo</label>
                <CharCount text={slide.subtitle || ''} max={80} />
              </div>
              <textarea value={slide.subtitle || ''} onChange={e => update('subtitle', e.target.value)} rows={2}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:ring-1 focus:ring-blue-300 focus:border-blue-300" />
            </div>
          )}

          {(slide.type === 'content' || slide.type === 'cta') && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-500">Cuerpo</label>
                <CharCount text={slide.body || ''} max={120} />
              </div>
              <textarea value={slide.body || ''} onChange={e => update('body', e.target.value)} rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:ring-1 focus:ring-blue-300 focus:border-blue-300" />
            </div>
          )}

          {slide.type === 'cta' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-gray-500">Texto CTA</label>
                <CharCount text={slide.cta_text || ''} max={40} />
              </div>
              <input value={slide.cta_text || ''} onChange={e => update('cta_text', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-blue-300 focus:border-blue-300" />
            </div>
          )}
        </Section>

        {/* ─── TIPOGRAFÍA ─── */}
        <Section title="Tipografía" defaultOpen={false}>
          {/* Título typo */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-gray-500">Título</span>
              <div className="flex gap-px bg-gray-200 rounded overflow-hidden">
                {ALIGN_OPTIONS.map(a => (
                  <button key={a.value} onClick={() => updateTypo({ titleAlign: a.value })}
                    className={`px-2 py-0.5 text-[11px] ${
                      (typo.titleAlign || 'center') === a.value ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-300'
                    }`}>{a.label}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 items-end">
              <select value={typo.titleFont || 'Nunito'} onChange={e => updateTypo({ titleFont: e.target.value as FontFamily })}
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-white">
                {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <input type="number" min={24} max={120} value={typo.titleSize || (slide.type === 'cover' ? 64 : 56)}
                onChange={e => updateTypo({ titleSize: Number(e.target.value) })}
                className="w-14 text-xs border border-gray-200 rounded px-2 py-1 text-center" />
              <div className="flex gap-px bg-gray-200 rounded overflow-hidden">
                {([400, 700, 900] as FontWeight[]).map(w => (
                  <button key={w} onClick={() => updateTypo({ titleWeight: w })}
                    className={`px-1.5 py-1 text-[10px] ${
                      (typo.titleWeight || 800) === w ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-300'
                    }`} style={{ fontWeight: w }}>
                    {w === 400 ? 'R' : w === 700 ? 'B' : 'Bk'}
                  </button>
                ))}
                <button onClick={() => updateTypo({ titleStyle: typo.titleStyle === 'italic' ? 'normal' : 'italic' })}
                  className={`px-1.5 py-1 text-[10px] italic ${
                    typo.titleStyle === 'italic' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-300'
                  }`}>I</button>
              </div>
            </div>
          </div>

          {/* Body typo */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-gray-500">Cuerpo / Subtítulo</span>
              <div className="flex gap-px bg-gray-200 rounded overflow-hidden">
                {ALIGN_OPTIONS.map(a => (
                  <button key={a.value} onClick={() => updateTypo({ bodyAlign: a.value })}
                    className={`px-2 py-0.5 text-[11px] ${
                      (typo.bodyAlign || 'center') === a.value ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-300'
                    }`}>{a.label}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 items-end">
              <select value={typo.bodyFont || 'Nunito'} onChange={e => updateTypo({ bodyFont: e.target.value as FontFamily })}
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-white">
                {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <input type="number" min={16} max={80} value={typo.bodySize || 32}
                onChange={e => updateTypo({ bodySize: Number(e.target.value) })}
                className="w-14 text-xs border border-gray-200 rounded px-2 py-1 text-center" />
              <div className="flex gap-px bg-gray-200 rounded overflow-hidden">
                {([400, 700] as FontWeight[]).map(w => (
                  <button key={w} onClick={() => updateTypo({ bodyWeight: w })}
                    className={`px-1.5 py-1 text-[10px] ${
                      (typo.bodyWeight || 400) === w ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-300'
                    }`} style={{ fontWeight: w }}>
                    {w === 400 ? 'R' : 'B'}
                  </button>
                ))}
                <button onClick={() => updateTypo({ bodyStyle: typo.bodyStyle === 'italic' ? 'normal' : 'italic' })}
                  className={`px-1.5 py-1 text-[10px] italic ${
                    typo.bodyStyle === 'italic' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-300'
                  }`}>I</button>
              </div>
            </div>
          </div>
        </Section>

        {/* ─── DISEÑO ─── */}
        <Section title="Diseño" defaultOpen={true}
          actions={
            <div className="flex gap-2 text-[10px]">
              {onApplyAllTemplate && (
                <button onClick={() => onApplyAllTemplate(slide.template || 'centered')}
                  className="text-blue-600 hover:underline">Aplicar todo</button>
              )}
            </div>
          }>
          <div className="flex gap-1.5">
            {TEMPLATE_OPTIONS.map(t => (
              <button key={t.value} onClick={() => update('template', t.value)}
                className={`flex-1 py-2 text-xs rounded-lg border-2 transition-all ${
                  (slide.template || 'centered') === t.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold shadow-sm'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-gray-500">Color de fondo</span>
              {onApplyAllColor && (
                <button onClick={() => onApplyAllColor(slide.color || 'naranja')}
                  className="text-[10px] text-blue-600 hover:underline">Aplicar todo</button>
              )}
            </div>
            <div className="flex gap-2">
              {COLOR_OPTIONS.map(c => (
                <button key={c.value} onClick={() => update('color', c.value)} title={c.label}
                  className={`w-8 h-8 rounded-full border-2 transition-all shadow-sm ${
                    (slide.color || 'naranja') === c.value ? 'border-blue-500 scale-110 ring-2 ring-blue-200' : 'border-gray-200 hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.color }} />
              ))}
            </div>
          </div>
        </Section>

        {/* ─── IMAGEN ─── */}
        <Section title="Imagen" defaultOpen={!!slide.image}>
          {!slide.image ? (
            <button onClick={() => setShowImageBank(true)}
              className="w-full py-4 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors flex items-center justify-center gap-2">
              <PhotoIcon className="w-5 h-5" />
              Agregar imagen del banco
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-2">
                <img src={slide.image.url} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 truncate">{slide.image.url.split('/').pop()}</p>
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => setShowImageBank(true)}
                      className="text-[10px] text-blue-600 hover:underline">Cambiar</button>
                    <button onClick={() => onChange({ ...slide, image: null })}
                      className="text-[10px] text-red-500 hover:underline">Quitar</button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <label className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>X</span>
                  <div className="flex items-center gap-1.5">
                    <input type="range" min={0} max={100} value={slide.image.x}
                      onChange={e => updateImage({ x: Number(e.target.value) })}
                      className="w-20 h-1 accent-blue-500" />
                    <span className="text-[10px] w-8 text-right tabular-nums">{slide.image.x}%</span>
                  </div>
                </label>
                <label className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>Y</span>
                  <div className="flex items-center gap-1.5">
                    <input type="range" min={0} max={100} value={slide.image.y}
                      onChange={e => updateImage({ y: Number(e.target.value) })}
                      className="w-20 h-1 accent-blue-500" />
                    <span className="text-[10px] w-8 text-right tabular-nums">{slide.image.y}%</span>
                  </div>
                </label>
                <label className="flex items-center justify-between text-[11px] text-gray-500">
                  <span><ArrowsPointingOutIcon className="w-3 h-3 inline" /> Tamaño</span>
                  <div className="flex items-center gap-1.5">
                    <input type="range" min={5} max={100} value={slide.image.width}
                      onChange={e => updateImage({ width: Number(e.target.value) })}
                      className="w-20 h-1 accent-blue-500" />
                    <span className="text-[10px] w-8 text-right tabular-nums">{slide.image.width}%</span>
                  </div>
                </label>
                <label className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>Opacidad</span>
                  <div className="flex items-center gap-1.5">
                    <input type="range" min={10} max={100} value={Math.round(slide.image.opacity * 100)}
                      onChange={e => updateImage({ opacity: Number(e.target.value) / 100 })}
                      className="w-20 h-1 accent-blue-500" />
                    <span className="text-[10px] w-8 text-right tabular-nums">{Math.round(slide.image.opacity * 100)}%</span>
                  </div>
                </label>
              </div>

              <div className="flex gap-3 items-center">
                <label className="flex items-center gap-1.5 text-[11px] text-gray-500 flex-1">
                  <ArrowPathIcon className="w-3 h-3" /> Rotar
                  <input type="range" min={0} max={360} value={slide.image.rotation || 0}
                    onChange={e => updateImage({ rotation: Number(e.target.value) })}
                    className="flex-1 h-1 accent-blue-500" />
                  <span className="text-[10px] w-8 text-right tabular-nums">{slide.image.rotation || 0}°</span>
                </label>
                <div className="flex gap-px bg-gray-200 rounded overflow-hidden">
                  {[0, 45, 90, 180].map(d => (
                    <button key={d} onClick={() => updateImage({ rotation: d })}
                      className={`px-1.5 py-0.5 text-[9px] ${
                        (slide.image!.rotation || 0) === d ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-300'
                      }`}>{d}°</button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[11px] text-gray-500 mb-1 block">Capa</span>
                <div className="flex gap-1.5">
                  <button onClick={() => updateImage({ layer: 'behind' })}
                    className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                      (slide.image!.layer || 'behind') === 'behind'
                        ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium' : 'border-gray-200 text-gray-500'
                    }`}>Detrás del texto</button>
                  <button onClick={() => updateImage({ layer: 'front' })}
                    className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                      slide.image!.layer === 'front'
                        ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium' : 'border-gray-200 text-gray-500'
                    }`}>Frente al texto</button>
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* Sugerencia visual (colapsada por default) */}
        <Section title="Ref. visual (IA)" defaultOpen={false}>
          <p className="text-xs text-gray-400 italic">{slide.visual_suggestion || 'Sin sugerencia'}</p>
        </Section>
      </div>

      <ImageBank isOpen={showImageBank} onClose={() => setShowImageBank(false)}
        onSelectImage={(url) => {
          onChange({ ...slide, image: { url, x: 50, y: 50, width: 30, opacity: 1, rotation: 0, layer: 'behind' } });
        }} />
    </div>
  );
}
