'use client';

import SlidePreview from './SlidePreview';
import { fmtNum } from '@/components/growth/formatters';
import type { GenerationResult } from '@/lib/content-social-types';

interface Props {
  modelA: { name: string; result: GenerationResult };
  modelB: { name: string; result: GenerationResult };
  onVote: (winner: 'a' | 'b' | 'tie') => void;
}

export default function ModelComparison({ modelA, modelB, onVote }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-purple-200 p-6 space-y-5">
      <h3 className="font-semibold text-purple-800 text-center">Comparar modelos</h3>

      <div className="grid grid-cols-2 gap-6">
        {[modelA, modelB].map((model, idx) => {
          const meta = model.result.metadata;
          const carousel = model.result.carousels[0];
          return (
            <div key={idx} className="space-y-3">
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800">{model.name.split('/').pop()}</p>
                <p className="text-xs text-gray-500">
                  ${meta.cost_usd?.toFixed(3)} · {(meta.processing_time_ms / 1000).toFixed(0)}s · {fmtNum(meta.total_tokens)} tok
                </p>
              </div>
              {carousel && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {carousel.slides.slice(0, 3).map((slide, i) => (
                    <SlidePreview key={i} slide={slide} size={160} />
                  ))}
                </div>
              )}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Hook</p>
                <p className="text-sm text-gray-700">{carousel?.hook || '—'}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-4 pt-2">
        <button onClick={() => onVote('a')}
          className="px-5 py-2 text-sm font-medium bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200">
          👈 {modelA.name.split('/').pop()}
        </button>
        <button onClick={() => onVote('tie')}
          className="px-5 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
          Empate
        </button>
        <button onClick={() => onVote('b')}
          className="px-5 py-2 text-sm font-medium bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200">
          {modelB.name.split('/').pop()} 👉
        </button>
      </div>
    </div>
  );
}
