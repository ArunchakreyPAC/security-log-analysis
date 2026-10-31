export default function Notice({ title, children }) {
  return (
    <div className="notice" role="alert">
      {title && <strong>{title}</strong>}
      <span>{children}</span>
    </div>
  )
}
