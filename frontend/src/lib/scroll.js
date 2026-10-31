/** Smoothly bring the events table into view, unless the reader prefers reduced motion. */
export function scrollToEvents() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById('events')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}
