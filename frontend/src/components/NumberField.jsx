/** A small whole-number input that sits inside a sentence. Invalid entries are marked, not sent. */
export default function NumberField({ label, value, onChange, min, max }) {
  const n = Number(value)
  const valid = value !== '' && Number.isInteger(n) && n >= min && n <= max
  return (
    <input
      className="inline-number"
      type="text"
      inputMode="numeric"
      aria-label={label}
      aria-invalid={!valid}
      title={valid ? label : `Enter a whole number from ${min} to ${max}`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}
