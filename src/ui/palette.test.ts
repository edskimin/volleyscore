import { describe, expect, it } from 'vitest'

import { derivePalette, relLum, type Theme } from './palette'

/**
 * Captured by running derivePalette() inside docs/refeerence/in-match.html itself.
 * If our port ever drifts from the reference, this fails.
 */
const REFERENCE: Array<[Theme, string, Record<string, string>]> = [
  ['dark', '#14284B', { base: '#14284B', dim: 'hsl(218.2 52.1% 11.6%)', cellFront: 'hsl(218.2 57.9% 26.6%)', cellBack: 'hsl(218.2 57.9% 22.6%)', rule: 'hsl(218.2 57.9% 28.6%)', ink: '#FFFFFF', inkMuted: 'hsl(218.2 42.0% 64.6%)', inkFaint: 'hsl(218.2 38.0% 52.6%)', onActive: '#14284B' }],
  ['light', '#14284B', { base: '#14284B', dim: 'hsl(218.2 23.2% 34.6%)', cellFront: 'hsl(218.2 57.9% 26.6%)', cellBack: 'hsl(218.2 57.9% 22.6%)', rule: 'hsl(218.2 57.9% 28.6%)', ink: '#FFFFFF', inkMuted: 'hsl(218.2 42.0% 64.6%)', inkFaint: 'hsl(218.2 38.0% 52.6%)', onActive: '#14284B' }],
  ['dark', '#8C1D2C', { base: '#8C1D2C', dim: 'hsl(351.9 59.1% 26.1%)', cellFront: 'hsl(351.9 65.7% 41.1%)', cellBack: 'hsl(351.9 65.7% 37.1%)', rule: 'hsl(351.9 65.7% 43.1%)', ink: '#FFFFFF', inkMuted: 'hsl(351.9 42.0% 79.1%)', inkFaint: 'hsl(351.9 38.0% 67.1%)', onActive: '#8C1D2C' }],
  ['light', '#8C1D2C', { base: '#8C1D2C', dim: 'hsl(351.9 26.3% 49.1%)', cellFront: 'hsl(351.9 65.7% 41.1%)', cellBack: 'hsl(351.9 65.7% 37.1%)', rule: 'hsl(351.9 65.7% 43.1%)', ink: '#FFFFFF', inkMuted: 'hsl(351.9 42.0% 79.1%)', inkFaint: 'hsl(351.9 38.0% 67.1%)', onActive: '#8C1D2C' }],
  ['dark', '#E8B613', { base: '#E8B613', dim: 'hsl(45.9 76.4% 42.2%)', cellFront: 'hsl(45.9 84.9% 57.2%)', cellBack: 'hsl(45.9 84.9% 53.2%)', rule: 'hsl(45.9 84.9% 59.2%)', ink: '#14141A', inkMuted: 'hsl(45.9 46.7% 26.0%)', inkFaint: 'hsl(45.9 42.4% 40.0%)', onActive: '#E8B613' }],
  ['light', '#E8B613', { base: '#E8B613', dim: 'hsl(45.9 33.9% 62.0%)', cellFront: 'hsl(45.9 84.9% 57.2%)', cellBack: 'hsl(45.9 84.9% 53.2%)', rule: 'hsl(45.9 84.9% 59.2%)', ink: '#14141A', inkMuted: 'hsl(45.9 46.7% 26.0%)', inkFaint: 'hsl(45.9 42.4% 40.0%)', onActive: '#E8B613' }],
  ['dark', '#FFFFFF', { base: '#FFFFFF', dim: 'hsl(0.0 0.0% 93.0%)', cellFront: 'hsl(0.0 0.0% 100.0%)', cellBack: 'hsl(0.0 0.0% 100.0%)', rule: 'hsl(0.0 0.0% 100.0%)', ink: '#14141A', inkMuted: 'hsl(0.0 0.0% 26.0%)', inkFaint: 'hsl(0.0 0.0% 40.0%)', onActive: '#FFFFFF' }],
  ['light', '#FFFFFF', { base: '#FFFFFF', dim: 'hsl(0.0 0.0% 62.0%)', cellFront: 'hsl(0.0 0.0% 100.0%)', cellBack: 'hsl(0.0 0.0% 100.0%)', rule: 'hsl(0.0 0.0% 100.0%)', ink: '#14141A', inkMuted: 'hsl(0.0 0.0% 26.0%)', inkFaint: 'hsl(0.0 0.0% 40.0%)', onActive: '#FFFFFF' }],
  ['dark', '#000000', { base: '#000000', dim: 'hsl(0.0 0.0% 6.0%)', cellFront: 'hsl(0.0 0.0% 8.0%)', cellBack: 'hsl(0.0 0.0% 4.0%)', rule: 'hsl(0.0 0.0% 10.0%)', ink: '#FFFFFF', inkMuted: 'hsl(0.0 0.0% 46.0%)', inkFaint: 'hsl(0.0 0.0% 34.0%)', onActive: '#000000' }],
  ['light', '#000000', { base: '#000000', dim: 'hsl(0.0 0.0% 16.0%)', cellFront: 'hsl(0.0 0.0% 8.0%)', cellBack: 'hsl(0.0 0.0% 4.0%)', rule: 'hsl(0.0 0.0% 10.0%)', ink: '#FFFFFF', inkMuted: 'hsl(0.0 0.0% 46.0%)', inkFaint: 'hsl(0.0 0.0% 34.0%)', onActive: '#000000' }],
]

describe('derivePalette', () => {
  it.each(REFERENCE)('matches the reference for %s %s', (theme, hex, expected) => {
    expect(derivePalette(hex, theme)).toEqual(expected)
  })

  it('flips ink to near-black once the team color is pale', () => {
    // The threshold the reference uses is a relative luminance above 0.42.
    expect(relLum('#E8B613')).toBeGreaterThan(0.42)
    expect(relLum('#8C1D2C')).toBeLessThan(0.42)
    expect(derivePalette('#E8B613', 'dark').ink).toBe('#14141A')
    expect(derivePalette('#8C1D2C', 'dark').ink).toBe('#FFFFFF')
  })

  it('recedes by darkening in dark theme and by desaturating and lifting in light', () => {
    const navy = '#14284B'
    expect(derivePalette(navy, 'dark').dim).toBe('hsl(218.2 52.1% 11.6%)') // l 18.6 -> 11.6
    expect(derivePalette(navy, 'light').dim).toBe('hsl(218.2 23.2% 34.6%)') // s x0.4, l +16
  })
})
