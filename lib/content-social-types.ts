// ============================================================
// Types: Módulo Contenido Social
// ============================================================

export interface Blog {
  id: string;
  title: string;
  slug: string;
  category: string;
  published_at: string;
  word_count: number;
  target_countries: string[];
}

export interface SlideImage {
  url: string;
  x: number;       // % from left (0-100)
  y: number;       // % from top (0-100)
  width: number;   // % of slide width (5-100)
  opacity: number; // 0-1
  rotation: number; // degrees (0-360)
  layer: 'behind' | 'front'; // behind text or in front
}

export type FontFamily = 'Nunito' | 'Codec Pro' | 'Lazy Dog';
export type FontStyle = 'normal' | 'italic';
export type TextAlign = 'left' | 'center' | 'right';
export type FontWeight = 400 | 700 | 900;

export interface SlideTypography {
  titleFont?: FontFamily;
  titleSize?: number;       // px en 1080x1080 (default 56-64)
  titleWeight?: FontWeight;
  titleStyle?: FontStyle;
  titleAlign?: TextAlign;
  bodyFont?: FontFamily;
  bodySize?: number;        // px (default 30-34)
  bodyWeight?: FontWeight;
  bodyStyle?: FontStyle;
  bodyAlign?: TextAlign;
}

export interface Slide {
  number: number;
  type: 'cover' | 'content' | 'cta';
  title: string;
  body?: string;
  subtitle?: string;
  cta_text?: string;
  cta_url?: string;
  visual_suggestion: string;
  template?: 'centered' | 'split' | 'minimal';
  color?: string;
  image?: SlideImage | null;
  typography?: SlideTypography;
}

export const FONT_OPTIONS: { value: FontFamily; label: string; fallback: string }[] = [
  { value: 'Nunito', label: 'Nunito', fallback: 'sans-serif' },
  { value: 'Codec Pro', label: 'Codec Pro', fallback: 'sans-serif' },
  { value: 'Lazy Dog', label: 'Lazy Dog', fallback: 'cursive' },
];

export interface Carousel {
  id: string;
  concept: string;
  hook: string;
  slides: Slide[];
  hashtags: string[];
  caption: string;
}

export interface GenerationConfig {
  count: number;
  slides_per_carousel: number;
  tone: string;
  platform: string;
  language: string;
  include_cta: boolean;
  cta_text: string;
  brand_context?: string;
  model: string;
}

export interface GenerationMetadata {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  processing_time_ms: number;
}

export interface GenerationResult {
  blog: {
    id: string;
    title: string;
    slug: string;
    url: string;
  };
  carousels: Carousel[];
  metadata: GenerationMetadata;
}

export interface ContentGeneration {
  id: string;
  blog_id: string;
  blog_title: string;
  blog_slug: string;
  type: string;
  model_used: string | null;
  config: GenerationConfig;
  result: GenerationResult;
  status: 'generated' | 'edited' | 'exported' | 'published';
  edited_result: GenerationResult | null;
  tokens_used: number | null;
  cost_usd: number | null;
  processing_time_ms: number | null;
  exported_at: string | null;
  published_at: string | null;
  published_to: string[] | null;
  created_by: string | null;
  created_at: string;
}

export interface ModelOption {
  id: string;
  label: string;
  cost_per_carousel: string;
  speed: string;
  quality: number;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet', cost_per_carousel: '~$0.01', speed: '~15s', quality: 4 },
  { id: 'openai/gpt-4o', label: 'GPT-4o', cost_per_carousel: '~$0.008', speed: '~10s', quality: 4 },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', cost_per_carousel: '~$0.004', speed: '~12s', quality: 3 },
  { id: 'anthropic/claude-opus-4-6', label: 'Claude Opus', cost_per_carousel: '~$0.05', speed: '~30s', quality: 5 },
];

export const TONE_OPTIONS = [
  { value: 'educativo-cercano', label: 'Educativo cercano' },
  { value: 'profesional', label: 'Profesional' },
  { value: 'inspiracional', label: 'Inspiracional' },
  { value: 'divertido', label: 'Divertido' },
];

export const PLATFORM_OPTIONS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'tiktok', label: 'TikTok' },
];

export const EXPORT_FORMATS = [
  { value: '1080x1080', label: '1080×1080 (Instagram post)', width: 1080, height: 1080 },
  { value: '1080x1920', label: '1080×1920 (Stories / TikTok)', width: 1080, height: 1920 },
  { value: '1200x628', label: '1200×628 (Facebook / LinkedIn)', width: 1200, height: 628 },
];

export const BRAND_COLORS: Record<string, string> = {
  naranja: '#FF6768',
  navy: '#2F4060',
  blanco: '#FFFFFF',
  grisClaro: '#F5F5F5',
  negro: '#1A1A2E',
  lima: '#e1f5ad',
  arena: '#fbeaaa',
  lavanda: '#cbd8fb',
};
