import { useCallback, useEffect, useState } from 'react'

import type { Theme } from './palette'

const KEY = 'volleyscore-theme'

function stored(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/** Dark is the default. The choice persists in local storage. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(stored)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* A private window can refuse storage; the theme still applies for this session. */
    }
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  return [theme, toggle]
}
