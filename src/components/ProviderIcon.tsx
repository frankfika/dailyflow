/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ProviderIcon — inline-SVG brand marks for each AI provider template.
 * Marks are stylized to evoke the real brand identity (color + simple shape)
 * without copying copyrighted assets. All marks use a 40×40 viewBox and
 * render cleanly at 28px and 40px display sizes.
 */
import type { ReactElement } from 'react';

type IconRender = () => ReactElement;

const BG = (fill: string) => (
  <rect x="0" y="0" width="40" height="40" rx="9" fill={fill} />
);

const BG_BORDER = (fill: string, stroke: string) => (
  <rect
    x="0.5"
    y="0.5"
    width="39"
    height="39"
    rx="8.5"
    fill={fill}
    stroke={stroke}
    strokeWidth="1"
  />
);

const BG_DASHED = (fill: string, stroke: string) => (
  <rect
    x="0.75"
    y="0.75"
    width="38.5"
    height="38.5"
    rx="8.25"
    fill={fill}
    stroke={stroke}
    strokeWidth="1.25"
    strokeDasharray="3 2.5"
  />
);

/** 4-point sparkle: a vertical and horizontal diamond overlapping, tapered points. */
const SPARKLE = (fill: string) => (
  <g fill={fill}>
    <path d="M20 8.5 C 20.8 14, 22 17, 27 18, 31.5 19, 31.5 21, 27 22, 22 23, 20.8 26, 20 31.5, 19.2 26, 18 23, 13 22, 8.5 21, 8.5 19, 13 18, 18 17, 19.2 14, 20 8.5 Z" />
  </g>
);

