'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import ModuleGuard from '@/components/ModuleGuard';
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import GeneratorConfig from '@/components/contenido-social/GeneratorConfig';
import ModelComparison from '@/components/contenido-social/ModelComparison';
import type { Blog, ContentGeneration, GenerationConfig, GenerationResult } from '@/lib/content-social-types';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  generated: { label: 'Generado', cls: 'bg-amber-100 text-amber-700' },
  edited: { label: 'Editado', cls: 'bg-blue-100 text-blue-700' },
  exported: { label: 'Exportado', cls: 'bg-green-100 text-green-700' },
  published: { label: 'Publicado', cls: 'bg-purple-100 text-purple-700' },
};

export default function BlogDetailPage() {
  const { blogId } = useParams<{ blogId: string }>();
  const router = useRouter();
  const { supabase, user } = useAuth();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [generations, setGenerations] = useState<ContentGeneration[]>([]);
  const [loading, setLoading] = useState(false);
  const [comparison, setComparison] = useState<{ a: { name: string; result: GenerationResult }; b: { name: string; result: GenerationResult } } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const [blogsRes, gensRes] = await Promise.all([
        fetch('/api/content-social/blogs'),
        supabase?.from('content_generations').select('*').eq('blog_id', blogId).order('created_at', { ascending: false }),
      ]);
      if (blogsRes.ok) {
        const data = await blogsRes.json();
        const found = (data.blogs || []).find((b: Blog) => b.id === blogId);
        if (found) setBlog(found);
      }
      if (gensRes?.data) setGenerations(gensRes.data as ContentGeneration[]);
    };
    if (supabase) fetchData();
  }, [supabase, blogId]);

  const handleGenerate = async (config: GenerationConfig) => {
    setLoading(true);
    const toastId = toast.loading('Generando carruseles... (~15-30 segundos)', { duration: 60000 });
    try {
      const res = await fetch('/api/content-social/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blog_id: blogId, config }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.dismiss(toastId);
        toast.error(err.error || 'Error al generar');
        return;
      }
      const result: GenerationResult = await res.json();

      const { data: gen, error } = await supabase!.from('content_generations').insert({
        blog_id: blogId,
        blog_title: blog?.title || result.blog.title,
        blog_slug: blog?.slug || result.blog.slug,
        type: 'carousel',
        model_used: config.model,
        config,
        result,
        tokens_used: result.metadata.total_tokens,
        cost_usd: result.metadata.cost_usd,
        processing_time_ms: result.metadata.processing_time_ms,
        created_by: user?.id,
      }).select().single();

      if (error) {
        toast.error('Error guardando generación');
        console.error(error);
        return;
      }

      toast.dismiss(toastId);
      toast.success(`${result.carousels.length} carruseles generados`);
      router.push(`/contenido-social/${blogId}/${gen.id}`);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleCompare = async (config: GenerationConfig, modelA: string, modelB: string) => {
    setLoading(true);
    setComparison(null);
    try {
      const [resA, resB] = await Promise.all([
        fetch('/api/content-social/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blog_id: blogId, config: { ...config, model: modelA } }),
        }),
        fetch('/api/content-social/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blog_id: blogId, config: { ...config, model: modelB } }),
        }),
      ]);

      if (resA.ok && resB.ok) {
        const [resultA, resultB] = await Promise.all([resA.json(), resB.json()]);
        setComparison({
          a: { name: modelA, result: resultA },
          b: { name: modelB, result: resultB },
        });

        // Save both as generations
        for (const [model, result] of [[modelA, resultA], [modelB, resultB]] as [string, GenerationResult][]) {
          await supabase!.from('content_generations').insert({
            blog_id: blogId,
            blog_title: blog?.title || result.blog.title,
            blog_slug: blog?.slug || result.blog.slug,
            type: 'carousel',
            model_used: model,
            config: { ...config, model },
            result,
            tokens_used: result.metadata.total_tokens,
            cost_usd: result.metadata.cost_usd,
            processing_time_ms: result.metadata.processing_time_ms,
            created_by: user?.id,
          });
        }

        toast.success('Comparación lista');
      } else {
        toast.error('Error en la comparación');
      }
    } catch (err) {
      toast.error('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthGuard>
      <ModuleGuard module="mod_contenido_social">
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          <button onClick={() => router.push('/contenido-social')}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeftIcon className="w-4 h-4" /> Volver
          </button>

          {blog ? (
            <div>
              <h1 className="text-xl font-bold text-gray-900">{blog.title}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                <span>{new Date(blog.published_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                <span>·</span>
                <span>{blog.word_count?.toLocaleString()} palabras</span>
                <span>·</span>
                <span>{blog.target_countries?.join(', ')}</span>
                <a href={`https://califica.ai/${blog.target_countries?.[0] || 'pe'}/blog/${blog.slug}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                  Ver en web <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ) : (
            <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
          )}

          <GeneratorConfig onGenerate={handleGenerate} onCompare={handleCompare} loading={loading} />

          {/* Loading se muestra como toast, no como banner */}

          {comparison && (
            <ModelComparison
              modelA={comparison.a}
              modelB={comparison.b}
              onVote={(winner) => {
                toast.success(`Voto registrado: ${winner === 'tie' ? 'Empate' : winner === 'a' ? comparison.a.name : comparison.b.name}`);
                setComparison(null);
              }}
            />
          )}

          {generations.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-700">Historial de generaciones</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {generations.map((gen, idx) => {
                  const badge = STATUS_BADGE[gen.status] || STATUS_BADGE.generated;
                  return (
                    <button key={gen.id}
                      onClick={() => router.push(`/contenido-social/${blogId}/${gen.id}`)}
                      className="w-full flex items-center justify-between px-5 py-3 hover:bg-blue-50/50 transition-colors text-left">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 font-mono">#{idx + 1}</span>
                        <div>
                          <p className="text-sm text-gray-800">
                            {new Date(gen.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}{' '}
                            {new Date(gen.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-xs text-gray-400">{gen.model_used?.split('/').pop()} · {gen.result?.carousels?.length || 0} carruseles</p>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${badge.cls}`}>{badge.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </ModuleGuard>
    </AuthGuard>
  );
}
