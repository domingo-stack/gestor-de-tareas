'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { MagnifyingGlassIcon, GlobeAltIcon, SparklesIcon } from '@heroicons/react/24/outline';
import type { Blog, ContentGeneration } from '@/lib/content-social-types';

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'none', label: 'Sin generar' },
  { value: 'generated', label: 'Generados' },
  { value: 'published', label: 'Publicados' },
];

const COUNTRY_FLAGS: Record<string, string> = {
  pe: '🇵🇪', mx: '🇲🇽', cl: '🇨🇱', co: '🇨🇴', ar: '🇦🇷', ec: '🇪🇨', bo: '🇧🇴',
};

export default function BlogList() {
  const { supabase } = useAuth();
  const router = useRouter();
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [generations, setGenerations] = useState<ContentGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [blogsRes, gensRes] = await Promise.all([
          fetch('/api/content-social/blogs'),
          supabase?.from('content_generations').select('*').order('created_at', { ascending: false }),
        ]);

        if (blogsRes.ok) {
          const data = await blogsRes.json();
          setBlogs(data.blogs || []);
        }

        if (gensRes?.data) {
          setGenerations(gensRes.data as ContentGeneration[]);
        }
      } catch (err) {
        console.error('Error fetching blogs:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [supabase]);

  const getGenStatus = (blogId: string) => {
    const gens = generations.filter(g => g.blog_id === blogId);
    if (gens.length === 0) return { label: '—', count: 0, color: 'text-gray-400' };
    const published = gens.filter(g => g.status === 'published').length;
    if (published > 0) return { label: `${published} pub.`, count: gens.length, color: 'text-green-600' };
    const exported = gens.filter(g => g.status === 'exported').length;
    if (exported > 0) return { label: `${exported} exp.`, count: gens.length, color: 'text-blue-600' };
    return { label: `${gens.length} gen.`, count: gens.length, color: 'text-amber-600' };
  };

  const filtered = blogs.filter(b => {
    if (search && !b.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter === 'none') return getGenStatus(b.id).count === 0;
    if (statusFilter === 'generated') return getGenStatus(b.id).count > 0;
    if (statusFilter === 'published') return generations.some(g => g.blog_id === b.id && g.status === 'published');
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {STATUS_FILTERS.map(f => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === f.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar blog..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 font-medium text-gray-500">Blog</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Categoría</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">País</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">Palabras</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">Estado</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Cargando blogs...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No se encontraron blogs</td></tr>
            ) : (
              filtered.map((blog, idx) => {
                const status = getGenStatus(blog.id);
                return (
                  <tr key={blog.id}
                    onClick={() => router.push(`/contenido-social/${blog.id}`)}
                    className={`cursor-pointer hover:bg-blue-50/50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800 truncate max-w-[400px]">{blog.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(blog.published_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{blog.category || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {blog.target_countries?.map(c => COUNTRY_FLAGS[c] || c).join(' ') || <GlobeAltIcon className="w-4 h-4 text-gray-400 mx-auto" />}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">{blog.word_count?.toLocaleString() || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <SparklesIcon className="w-4 h-4 text-gray-300" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
