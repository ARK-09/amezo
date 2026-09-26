/**
 * The required-field marker, in one place so every asterisk on the form looks the
 * same and carries the same meaning.
 *
 * The visible glyph is hidden from assistive tech and `aria-required` on the control
 * carries the fact instead - a screen reader announcing "Full name star" is noise,
 * and the legend above the form explains the glyph for everyone reading it.
 */
export function RequiredMark() {
  return (
    <span className="ml-0.5 text-destructive" aria-hidden>
      *
    </span>
  )
}