export const BRAND_ICONS: Record<string, IconRender> = {
  // —— Blue whale silhouette on blue rounded square ——
  'DeepSeek': () => (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      {BG('#1E88E5')}
      <path
        d="M11 22 C 13 18, 17 17, 21 17.5 C 25 18, 28 19, 30 20.5 C 31 21, 31.5 21, 31 19.5 C 30.7 19, 30.4 18.5, 30 18.5 C 29.6 18.5, 29.5 18.2, 30 18 C 31 17.7, 32 18.5, 32.5 20 C 33 22, 32.5 24.5, 30 26 C 26 28, 20 28, 15 26.5 C 11 25.5, 9 23, 11 22 Z"
        fill="#FFFFFF"
      />
      <circle cx="27.5" cy="21" r="0.9" fill="#1E88E5" />
    </svg>
  ),

  // —— Black tile with white crescent moon (offset two circles) ——
  'Kimi (Moonshot)': () => (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      {BG('#0A0A0A')}
      <defs>
        <mask id="kimi-mask">
          <rect x="0" y="0" width="40" height="40" fill="white" />
          <circle cx="23" cy="20" r="8.5" fill="black" />
        </mask>
      </defs>
      <circle cx="18" cy="20" r="9" fill="#FFFFFF" mask="url(#kimi-mask)" />
      <circle cx="15" cy="14.5" r="0.9" fill="#FFFFFF" opacity="0.8" />
    </svg>
  ),

  // —— Coral/pink gradient tile with white 4-point sparkle (domestic) ——
  'MiniMax': () => (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mm-dom" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF6B6B" />
          <stop offset="1" stopColor="#FE6B8B" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="40" height="40" rx="9" fill="url(#mm-dom)" />
      {SPARKLE('#FFFFFF')}
    </svg>
  ),

  // —— Orange-pink gradient tile with white sparkle (overseas variant) ——
  'MiniMax (海外)': () => (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mm-os" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF8E53" />
          <stop offset="1" stopColor="#FE6B8B" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="40" height="40" rx="9" fill="url(#mm-os)" />
      {SPARKLE('#FFFFFF')}
    </svg>
  ),

  // —— Vivid blue tile with white stylized "Z" ——
  '智谱 GLM': () => (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      {BG('#0E5FFF')}
      <path
        d="M14 13 L 27 13 L 27 16.5 L 18 25.5 L 27 25.5 L 27 29 L 13 29 L 13 25.5 L 22 16.5 L 14 16.5 Z"
        fill="#FFFFFF"
      />
    </svg>
  ),

  // —— Red tile with white smiling bean face ——
  '豆包 (火山方舟)': () => (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      {BG('#FF4D4F')}
      <ellipse cx="20" cy="22" rx="9" ry="8" fill="#FFFFFF" />
      <circle cx="16.5" cy="21" r="1.3" fill="#FF4D4F" />
      <circle cx="23.5" cy="21" r="1.3" fill="#FF4D4F" />
      <path
        d="M16 25.5 Q 20 28.5, 24 25.5"
        stroke="#FF4D4F"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  ),

  // —— Orange tile with white "Q" letter mark ——
  '阿里云 Qwen': () => (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      {BG('#FF6A00')}
      <circle cx="18" cy="20" r="8" stroke="#FFFFFF" strokeWidth="2.4" fill="none" />
      <line
        x1="23.5"
        y1="25.5"
        x2="28"
        y2="30"
        stroke="#FFFFFF"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  ),

  // —— Green tile with white circuit pattern (chip aesthetic) ——
  '硅基流动 SiliconFlow': () => (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      {BG('#00B96B')}
      <g stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" fill="none">
        <line x1="20" y1="12" x2="20" y2="17" />
        <line x1="11.5" y1="24" x2="16" y2="20" />
        <line x1="28.5" y1="24" x2="24" y2="20" />
      </g>
      <g fill="#FFFFFF">
        <circle cx="20" cy="20" r="3" />
        <circle cx="20" cy="11" r="1.2" />
        <circle cx="11" cy="24.5" r="1.2" />
        <circle cx="29" cy="24.5" r="1.2" />
      </g>
    </svg>
  ),

  // —— Cream tile with tan 4-point "Claude" spark ——
  'Anthropic Claude': () => (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      {BG_BORDER('#FAF9F6', '#D4A574')}
      <g transform="translate(20 20)">
        <path
          d="M0 -10 C 1.2 -3.2, 3.2 -1.2, 10 0, 3.2 1.2, 1.2 3.2, 0 10, -1.2 3.2, -3.2 1.2, -10 0, -3.2 -1.2, -1.2 -3.2, 0 -10 Z"
          fill="#D97757"
        />
      </g>
    </svg>
  ),

  // —— Black tile with white "knot" — two interlocking loops ——
  'OpenAI': () => (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      {BG('#000000')}
      <g
        transform="translate(20 20) rotate(-30)"
        stroke="#FFFFFF"
        strokeWidth="1.8"
        fill="none"
      >
        <ellipse cx="-2.4" cy="0" rx="5.2" ry="8" />
        <ellipse cx="2.4" cy="0" rx="5.2" ry="8" />
      </g>
    </svg>
  ),

  // —— White tile with 4-color Gemini sparkle (blue/red/yellow/green) ——
  'Google Gemini': () => (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      {BG_BORDER('#FFFFFF', '#E5E5E7')}
      <g transform="translate(20 20)">
        <path d="M0 -10 C 1.2 -3.2, 3.2 -1.2, 10 0, 3.2 1.2, 1.2 3.2, 0 10, -1.2 3.2, -3.2 1.2, -10 0, -3.2 -1.2, -1.2 -3.2, 0 -10 Z" fill="#4285F4" />
        <path d="M0 -10 C 1.2 -3.2, 3.2 -1.2, 10 0, 3.2 1.2, 1.2 3.2, 0 10, -1.2 3.2, -3.2 1.2, -10 0, -3.2 -1.2, -1.2 -3.2, 0 -10 Z" fill="#EA4335" transform="rotate(45)" />
        <path d="M0 -10 C 1.2 -3.2, 3.2 -1.2, 10 0, 3.2 1.2, 1.2 3.2, 0 10, -1.2 3.2, -3.2 1.2, -10 0, -3.2 -1.2, -1.2 -3.2, 0 -10 Z" fill="#FBBC05" transform="rotate(90)" />
        <path d="M0 -10 C 1.2 -3.2, 3.2 -1.2, 10 0, 3.2 1.2, 1.2 3.2, 0 10, -1.2 3.2, -3.2 1.2, -10 0, -3.2 -1.2, -1.2 -3.2, 0 -10 Z" fill="#34A853" transform="rotate(135)" />
      </g>
    </svg>
  ),

  // —— Red-orange tile with white lightning bolt ——
  'Groq': () => (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      {BG('#F55036')}
      <path
        d="M22 9 L 13 22 L 19 22 L 17 31 L 27 17 L 21 17 Z"
        fill="#FFFFFF"
      />
    </svg>
  ),

  // —— Black tile with white "B" ——
  'B.AI': () => (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      {BG('#0A0A0A')}
      <g fill="#FFFFFF">
        <rect x="13" y="10" width="3.5" height="20" rx="1" />
        <path d="M16.5 10 H 22.5 C 25.5 10, 27.5 11.5, 27.5 14 C 27.5 16, 26 17, 24 17.2 C 26.5 17.4, 28.5 18.5, 28.5 21 C 28.5 23.5, 26.5 25, 23.5 25 H 16.5 Z M19 13 V 16 H 22 C 23 16, 24 15.5, 24 14.5 C 24 13.5, 23 13, 22 13 Z M19 19 V 22 H 23 C 24 22, 25 21.5, 25 20.5 C 25 19.5, 24 19, 23 19 Z" />
      </g>
    </svg>
  ),

  // —— Purple tile with white network/router mark ——
  'OpenRouter': () => (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      {BG('#7C3AED')}
      <g stroke="#FFFFFF" strokeWidth="1.4" fill="#FFFFFF" strokeLinecap="round">
        <line x1="20" y1="20" x2="20" y2="11" />
        <line x1="20" y1="20" x2="29" y2="20" />
        <line x1="20" y1="20" x2="20" y2="29" />
        <line x1="20" y1="20" x2="11" y2="20" />
      </g>
      <circle cx="20" cy="20" r="2.6" fill="#7C3AED" stroke="#FFFFFF" strokeWidth="1.6" />
      <g fill="#FFFFFF">
        <circle cx="20" cy="10" r="1.6" />
        <circle cx="30" cy="20" r="1.6" />
        <circle cx="20" cy="30" r="1.6" />
        <circle cx="10" cy="20" r="1.6" />
      </g>
    </svg>
  ),

  // —— Light gray tile with dashed border and a "+" ——
  'Custom': () => (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      {BG_DASHED('#F5F5F7', '#9CA3AF')}
      <g stroke="#6B7280" strokeWidth="2" strokeLinecap="round">
        <line x1="20" y1="14" x2="20" y2="26" />
        <line x1="14" y1="20" x2="26" y2="20" />
      </g>
    </svg>
  ),
};

/** Inline SVG brand mark for a provider. Falls back to a neutral initials tile. */
export function ProviderIcon({
  name,
  size = 'md',
}: {
  name: string;
  size?: 'sm' | 'md';
}) {
  const dim = size === 'sm' ? 28 : 40;
  const render = BRAND_ICONS[name];

  if (render) {
    return (
      <div
        className="flex-shrink-0 overflow-hidden rounded-[9px]"
        style={{ width: dim, height: dim }}
        aria-label={name}
      >
        {render()}
      </div>
    );
  }

  // Fallback for user-typed names not in the template map.
  const initials = (name || '?').trim().slice(0, 2).toUpperCase();
  const fontSize = size === 'sm' ? 11 : 13;
  return (
    <div
      className="flex-shrink-0 rounded-md bg-stone-100 text-stone-600 border border-stone-200 flex items-center justify-center font-bold"
      style={{ width: dim, height: dim, fontSize }}
      aria-label={name}
    >
      {initials}
    </div>
  );
}
