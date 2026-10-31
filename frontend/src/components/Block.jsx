/** A page section: title and explanation on the left, content on the right. */
export default function Block({ id, title, description, children }) {
  const headingId = id ? `${id}-heading` : undefined
  return (
    <section className="block" id={id} aria-labelledby={headingId}>
      <header className="block-head">
        <h2 id={headingId}>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      <div className="block-body">{children}</div>
    </section>
  )
}
