import { cn } from '@/lib/utils'

/**
 * Amezo's loading mark: a figure running, rather than a wheel turning on the spot.
 *
 * A spinner says "something is happening". A runner says "something is happening and
 * it is going somewhere", which is the difference that matters on this deployment -
 * the free instance sleeps, so the first request after a quiet spell can take a few
 * seconds, and a wheel spinning through that reads as a page that has hung.
 *
 * Drawn rather than animated as a GIF or Lottie: it is a few hundred bytes of SVG
 * that inherits {@link https://tailwindcss.com currentColor}, so the brand accent
 * comes from `text-primary` at the call site and light/dark need no second asset.
 *
 * <h2>Motion, and what it does not claim</h2>
 *
 * The limbs cycle, the figure bobs, and the ground streaks past. Nothing advances a
 * percentage: this component cannot know how far along a request is, and a bar that
 * fills at a rate the server never agreed to is a lie with a progress indicator drawn
 * on it. Movement here means activity. {@link SprinterLoader} is what turns elapsed
 * time into something honest to say.
 *
 * <h2>Reduced motion</h2>
 *
 * Every animation is disabled under `prefers-reduced-motion: reduce` (see index.css),
 * leaving the figure in its stride. The accessible name lives on the block that uses
 * it, so the mark itself is `aria-hidden` and a screen reader hears "Loading" once
 * rather than a description of a drawing.
 */

const SIZES = {
  sm: 'size-5',
  md: 'size-8',
  lg: 'size-14',
} as const

export function Sprinter({
  size = 'md',
  className,
  ...props
}: React.ComponentProps<'svg'> & { size?: keyof typeof SIZES }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-slot="sprinter"
      className={cn('sprinter', SIZES[size], className)}
      {...props}
    >
      {/* The ground the runner covers. Three streaks at different lengths and
          offsets so the sweep reads as speed rather than as a metronome. */}
      <g className="sprinter-ground" strokeWidth={2.5} opacity={0.45}>
        <line x1="2" y1="41" x2="14" y2="41" />
        <line x1="19" y1="41" x2="27" y2="41" />
        <line x1="32" y1="41" x2="38" y2="41" />
      </g>

      <g className="sprinter-body">
        {/* Head. Filled, so the figure reads at 20px as well as at 56px. */}
        <circle cx="29" cy="10" r="4.5" fill="currentColor" stroke="none" />
        {/* Spine, leaning into the run. */}
        <path d="M27 15.5 L22 26" />

        {/* Arms and legs pivot from the shoulder and the hip. Each is its own
            group so the transform-origin can sit on the joint rather than on the
            middle of the viewBox, which is what makes a limb swing instead of
            orbit. */}
        <g className="sprinter-arm-front">
          <path d="M26 18 L33 21 L31 26" />
        </g>
        <g className="sprinter-arm-back">
          <path d="M26 18 L19 17 L17 12" />
        </g>
        <g className="sprinter-leg-front">
          <path d="M22 26 L29 31 L27 38" />
        </g>
        <g className="sprinter-leg-back">
          <path d="M22 26 L15 32 L17 38" />
        </g>
      </g>
    </svg>
  )
}
