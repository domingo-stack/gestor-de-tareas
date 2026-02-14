'use client'

import React, { useState, useRef, useEffect } from 'react'
import Modal from '@/components/Modal' // Usamos tu componente original
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner' // Usamos Sonner para alertas bonitas

interface UploadFinanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: { id: string, name: string }[]; // <--- NUEVO: Recibimos categorías
}

export default function UploadFinanceModal({ isOpen, onClose, categories }: UploadFinanceModalProps) {
  const { supabase, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'upload' | 'manual'>('upload');
  
  // --- ESTADOS TAB UPLOAD ---
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // --- ESTADOS TAB MANUAL ---
  const [manualLoading, setManualLoading] = useState(false);
  const [manualForm, setManualForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    currency: 'USD',
    amount_usd: '',
    category_id: ''
  });

  // Referencia al input oculto
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset al abrir
  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setManualForm({
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: '',
        currency: 'USD',
        amount_usd: '',
        category_id: ''
      });
    }
  }, [isOpen]);

  // --- LÓGICA 1: SUBIDA DE ARCHIVO (Tu lógica original + N8N) ---
  const handleZoneClick = () => fileInputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const selectedFile = event.target.files[0];
      if (selectedFile.size > 5 * 1024 * 1024) {
        toast.error("El archivo es demasiado grande (Máx 5MB)");
        return;
      }
      setFile(selectedFile);
    }
  };

  // 3. LÓGICA 1: SUBIDA DE ARCHIVO (Síncrona con n8n)
  const handleProcessIA = async () => {
    if (!file || !user) return;
    setIsUploading(true);

    // Toast de carga infinito (guardamos el ID para cerrarlo después)
    const toastId = toast.loading('Subiendo y analizando documento...');

    try {
      // A. Crear nombre único
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      // B. Subir a Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('finance_receipts')
        .upload(fileName, file);

      if (uploadError) throw new Error('Error al subir imagen a la nube');

      // C. AVISAR A N8N Y ESPERAR RESPUESTA (AWAIT REAL)
      // Nota: Esto puede tardar 10-30 segundos mientras la IA piensa.
      const N8N_WEBHOOK_URL = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;

      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: fileName,
          userId: user.id,
          fileType: file.type,
          fileName: file.name
        })
      });

      // D. ANALIZAR RESPUESTA DE N8N
      if (!response.ok) {
        throw new Error(`Error de servidor n8n (${response.status})`);
      }

      const n8nResult = await response.json();

      // Verificar si n8n reportó éxito explícito
      if (n8nResult.success === false) {
        throw new Error(n8nResult.message || 'La IA no pudo leer el archivo');
      }
      
      // ÉXITO TOTAL
      toast.dismiss(toastId); // Quitamos el loading
      toast.success('¡Procesado! 🤖', {
        description: 'Las transacciones se han cargado. Actualizando tabla...',
        duration: 5000,
      });
      
      setFile(null);
      
      // Cerramos el modal y disparamos la recarga de datos
      onClose(); 

    } catch (error: any) {
      console.error("Error:", error);
      toast.dismiss(toastId); // Quitamos el loading
      toast.error('Ocurrió un problema', {
        description: error.message || "Revisa tu flujo de n8n",
        duration: 5000,
      });
    } finally {
      setIsUploading(false);
    }
  };

  // --- LÓGICA 2: CARGA MANUAL (Nueva) ---
  const handleManualSubmit = async () => {
    if (!manualForm.description || !manualForm.amount || !manualForm.amount_usd) {
      toast.error('Completa los campos obligatorios');
      return;
    }
    setManualLoading(true);
    try {
      const amountOriginal = parseFloat(manualForm.amount);
      const amountUSD = parseFloat(manualForm.amount_usd);
      
      // CÁLCULO DEL TIPO DE CAMBIO
      // Si es USD, el ratio es 1. Si es otra moneda, calculamos (Ej: 3800 PEN / 1000 USD = 3.8)
      let exchangeRate = 1;
      if (manualForm.currency !== 'USD' && amountUSD > 0) {
        exchangeRate = amountOriginal / amountUSD;
      }

      const { error } = await supabase.from('fin_transactions').insert({
        transaction_date: manualForm.date,
        description: manualForm.description,
        raw_description: `MANUAL: ${manualForm.description}`,
        amount_original: amountOriginal,
        currency_original: manualForm.currency,
        amount_usd: amountUSD,
        exchange_rate: exchangeRate, // <--- AQUÍ ENVIAMOS EL CAMPO NUEVO
        category_id: manualForm.category_id || null,
        status: 'verified',
        user_id: user?.id || null
      });

      if (error) throw error;
      toast.success('Movimiento guardado con éxito');
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Error al guardar movimiento');
    } finally {
      setManualLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-1">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Registrar Nuevo Gasto</h2>
        <p className="text-sm text-gray-500 mb-6">Elige cómo quieres ingresar la información.</p>

        {/* TABS SELECTOR */}
        <div className="flex bg-gray-100 p-1 rounded-lg mb-6">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'upload' ? 'bg-white text-blue-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            📄 Subir Factura (IA)
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'manual' ? 'bg-white text-blue-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            ✍️ Carga Manual
          </button>
        </div>

        {/* --- CONTENIDO: SUBIR ARCHIVO --- */}
        {activeTab === 'upload' && (
          <div className="space-y-4">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png,.csv" className="hidden" />
            
            <div 
              onClick={handleZoneClick}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer group ${file ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'}`}
            >
              
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                {file ? <span className="text-xl">📄</span> : <span className="text-xl">☁️</span>}
              </div>
              
              {file ? (
                <div>
                  <p className="text-sm font-bold text-blue-900">{file.name}</p>
                  <p className="text-xs text-blue-600 mt-1">{(file.size / 1024).toFixed(0)} KB - Listo</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-gray-900">Haz clic para seleccionar</p>
                  <p className="text-xs text-gray-500 mt-1">PDF, Imágenes o CSV</p>
                </div>
              )}
            </div>
            
            <div className="mt-6 flex justify-end gap-3">
               <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md">Cancelar</button>
               <button 
                onClick={handleProcessIA} 
                disabled={!file || isUploading}
                className="px-4 py-2 text-sm font-medium text-white bg-[#3c527a] hover:opacity-90 rounded-md disabled:opacity-50 flex items-center gap-2"
               >
                 {isUploading ? 'Subiendo...' : 'Procesar con IA ✨'}
               </button>
            </div>
          </div>
        )}

        {/* --- CONTENIDO: CARGA MANUAL --- */}
        {activeTab === 'manual' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
                  <input 
                    type="text" className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none" 
                    placeholder="Ej: Compra de Servidores"
                    value={manualForm.description} onChange={e => setManualForm({...manualForm, description: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Fecha</label>
                  <input 
                    type="date" className="w-full border rounded-lg p-2 text-sm" 
                    value={manualForm.date} onChange={e => setManualForm({...manualForm, date: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Categoría</label>
                  <select 
                    className="w-full border rounded-lg p-2 text-sm"
                    value={manualForm.category_id} onChange={e => setManualForm({...manualForm, category_id: e.target.value})}
                  >
                    <option value="">Seleccionar...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                   <label className="block text-xs font-medium text-gray-700 mb-1">Monto Original</label>
                   <div className="flex gap-1">
                     <select 
                        className="border rounded-l-lg p-2 text-sm bg-gray-50 w-20"
                        value={manualForm.currency}
                        onChange={e => {
                          const isUSD = e.target.value === 'USD';
                          setManualForm({ ...manualForm, currency: e.target.value, amount_usd: isUSD ? manualForm.amount : '' })
                        }}
                     >
                        <option value="USD">USD</option>
                        <option value="PEN">PEN</option>
                        <option value="CLP">CLP</option>
                        <option value="MXN">MXN</option>
                        <option value="COP">COP</option>
                     </select>
                     <input 
                        type="number" placeholder="0.00" className="w-full border rounded-r-lg p-2 text-sm"
                        value={manualForm.amount}
                        onChange={e => {
                          const val = e.target.value;
                          setManualForm({ ...manualForm, amount: val, amount_usd: manualForm.currency === 'USD' ? val : manualForm.amount_usd })
                        }}
                     />
                   </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Equivalente USD</label>
                  <input 
                    type="number" placeholder="0.00" className="w-full border rounded-lg p-2 text-sm bg-blue-50/50 border-blue-100 font-semibold text-blue-800"
                    value={manualForm.amount_usd} onChange={e => setManualForm({...manualForm, amount_usd: e.target.value})}
                  />
                </div>
            </div>
            
            <div className="mt-6 flex justify-end gap-3">
               <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md">Cancelar</button>
               <button 
                onClick={handleManualSubmit} 
                disabled={manualLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-[#3c527a] hover:opacity-90 rounded-md disabled:opacity-50"
               >
                 {manualLoading ? 'Guardando...' : 'Guardar Gasto'}
               </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}