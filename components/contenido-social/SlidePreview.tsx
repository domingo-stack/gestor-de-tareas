'use client';

import type { Slide, SlideTypography } from '@/lib/content-social-types';
import { BRAND_COLORS, FONT_OPTIONS } from '@/lib/content-social-types';

function getFontFamily(font?: string): string {
  const match = FONT_OPTIONS.find(f => f.value === font);
  return match ? `"${match.value}", ${match.fallback}` : '"Nunito", sans-serif';
}

interface Props {
  slide: Slide;
  size?: number;
  colorScheme?: string;
}

export default function SlidePreview({ slide, size = 280, colorScheme = 'naranja' }: Props) {
  const template = slide.template || 'centered';
  const bgColor = BRAND_COLORS[colorScheme] || BRAND_COLORS.naranja;
  const lightBgs = ['blanco', 'lima', 'arena', 'lavanda', 'grisClaro'];
  const textColor = lightBgs.includes(colorScheme) ? '#1A1A2E' : '#FFFFFF';
  const accentColor = lightBgs.includes(colorScheme) ? BRAND_COLORS.naranja : BRAND_COLORS.navy;
  const scale = size / 1080;
  const typo = slide.typography || {};
  const titleFontFamily = getFontFamily(typo.titleFont);
  const titleSize = typo.titleSize || (slide.type === 'cover' ? 64 : 56);
  const titleWeight = typo.titleWeight || 800;
  const titleFontStyle = typo.titleStyle || 'normal';
  const bodyFontFamily = getFontFamily(typo.bodyFont);
  const bodySize = typo.bodySize || 32;
  const bodyWeight = typo.bodyWeight || 400;
  const bodyFontStyle = typo.bodyStyle || 'normal';
  const titleAlign = typo.titleAlign || 'center';
  const bodyAlign = typo.bodyAlign || 'center';

  return (
    <div style={{ width: size, height: size, overflow: 'hidden', borderRadius: 8, border: '1px solid #E5E7EB', flexShrink: 0 }}>
      <div
        className="slide-render"
        style={{
          width: 1080,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          fontFamily: '"Nunito", sans-serif',
          backgroundColor: bgColor,
          color: textColor,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          padding: template === 'minimal' ? 100 : 80,
        }}
      >
        {template === 'centered' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: titleAlign === 'center' ? 'center' : titleAlign === 'right' ? 'flex-end' : 'flex-start', textAlign: titleAlign, gap: 30, position: 'relative', zIndex: 2 }}>
            {slide.type === 'cover' && (
              <div style={{ width: 80, height: 6, backgroundColor: accentColor, borderRadius: 3 }} />
            )}
            <h2 style={{ fontSize: titleSize, fontWeight: titleWeight, fontStyle: titleFontStyle, fontFamily: titleFontFamily, lineHeight: 1.15, maxWidth: 900, textAlign: titleAlign, width: '100%', whiteSpace: 'pre-line' }}>
              {slide.title}
            </h2>
            {slide.subtitle && (
              <p style={{ fontSize: bodySize, fontFamily: bodyFontFamily, fontWeight: bodyWeight, fontStyle: bodyFontStyle, opacity: 0.85, maxWidth: 750, textAlign: bodyAlign, width: '100%', whiteSpace: 'pre-line' }}>{slide.subtitle}</p>
            )}
            {slide.body && (
              <p style={{ fontSize: bodySize + 2, fontFamily: bodyFontFamily, fontWeight: bodyWeight, fontStyle: bodyFontStyle, opacity: 0.9, maxWidth: 800, lineHeight: 1.45, textAlign: bodyAlign, width: '100%', whiteSpace: 'pre-line' }}>{slide.body}</p>
            )}
            {slide.type === 'cta' && slide.cta_text && (
              <div style={{
                marginTop: 30,
                backgroundColor: accentColor,
                color: '#FFFFFF',
                padding: '20px 50px',
                borderRadius: 16,
                fontSize: 30,
                fontWeight: 700,
              }}>
                {slide.cta_text}
              </div>
            )}
          </div>
        )}

        {template === 'split' && (
          <div style={{ flex: 1, display: 'flex', gap: 60, position: 'relative', zIndex: 2 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 24 }}>
              <h2 style={{ fontSize: titleSize - 4, fontWeight: titleWeight, fontStyle: titleFontStyle, fontFamily: titleFontFamily, lineHeight: 1.15, textAlign: titleAlign, whiteSpace: 'pre-line' }}>{slide.title}</h2>
              {(slide.body || slide.subtitle) && (
                <p style={{ fontSize: bodySize - 2, fontFamily: bodyFontFamily, fontWeight: bodyWeight, fontStyle: bodyFontStyle, opacity: 0.85, lineHeight: 1.45, textAlign: bodyAlign, whiteSpace: 'pre-line' }}>{slide.body || slide.subtitle}</p>
              )}
              {slide.type === 'cta' && slide.cta_text && (
                <div style={{
                  backgroundColor: accentColor, color: '#FFF',
                  padding: '16px 36px', borderRadius: 14, fontSize: 26, fontWeight: 700, alignSelf: 'flex-start',
                }}>
                  {slide.cta_text}
                </div>
              )}
            </div>
            <div style={{
              flex: 1, backgroundColor: `${accentColor}20`, borderRadius: 24,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <p style={{ fontSize: 22, opacity: 0.5, textAlign: 'center', padding: 30 }}>
                {slide.visual_suggestion || 'Visual aquí'}
              </p>
            </div>
          </div>
        )}

        {template === 'minimal' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 20, position: 'relative', zIndex: 2 }}>
            <div style={{ width: 60, height: 4, backgroundColor: accentColor, borderRadius: 2 }} />
            <h2 style={{ fontSize: titleSize - 2, fontWeight: titleWeight, fontStyle: titleFontStyle, fontFamily: titleFontFamily, lineHeight: 1.15, textAlign: titleAlign, whiteSpace: 'pre-line' }}>{slide.title}</h2>
            {(slide.body || slide.subtitle) && (
              <p style={{ fontSize: bodySize - 2, fontFamily: bodyFontFamily, fontWeight: bodyWeight, fontStyle: bodyFontStyle, opacity: 0.8, lineHeight: 1.45, maxWidth: 700, textAlign: bodyAlign, whiteSpace: 'pre-line' }}>{slide.body || slide.subtitle}</p>
            )}
            {slide.type === 'cta' && slide.cta_text && (
              <div style={{
                marginTop: 20, backgroundColor: accentColor, color: '#FFF',
                padding: '16px 36px', borderRadius: 14, fontSize: 26, fontWeight: 700, alignSelf: 'flex-start',
              }}>
                {slide.cta_text}
              </div>
            )}
          </div>
        )}

        {/* Image overlay — behind text (z-index 1, text is z-index 2) */}
        {slide.image && slide.image.url && (slide.image.layer || 'behind') === 'behind' && (
          <img
            src={slide.image.url}
            alt=""
            style={{
              position: 'absolute',
              left: `${slide.image.x}%`,
              top: `${slide.image.y}%`,
              width: `${slide.image.width}%`,
              height: 'auto',
              transform: `translate(-50%, -50%) rotate(${slide.image.rotation || 0}deg)`,
              opacity: slide.image.opacity,
              objectFit: 'contain',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        )}

        {/* Image overlay — in front of text (z-index 10) */}
        {slide.image && slide.image.url && slide.image.layer === 'front' && (
          <img
            src={slide.image.url}
            alt=""
            style={{
              position: 'absolute',
              left: `${slide.image.x}%`,
              top: `${slide.image.y}%`,
              width: `${slide.image.width}%`,
              height: 'auto',
              transform: `translate(-50%, -50%) rotate(${slide.image.rotation || 0}deg)`,
              opacity: slide.image.opacity,
              objectFit: 'contain',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />
        )}

        {/* Slide number badge */}
        <div style={{
          position: 'absolute', bottom: 40, right: 40,
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: `${textColor}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, fontWeight: 700, opacity: 0.5,
        }}>
          {slide.number}
        </div>
      </div>
    </div>
  );
}

/** Full-size render for export (1080x1080) */
export function SlideRenderFull({ slide, colorScheme = 'naranja' }: { slide: Slide; colorScheme?: string }) {
  return <SlidePreview slide={slide} size={1080} colorScheme={colorScheme} />;
}
