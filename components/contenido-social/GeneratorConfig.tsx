'use client';

import { useState } from 'react';
import { SparklesIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import { MODEL_OPTIONS, TONE_OPTIONS, PLATFORM_OPTIONS } from '@/lib/content-social-types';
import type { GenerationConfig } from '@/lib/content-social-types';

interface Props {
  onGenerate: (config: GenerationConfig) => void;
  onCompare: (config: GenerationConfig, modelA: string, modelB: string) => void;
  loading: boolean;
}

export default function GeneratorConfig({ onGenerate, onCompare, loading }: Props) {
  const [count, setCount] = useState(2);
  const [slidesPerCarousel, setSlidesPerCarousel] = useState(6);
  const [platform, setPlatform] = useState('instagram');
  const [tone, setTone] = useState('educativo-cercano');
  const [model, setModel] = useState('anthropic/claude-sonnet-4-6');
  const [ctaText, setCtaText] = useState('Regístrate gratis en califica.ai');
  const [includeCta, setIncludeCta] = useState(true);
  const [compareMode, setCompareMode] = useState(false);
  const [modelB, setModelB] = useState('openai/gpt-4o');

  const buildConfig = (): GenerationConfig => ({
    count,
    slides_per_carousel: slidesPerCarousel,
    tone,
    platform,
    language: 'es',
    include_cta: includeCta,
    cta_text: ctaText,
    model,
  });

  const selectedModel = MODEL_OPTIONS.find(m => m.id === model);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
      <h3 className="font-semibold text-gray-700">Configuración</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Cantidad de carruseles</label>
          <select value={count} onChange={e => setCount(Number(e.target.value))}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
            {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Slides por carrusel</label>
          <select value={slidesPerCarousel} onChange={e => setSlidesPerCarousel(Number(e.target.value))}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
            {[5, 6, 7].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Plataforma</label>
          <div className="flex gap-1">
            {PLATFORM_OPTIONS.map(p => (
              <button key={p.value} onClick={() => setPlatform(p.value)}
                className={`flex-1 px-2 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  platform === p.value ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Tono</label>
          <select value={tone} onChange={e => setTone(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
            {TONE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Modelo IA</label>
          <select value={model} onChange={e => setModel(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
            {MODEL_OPTIONS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          {selectedModel && (
            <p className="text-[11px] text-gray-400 mt-1">
              {selectedModel.cost_per_carousel}/carrusel · {selectedModel.speed} · {'⭐'.repeat(selectedModel.quality)}
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeCta} onChange={e => setIncludeCta(e.target.checked)} className="rounded" />
          <span className="text-gray-600">Incluir CTA en último slide</span>
        </label>
        {includeCta && (
          <input value={ctaText} onChange={e => setCtaText(e.target.value)}
            className="mt-2 w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
            placeholder="Texto del CTA..." />
        )}
      </div>

      {/* Model reference table */}
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-xs font-medium text-gray-500 mb-2">Referencia de modelos</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left py-1">Modelo</th>
                <th className="text-right py-1">Costo</th>
                <th className="text-right py-1">Velocidad</th>
                <th className="text-right py-1">Calidad</th>
              </tr>
            </thead>
            <tbody>
              {MODEL_OPTIONS.map(m => (
                <tr key={m.id} className={model === m.id ? 'text-blue-700 font-medium' : 'text-gray-600'}>
                  <td className="py-1">{m.label}</td>
                  <td className="py-1 text-right">{m.cost_per_carousel}</td>
                  <td className="py-1 text-right">{m.speed}</td>
                  <td className="py-1 text-right">{'⭐'.repeat(m.quality)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => onGenerate(buildConfig())} disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          <SparklesIcon className="w-4 h-4" />
          {loading ? 'Generando...' : 'Generar carruseles'}
        </button>

        <button onClick={() => setCompareMode(!compareMode)}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
            compareMode ? 'bg-purple-50 border-purple-200 text-purple-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}>
          <ArrowsRightLeftIcon className="w-4 h-4" />
          Comparar modelos
        </button>
      </div>

      {compareMode && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-purple-800">Comparar dos modelos con el mismo blog</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-purple-600 mb-1">Modelo A</label>
              <select value={model} onChange={e => setModel(e.target.value)}
                className="w-full text-sm border border-purple-200 rounded-lg px-3 py-2 bg-white">
                {MODEL_OPTIONS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-purple-600 mb-1">Modelo B</label>
              <select value={modelB} onChange={e => setModelB(e.target.value)}
                className="w-full text-sm border border-purple-200 rounded-lg px-3 py-2 bg-white">
                {MODEL_OPTIONS.filter(m => m.id !== model).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <button onClick={() => onCompare(buildConfig(), model, modelB)} disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50">
            <ArrowsRightLeftIcon className="w-4 h-4" />
            {loading ? 'Generando...' : 'Generar comparación'}
          </button>
        </div>
      )}
    </div>
  );
}
