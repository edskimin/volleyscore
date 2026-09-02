import { useEffect, useState } from 'react'

/**
 * Durability mitigation 2 from 01-data-model.md. Safari can evict script-writable
 * storage after roughly seven days without site interaction; home-screen installed
 * PWAs are treated differently, though that is not a guarantee, which is why the
 * blocking closeout export remains the real protection.
 *
 * Installing also makes the app run full screen, which the landscape layout assumes.
 */

interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari predates the display-mode media query for installed apps.
    (navigator as { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  const ua = navigator.userAgent
  // iPadOS 13+ reports itself as a Mac, so a touch-capable Mac is really an iPad.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

interface Props {
  onDismiss: () => void
}

export default function InstallPrompt({ onDismiss }: Props) {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null)
  const [standalone] = useState(isStandalone)

  // Chromium fires this and lets the page trigger a real install. Safari never does,
  // so iOS falls back to telling the operator where the control is.
  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as InstallEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  if (standalone) return null

  const ios = isIOS()
  if (!ios && !deferred) return null

  return (
    <section className="card install-prompt">
      <div className="install-copy">
        <h2>Add VolleyScore to the home screen</h2>
        <p className="muted">
          {ios ? (
            <>
              Tap <b>Share</b>, then <b>Add to Home Screen</b>. It runs full screen, and
              browser storage lasts longer than it does in a Safari tab.
            </>
          ) : (
            <>
              Installed, it runs full screen and its stored matches are less likely to be
              cleared.
            </>
          )}{' '}
          Export every match anyway — that file is the only copy that is genuinely safe.
        </p>
      </div>
      <div className="install-actions">
        {/* Outlined: the home screen's primary is "New match", and two filled
            controls in one layer is two answers to "what next". */}
        {deferred && (
          <button
            className="btn"
            onClick={() => {
              void deferred.prompt().then(() => setDeferred(null))
            }}
          >
            Install
          </button>
        )}
        <button className="btn ghost" onClick={onDismiss}>
          Not now
        </button>
      </div>
    </section>
  )
}
