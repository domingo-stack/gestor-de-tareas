'use client';

import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import Modal from '@/components/Modal';
import Papa from 'papaparse';
import {
  extractVariables,
  validateTemplate,
  type TemplateButton,
  type TemplateUso,
  type TemplateCategoria,
} from '@/lib/template-utils';

interface BulkUploadTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  existingNames: string[];
}

interface ParsedTemplate {
  rowIndex: number;
  nombre: string;
  body: string;
  textoBoton: string;
  url: string;
  uso: TemplateUso;
  variables: string[];
  categoria: TemplateCategoria;
  confidence: string;
  buttons: TemplateButton[];
  errors: string[];
  warnings: string[];
  isDuplicate: boolean;
  isDuplicateInCSV: boolean;
  selected: boolean;
}

interface SubmitResult {
  nombre: string;
  status: 'saved' | 'submitted' | 'error';
  error?: string;
}

type Step = 'upload' | 'preview' | 'result';

// Normalize column headers to expected keys
function normalizeHeader(h: string): string {
  const clean = h.trim().toLowerCase().replace(/[_\s]+/g, '_');
  if (['nombre_campana', 'nombre_campaña', 'nombre', 'name'].includes(clean)) return 'nombre';
  if (['texto', 'body', 'cuerpo', 'mensaje'].includes(clean)) return 'body';
  if (['texto_boton', 'texto_botón', 'boton', 'botón', 'button_text'].includes(clean)) return 'texto_boton';
  if (['url', 'link', 'enlace'].includes(clean)) return 'url';
  if (['caso_de_uso', 'caso_uso', 'uso', 'use_case'].includes(clean)) return 'uso';
  return clean;
}

function normalizeUso(raw: string): TemplateUso {
  const clean = raw.trim().toLowerCase();
  if (['campaña', 'campana', 'campañas', 'campanas'].includes(clean)) return 'campaña';
  if (['automatización', 'automatizacion', 'automatizaciones'].includes(clean)) return 'automatización';
  return 'ambos';
}

const EXPECTED_COLUMNS = ['nombre', 'body', 'texto_boton', 'url', 'uso'];

