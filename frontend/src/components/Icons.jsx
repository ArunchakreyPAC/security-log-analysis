// Status icons. Colour is never the only signal: each is paired with a text label.
export const FailIcon = () => (
  <svg className="icon icon-bad" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <circle cx="8" cy="8" r="7.5" fill="currentColor" />
    <path d="M5.3 5.3l5.4 5.4M10.7 5.3l-5.4 5.4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

export const OkIcon = () => (
  <svg className="icon icon-good" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <circle cx="8" cy="8" r="7.5" fill="currentColor" />
    <path d="M4.6 8.4l2.3 2.3 4.5-4.8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
)

export const FlagIcon = () => (
  <svg className="icon icon-bad" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d="M3.5 1.5v13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M4.3 2.5h8l-2 3 2 3h-8z" fill="currentColor" />
  </svg>
)
