// Ported as-is from docs/refeerence/in-match.html.
//
// One primary hex per team produces every shade a panel needs, so a user-picked color
// works with no hand-tuning. Team colors are CONTENT, not chrome: they stay fully
// saturated in both themes and are never replaced by palette values.

export type Theme = 'dark' | 'light'

export interface TeamPalette {
  base: string
  dim: string
  cellFront: string
  cellBack: string
  rule: string
  ink: string
  inkMuted: string
  inkFaint: string
  onActive: string
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const d = mx - mn
  let h = 0
  let s = 0
  const l = (mx + mn) / 2
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return { h, s: s * 100, l: l * 100 }
}

export function hsl(h: number, s: number, l: number): string {
  return (
    'hsl(' +
    h.toFixed(1) +
    ' ' +
    Math.max(0, Math.min(100, s)).toFixed(1) +
    '% ' +
    Math.max(0, Math.min(100, l)).toFixed(1) +
    '%)'
  )
}

export function relLum(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

export function derivePalette(hex: string, theme: Theme): TeamPalette {
  const c = hexToHsl(hex)
  const pale = relLum(hex) > 0.42 /* e.g. a gold or yellow team */
  return {
    base: hex,
    /* Receiving state. Dark theme recedes by darkening. Light theme recedes
       by desaturating and lifting, because on a pale background darkening
       reads as heavier rather than quieter. */
    dim:
      theme === 'light'
        ? hsl(c.h, c.s * 0.4, Math.min(c.l + 16, 62))
        : hsl(c.h, c.s * 0.9, Math.max(c.l - 7, 6)),
    cellFront: hsl(c.h, c.s, c.l + 8),
    cellBack: hsl(c.h, c.s, c.l + 4),
    rule: hsl(c.h, c.s, c.l + 10),
    ink: pale ? '#14141A' : '#FFFFFF',
    inkMuted: pale ? hsl(c.h, c.s * 0.55, 26) : hsl(c.h, Math.min(c.s, 42), c.l + 46),
    inkFaint: pale ? hsl(c.h, c.s * 0.5, 40) : hsl(c.h, Math.min(c.s, 38), c.l + 34),
    onActive: hex,
  }
}