export default function BulkUploadTemplatesModal({ isOpen, onClose, onComplete, existingNames }: BulkUploadTemplatesModalProps) {
  const { supabase } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [templates, setTemplates] = useState<ParsedTemplate[]>([]);
  const [results, setResults] = useState<SubmitResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, phase: '' });
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setStep('upload');
    setTemplates([]);
    setResults([]);
    setProcessing(false);
    setProgress({ current: 0, total: 0, phase: '' });
  };

  const handleClose = () => {
    if (processing) {
      if (!window.confirm('Hay un envío en progreso. Los templates que aún no se enviaron a Meta no se procesarán. ¿Seguro que quieres cerrar?')) return;
    }
    reset();
    onClose();
  };

  const parseFile = useCallback((file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (!result.data || result.data.length === 0) {
          toast.error('El archivo está vacío');
          return;
        }

        // Normalize headers
        const rawHeaders = result.meta.fields || [];
        const headerMap: Record<string, string> = {};
        rawHeaders.forEach(h => { headerMap[normalizeHeader(h)] = h; });

        // Check required columns
        const missing = EXPECTED_COLUMNS.filter(c => !headerMap[c]);
        if (missing.length > 0) {
          toast.error(`Columnas faltantes: ${missing.join(', ')}. Esperadas: Nombre_campana, texto, texto_boton, URL, Caso de uso`);
          return;
        }

        const existingLower = existingNames.map(n => n.toLowerCase());
        const seenNames = new Set<string>();

        const parsed: ParsedTemplate[] = (result.data as Record<string, string>[]).map((row, idx) => {
          const nombre = (row[headerMap['nombre']] || '').trim();
          const body = (row[headerMap['body']] || '').trim();
          const textoBoton = (row[headerMap['texto_boton']] || '').trim();
          const url = (row[headerMap['url']] || '').trim();
          const usoRaw = (row[headerMap['uso']] || '').trim();

          const uso = normalizeUso(usoRaw);
          const variables = extractVariables(body);
          const validation = validateTemplate(body);
          const errors: string[] = [];
          const warnings: string[] = [...validation.warnings];

          // Build button
          const buttons: TemplateButton[] = [];
          if (textoBoton) {
            if (url && !url.match(/^https?:\/\/.+/)) {
              errors.push('URL inválida (debe empezar con http:// o https://)');
            }
            buttons.push({ type: 'URL', text: textoBoton, url: url || undefined });
          }

          // Validations
          if (!nombre) errors.push('Nombre obligatorio');
          if (!body) errors.push('Cuerpo obligatorio');
          if (body.length > 1023) errors.push(`Body excede 1023 chars (${body.length})`);

          // Duplicates
          const nombreLower = nombre.toLowerCase();
          const isDuplicate = existingLower.includes(nombreLower);
          const isDuplicateInCSV = seenNames.has(nombreLower);
          if (nombre) seenNames.add(nombreLower);

          if (isDuplicate) warnings.push('Ya existe en la base de datos');
          if (isDuplicateInCSV) warnings.push('Nombre duplicado en el CSV');

          return {
            rowIndex: idx + 1,
            nombre,
            body,
            textoBoton,
            url,
            uso,
            variables,
            categoria: validation.category,
            confidence: validation.confidence,
            buttons,
            errors,
            warnings,
            isDuplicate,
            isDuplicateInCSV,
            selected: errors.length === 0,
          };
        });

        setTemplates(parsed);
        setStep('preview');
        toast.success(`${parsed.length} templates parseados`);
      },
      error: (err) => {
        toast.error(`Error al parsear CSV: ${err.message}`);
      },
    });
  }, [existingNames]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      parseFile(file);
    } else {
      toast.error('Solo se aceptan archivos .csv');
    }
  }, [parseFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const toggleSelect = (idx: number) => {
    setTemplates(prev => prev.map((t, i) =>
      i === idx ? { ...t, selected: t.errors.length === 0 ? !t.selected : false } : t
    ));
  };

  const toggleAll = () => {
    const validTemplates = templates.filter(t => t.errors.length === 0);
    const allSelected = validTemplates.every(t => t.selected);
    setTemplates(prev => prev.map(t =>
      t.errors.length === 0 ? { ...t, selected: !allSelected } : t
    ));
  };

  const updateTemplate = (idx: number, field: 'nombre' | 'body' | 'uso', value: string) => {
    setTemplates(prev => prev.map((t, i) => {
      if (i !== idx) return t;
      const updated = { ...t, [field]: value };

      if (field === 'body') {
        updated.variables = extractVariables(value);
        const validation = validateTemplate(value);
        updated.categoria = validation.category;
        updated.confidence = validation.confidence;
        updated.warnings = validation.warnings;
        updated.errors = [];
        if (!value.trim()) updated.errors.push('Cuerpo obligatorio');
        if (value.length > 1023) updated.errors.push(`Body excede 1023 chars (${value.length})`);
        updated.selected = updated.errors.length === 0;
      }

      if (field === 'nombre') {
        updated.errors = updated.errors.filter(e => e !== 'Nombre obligatorio');
        if (!value.trim()) updated.errors.push('Nombre obligatorio');
        updated.selected = updated.errors.length === 0;
      }

      if (field === 'uso') {
        updated.uso = normalizeUso(value);
      }

      return updated;
    }));
  };

  const handleSave = async (submitToMeta: boolean) => {
    const selected = templates.filter(t => t.selected && t.errors.length === 0);
    if (selected.length === 0) {
      toast.error('No hay templates seleccionados para guardar');
      return;
    }

    setProcessing(true);
    setStep('result');
    setProgress({ current: 0, total: selected.length, phase: 'Guardando en base de datos...' });
    const newResults: SubmitResult[] = [];

    try {
      // Step 1: Batch insert all as drafts
      const rows = selected.map(t => ({
        nombre: t.nombre.trim(),
        body: t.body.trim(),
        variables: t.variables,
        buttons: t.buttons,
        categoria: t.categoria,
        uso: t.uso,
        estado: 'borrador' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { data: saved, error } = await supabase
        .from('comm_templates')
        .insert(rows)
        .select('id, nombre');

      if (error) throw error;
      if (!saved) throw new Error('No se recibieron datos del insert');

      saved.forEach(s => {
        newResults.push({ nombre: s.nombre, status: 'saved' });
      });
      setResults([...newResults]);
      setProgress({ current: saved.length, total: saved.length, phase: `${saved.length} templates guardados como borrador` });

      // Step 2: Assign queue batches and trigger first batch
      if (submitToMeta && saved.length > 0) {
        const QUEUE_BATCH_SIZE = 1;
        const totalBatches = Math.ceil(saved.length / QUEUE_BATCH_SIZE);
        setProgress({
          current: saved.length,
          total: saved.length,
          phase: `Asignando ${totalBatches} lote${totalBatches > 1 ? 's' : ''} de envío...`,
        });

        // Assign queue_batch and queue_priority to each template
        for (let i = 0; i < saved.length; i++) {
          const batchNum = Math.floor(i / QUEUE_BATCH_SIZE) + 1;
          await supabase
            .from('comm_templates')
            .update({ queue_batch: batchNum, queue_priority: i + 1 })
            .eq('id', saved[i].id);

          const idx = newResults.findIndex(nr => nr.nombre === saved[i].nombre);
          if (idx >= 0) {
            newResults[idx].status = 'submitted';
            newResults[idx].error = `Lote ${batchNum}`;
          }
        }
        setResults([...newResults]);

        // Trigger first batch immediately
        setProgress({
          current: saved.length,
          total: saved.length,
          phase: `Enviando lote 1 de ${totalBatches} a Meta...`,
        });

        try {
          const { data: { session } } = await supabase.auth.getSession();
          await fetch('/api/communication/process-template-queue', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` }),
            },
          });
        } catch {
          // Queue will be processed by cron if manual trigger fails
        }

        setProgress({
          current: saved.length,
          total: saved.length,
          phase: `Encolados en ${totalBatches} lote${totalBatches > 1 ? 's' : ''}. El lote 1 ya se envió a Meta.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Error: ${msg}`);
      selected.forEach(t => {
        const existing = newResults.find(r => r.nombre === t.nombre);
        if (!existing) newResults.push({ nombre: t.nombre, status: 'error', error: msg });
      });
    }

    setResults(newResults);
    setStep('result');
    setProcessing(false);
  };

  const selectedCount = templates.filter(t => t.selected && t.errors.length === 0).length;
  const errorCount = templates.filter(t => t.errors.length > 0).length;

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="flex flex-col max-h-[90vh] w-full max-w-5xl">
        {/* Header */}
        <div className="bg-[#3c527a] px-6 py-4 flex items-center justify-between flex-shrink-0 rounded-t-2xl">
          <div>
            <p className="text-blue-200 text-xs font-bold uppercase tracking-wide mb-0.5">
              Carga masiva
            </p>
            <h2 className="text-white text-lg font-bold">Importar Templates desde CSV</h2>
          </div>
          <button onClick={handleClose} className="text-white/60 hover:text-white text-xl font-bold">×</button>
        </div>

        {/* Steps indicator */}
        <div className="px-6 py-3 bg-gray-50 border-b flex items-center gap-4 text-xs font-medium">
          {(['upload', 'preview', 'result'] as Step[]).map((s, i) => {
            const labels = ['1. Subir CSV', '2. Revisar', '3. Resultado'];
            const isActive = s === step;
            const isPast = ['upload', 'preview', 'result'].indexOf(step) > i;
            return (
              <div key={s} className={`flex items-center gap-2 ${isActive ? 'text-blue-600' : isPast ? 'text-green-600' : 'text-gray-400'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  isActive ? 'bg-blue-600 text-white' : isPast ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {isPast ? '✓' : i + 1}
                </span>
                {labels[i]}
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                  dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
                }`}
              >
                <div className="text-4xl mb-3">📄</div>
                <p className="text-sm font-semibold text-gray-700">
                  Arrastra tu archivo CSV aquí o haz clic para seleccionar
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  Formato: .csv con columnas Nombre_campana, texto, texto_boton, URL, Caso de uso
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-blue-800">Descarga el template CSV</h4>
                  <p className="text-xs text-blue-600 mt-1">
                    Llena las columnas, guarda como CSV y súbelo aquí. Las variables {'{{...}}'} y la categoría se detectan automáticamente.
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const csvContent = [
                      'Nombre_campana,texto,texto_boton,URL,Caso de uso',
                      'Bienvenida Premium,"Hola {{nombre}}, bienvenido al plan {{plan_id}}. Estamos felices de tenerte.",Ver mi cuenta,https://app.califica.ai/cuenta,ambos',
                      'Recordatorio Vencimiento,"{{nombre}}, tu plan vence en {{dias_restantes}} días. Renueva para no perder acceso.",Renovar ahora,https://app.califica.ai/renovar,automatizaciones',
                      'Invitación Taller,"Hola {{nombre}}, te invitamos a nuestro próximo taller gratuito.",Inscribirme,https://app.califica.ai/taller,campañas',
                    ].join('\n');
                    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'template_carga_masiva.csv';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex-shrink-0 ml-4 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Descargar CSV
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  <span className="font-bold text-gray-900">{selectedCount}</span> de {templates.length} templates listos
                  {errorCount > 0 && (
                    <span className="text-red-500 ml-2">({errorCount} con errores)</span>
                  )}
                </div>
                <button
                  onClick={() => { reset(); }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Subir otro archivo
                </button>
              </div>

              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-3 py-2 text-center w-10">
                        <input type="checkbox" onChange={toggleAll} checked={selectedCount === templates.filter(t => t.errors.length === 0).length && selectedCount > 0} className="rounded" />
                      </th>
                      <th className="px-3 py-2 text-left w-8">#</th>
                      <th className="px-3 py-2 text-left min-w-[180px]">Nombre</th>
                      <th className="px-3 py-2 text-left min-w-[250px]">Cuerpo</th>
                      <th className="px-3 py-2 text-left min-w-[100px]">Botón</th>
                      <th className="px-3 py-2 text-center w-28">Uso</th>
                      <th className="px-3 py-2 text-center w-24">Categoría</th>
                      <th className="px-3 py-2 text-center w-20">Variables</th>
                      <th className="px-3 py-2 text-left min-w-[140px]">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {templates.map((t, idx) => {
                      const hasErrors = t.errors.length > 0;
                      const hasWarnings = t.warnings.length > 0 || t.isDuplicate || t.isDuplicateInCSV;
                      const rowBg = hasErrors ? 'bg-red-50' : hasWarnings ? 'bg-yellow-50' : '';

                      return (
                        <tr key={idx} className={`${rowBg} hover:bg-gray-50/50`}>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={t.selected}
                              disabled={hasErrors}
                              onChange={() => toggleSelect(idx)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-400">{t.rowIndex}</td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={t.nombre}
                              onChange={(e) => updateTemplate(idx, 'nombre', e.target.value)}
                              className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <textarea
                              value={t.body}
                              onChange={(e) => updateTemplate(idx, 'body', e.target.value)}
                              rows={2}
                              className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                            />
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">
                            {t.textoBoton ? (
                              <div>
                                <div className="font-medium">{t.textoBoton}</div>
                                <div className="text-[10px] text-gray-400 truncate max-w-[100px]" title={t.url}>{t.url}</div>
                              </div>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <select
                              value={t.uso}
                              onChange={(e) => updateTemplate(idx, 'uso', e.target.value)}
                              className="text-xs border border-gray-200 rounded px-1 py-0.5 focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                              <option value="ambos">Ambos</option>
                              <option value="campaña">Campaña</option>
                              <option value="automatización">Automatización</option>
                            </select>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              t.categoria === 'marketing' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {t.categoria === 'marketing' ? 'Mkt' : 'Util'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center text-xs text-gray-500">
                            {t.variables.length > 0 ? (
                              <span title={t.variables.join(', ')}>{t.variables.length}</span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2">
                            {hasErrors && (
                              <div className="text-[10px] text-red-600 font-medium">{t.errors.join('; ')}</div>
                            )}
                            {!hasErrors && hasWarnings && (
                              <div className="text-[10px] text-yellow-700">{t.warnings.join('; ')}</div>
                            )}
                            {!hasErrors && !hasWarnings && (
                              <span className="text-[10px] text-green-600 font-medium">OK</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 3: Result */}
          {step === 'result' && (
            <div className="space-y-4">
              {processing ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4" />
                  <p className="text-sm text-gray-600">{progress.phase}</p>
                  {progress.total > 0 && (
                    <div className="mt-3 max-w-xs mx-auto">
                      <div className="bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{progress.current} / {progress.total}</p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-green-700">{results.filter(r => r.status === 'saved').length}</div>
                      <div className="text-xs text-green-600">Guardados</div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-blue-700">{results.filter(r => r.status === 'submitted').length}</div>
                      <div className="text-xs text-blue-600">Encolados para Meta</div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-red-700">{results.filter(r => r.status === 'error').length}</div>
                      <div className="text-xs text-red-600">Errores</div>
                    </div>
                  </div>

                  {/* Detail list */}
                  <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left">Template</th>
                          <th className="px-4 py-2 text-center w-32">Estado</th>
                          <th className="px-4 py-2 text-left">Detalle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {results.map((r, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2 font-medium text-gray-700">{r.nombre}</td>
                            <td className="px-4 py-2 text-center">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                r.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                                r.status === 'saved' ? 'bg-green-100 text-green-700' :
                                'bg-red-100 text-red-600'
                              }`}>
                                {r.status === 'submitted' ? 'Encolado' : r.status === 'saved' ? 'Borrador' : 'Error'}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-500">{r.error || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-between flex-shrink-0 rounded-b-2xl">
          {step === 'upload' && (
            <div className="w-full text-right">
              <button onClick={handleClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                Cancelar
              </button>
            </div>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={() => reset()}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Volver
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleSave(false)}
                  disabled={selectedCount === 0 || processing}
                  className="px-4 py-2 text-sm font-semibold bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Guardar como borradores ({selectedCount})
                </button>
                <button
                  onClick={() => handleSave(true)}
                  disabled={selectedCount === 0 || processing}
                  className="px-4 py-2 text-sm font-semibold bg-[#3c527a] text-white rounded-lg hover:bg-[#2d3f5e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Guardar y encolar para Meta ({selectedCount})
                </button>
              </div>
            </>
          )}

          {step === 'result' && !processing && (
            <div className="w-full text-right">
              <button
                onClick={() => { handleClose(); onComplete(); }}
                className="px-6 py-2 text-sm font-semibold bg-[#3c527a] text-white rounded-lg hover:bg-[#2d3f5e] transition-colors"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
