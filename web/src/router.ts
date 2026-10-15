import {
  createElement,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from 'react'

const navigationEvent = 'tally:navigation'

function scrollToFragment(hash: string): void {
  if (!hash) return
  let id = hash.slice(1)
  try {
    id = decodeURIComponent(id)
  } catch {
    id = hash.slice(1)
  }
  window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
}

function currentPath(): string {
  return window.location.pathname
}

function subscribeToPath(listener: () => void): () => void {
  window.addEventListener('popstate', listener)
  window.addEventListener(navigationEvent, listener)
  return () => {
    window.removeEventListener('popstate', listener)
    window.removeEventListener(navigationEvent, listener)
  }
}

export function usePath(): string {
  return useSyncExternalStore(subscribeToPath, currentPath, currentPath)
}

export function navigate(to: string): void {
  const destination = new URL(to, window.location.href)
  if (destination.origin !== window.location.origin) {
    window.location.assign(destination.href)
    return
  }

  const nextPath = `${destination.pathname}${destination.search}${destination.hash}`
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (nextPath === currentUrl) {
    scrollToFragment(destination.hash)
    return
  }

  window.history.pushState(null, '', nextPath)
  window.dispatchEvent(new Event(navigationEvent))
  scrollToFragment(destination.hash)
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string
}

export function Link({ to, onClick, target, download, ...props }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
    onClick?.(event)
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || (target !== undefined && target !== '_self')
      || download !== undefined
    ) return

    const destination = new URL(to, window.location.href)
    if (destination.origin !== window.location.origin) return
    event.preventDefault()
    navigate(`${destination.pathname}${destination.search}${destination.hash}`)
  }

  return createElement('a', { ...props, href: to, target, download, onClick: handleClick })
}
