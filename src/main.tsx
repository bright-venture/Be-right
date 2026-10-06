import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import { I18nProvider } from "./i18n"
import { Preloader } from "./components/Preloader"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { installErrorReporting, reloadForNewBuild } from "./lib/reportError"
import { startAnalytics } from "./lib/analytics"
import { INTRO_REPLAY_EVENT, markIntroSeen, shouldPlayIntro } from "./lib/intro"
import App from './App.tsx'

installErrorReporting()
startAnalytics()
// A tab opened before a deploy asks for page files that are gone: load the new version.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForNewBuild()) event.preventDefault()
})

/**
 * Invitation and password-reset emails sign the person in via a link whose URL
 * hash carries `type=invite` / `type=recovery`. Wherever that link lands (Supabase
 * falls back to the Site URL if the requested page isn't allowed), send them to
 * the set-password page first — keeping the hash so the sign-in still completes.
 * (Leaving the home page also means no intro in front of the form.)
 */
function routeAuthEmailLinks() {
  const { hash, pathname } = window.location
  const type = /[#&]type=(invite|recovery)\b/.exec(hash)?.[1]
  if (!type || pathname === "/reset-password") return
  const query = type === "invite" ? `?welcome=1&next=${encodeURIComponent("/tech")}` : ""
  window.history.replaceState(null, "", `/reset-password${query}${hash}`)
}
routeAuthEmailLinks()

function Root() {
  // The bird intro: once per browser session, on the home page only.
  const [introDone, setIntroDone] = useState(() => !shouldPlayIntro())

  // Footer "Replay intro" plays it again on demand.
  useEffect(() => {
    const replay = () => setIntroDone(false)
    window.addEventListener(INTRO_REPLAY_EVENT, replay)
    return () => window.removeEventListener(INTRO_REPLAY_EVENT, replay)
  }, [])

  return (
    <>
      {!introDone && (
        <Preloader
          onDone={() => {
            markIntroSeen()
            setIntroDone(true)
          }}
        />
      )}
      {/* While the intro plays, the page behind it can't be clicked or tabbed into. */}
      <div inert={!introDone}>
        <App />
      </div>
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TRPCProvider>
        <I18nProvider>
          <ErrorBoundary>
            <Root />
          </ErrorBoundary>
        </I18nProvider>
      </TRPCProvider>
    </BrowserRouter>
  </StrictMode>,
)
