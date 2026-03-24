// Shared template utilities — used by Templates.tsx and BulkUploadTemplatesModal.tsx

export type TemplateCategoria = 'utility' | 'marketing' | null;
export type TemplateUso = 'campaña' | 'automatización' | 'ambos';
export type ButtonType = 'URL' | 'PHONE_NUMBER' | 'QUICK_REPLY';

export interface TemplateButton {
  type: ButtonType;
  text: string;
  url?: string;
  phone_number?: string;
}

export interface ValidationResult {
  category: TemplateCategoria;
  confidence: 'alta' | 'media' | 'baja';
  warnings: string[];
  isValid: boolean;
}

const MARKETING_WORDS = [
  'gratis', 'premium', 'descuento', 'oferta', 'precio', 'plan', 'suscripción',
  'suscripcion', 'conoce más', 'compra', 'aprovecha', 'no te lo pierdas',
  'última oportunidad', 'ultima oportunidad', 'black friday', 'promoción',
  'promocion', 'especial', 'rebaja', 'regalo', 'ganaste', 'ganador',
];

const UTILITY_SIGNALS = [
  'te registraste', 'confirmaste', 'solicitaste', 'tu membresía', 'tu membresia',
  'tu plan', 'tu cuenta', 'acceso', 'vence', 'vencimiento', 'renovación',
  'renovacion', 'confirmación', 'confirmacion', 'registro', 'bienvenida',
];

const HYPE_EMOJIS = ['🔥', '🎉', '🎊', '💥', '⚡', '🚀', '💰', '🎁'];

export function validateTemplate(body: string): ValidationResult {
  const lower = body.toLowerCase();
  const warnings: string[] = [];
  let marketingScore = 0;
  let utilityScore = 0;

  const foundMarketing = MARKETING_WORDS.filter(w => lower.includes(w));
  if (foundMarketing.length > 0) {
    marketingScore += foundMarketing.length * 2;
    warnings.push(`Palabras promocionales: ${foundMarketing.slice(0, 3).join(', ')}`);
  }

  const foundUtility = UTILITY_SIGNALS.filter(w => lower.includes(w));
  if (foundUtility.length > 0) {
    utilityScore += foundUtility.length * 2;
  }

  const foundEmojis = HYPE_EMOJIS.filter(e => body.includes(e));
  if (foundEmojis.length > 0) {
    marketingScore += foundEmojis.length;
    warnings.push(`Emojis de hype: ${foundEmojis.join(' ')}`);
  }

  const exclamations = (body.match(/!/g) || []).length;
  if (exclamations > 1) {
    marketingScore += exclamations;
    warnings.push(`${exclamations} signos de exclamación (riesgo Marketing)`);
  }

  const vars = body.match(/\{\{(\w+)\}\}/g) || [];
  if (vars.length > 0) {
    utilityScore += vars.length;
  }

  const category: TemplateCategoria = marketingScore > utilityScore ? 'marketing' : 'utility';
  const diff = Math.abs(marketingScore - utilityScore);
  const confidence: 'alta' | 'media' | 'baja' = diff >= 4 ? 'alta' : diff >= 2 ? 'media' : 'baja';

  return {
    category,
    confidence,
    warnings,
    isValid: body.trim().length >= 10,
  };
}

export function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
}
