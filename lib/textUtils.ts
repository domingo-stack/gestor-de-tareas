// lib/textUtils.ts

export const stripHtml = (html: string | null | undefined): string => {
    if (!html) return "";
    
    // 1. Si no parece HTML (no tiene tags <...>), devolvemos el texto tal cual
    if (!/<[a-z][\s\S]*>/i.test(html)) {
        return html;
    }
  
    // 2. Truco del navegador para extraer texto puro
    if (typeof window !== 'undefined') {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || "";
    }
  
    // 3. Fallback para entorno servidor (regex básico)
    return html.replace(/<[^>]+>/g, '');
  };