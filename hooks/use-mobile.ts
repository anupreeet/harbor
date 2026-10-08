import * as React from "react"

const MOBILE_QUERY = "(max-width: 767px)"

// Subscribes to the media query instead of setting state in an effect (React 19 lint rule).
export function useIsMobile() {
  return React.useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(MOBILE_QUERY)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  )
}
