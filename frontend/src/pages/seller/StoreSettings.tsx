import { ExternalLink, MapPin } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { BrandingSection } from '@/features/store-settings/components/BrandingSection'
import { initialsFrom } from '@/features/store-settings/branding'
import {
  useMyStore,
  useUpdateMyStore,
  type StoreProfile,
} from '@/features/store-settings/api/useStoreProfile'
import { cn } from '@/lib/utils'

/** The design's own limits, printed under the two fields that carry a counter. */
const TAGLINE_LIMIT = 90
const ABOUT_LIMIT = 600
const NAME_LIMIT = 60
const VACATION_NOTE_LIMIT = 120

/**
 * The public storefront lives at /stores/:handle in this app's router, so the
 * printed URL says "stores". The mock writes amezo.com/store/ (singular), which
 * would be an address that 404s - and the contract's own StoreHandle description
 * says amezo.com/stores/{handle} too.
 */
const STORE_URL_PREFIX = 'amezo.com/stores/'

type Draft = {
  name: string
  handle: string
  tagline: string
  location: string
  foundedYear: string
  supportEmail: string
  about: string
  onVacation: boolean
  vacationNote: string
}

function draftFrom(profile: StoreProfile): Draft {
  return {
    name: profile.name,
    handle: profile.handle,
    tagline: profile.tagline ?? '',
    location: profile.location ?? '',
    foundedYear: profile.foundedYear ? String(profile.foundedYear) : '',
    supportEmail: profile.supportEmail ?? '',
    about: profile.about ?? '',
    onVacation: profile.status === 'VACATION',
    vacationNote: profile.vacationNote ?? '',
  }
}

/**
 * The handle rule lives in the contract as StoreHandle: lowercase letters, digits
 * and inner dashes, 2-39 characters, no dash at either end.
 *
 * This runs on every keystroke, so it deliberately does NOT strip a trailing dash:
 * typing "my store" passes through "my-", and eating that dash would splice the
 * next word onto the last one ("mystore"). The dash is trimmed once on save
 * instead - see normaliseHandle - which is the only point the server sees it.
 */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, 39)
}

/** What actually goes to the server: slugify's transient trailing dash, gone. */
function normaliseHandle(value: string): string {
  return slugify(value).replace(/-+$/, '')
}

/** Mirrors StoreHandle's pattern and minLength, so a reject is caught before the round trip. */
const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{0,37}[a-z0-9]$/

/**
 * One field's worth of the RFC 7807 errors array, turned into something that
 * reads under an input.
 *
 * The 409 is special-cased because its reason ("already in use") is a phrase
 * about the value, not about the rule, and "That store URL is already in use"
 * is the sentence the seller needs. Every other reason the server sends is a
 * constraint fragment ("must be a valid email address") that reads correctly on
 * its own once it sits under the field it belongs to.
 */
function serverFieldMessage(status: number | undefined, field: string, reason: string): string {
  if (status === 409 && field === 'handle') {
    return 'That store URL is already taken.'
  }
  const sentence = reason.charAt(0).toUpperCase() + reason.slice(1)
  return sentence.endsWith('.') ? sentence : `${sentence}.`
}

/** A label, its control, an optional hint, and the field's own error. */
function Field({
  id,
  label,
  hideLabel,
  hint,
  error,
  className,
  children,
}: {
  id: string
  label: string
  /** For the About box, whose section heading already names it in the design. */
  hideLabel?: boolean
  hint?: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} className={cn('text-[13px] font-semibold', hideLabel && 'sr-only')}>
        {label}
      </Label>
      {children}
      {/* The error replaces the hint rather than stacking under it: two lines of
          small print under one input is where a seller stops reading either. */}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-semibold text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

/**
 * One of the two Visibility cards. A real radio rather than two buttons with an
 * aria-pressed each: the choice is one-of-two, which is what a radiogroup means,
 * and it brings arrow-key navigation with it. The dot is hidden because the
 * design's selected state is the card itself - tinted, primary-bordered, primary
 * heading - and a second indicator would say the same thing twice.
 */
function VisibilityOption({
  value,
  title,
  detail,
  selected,
}: {
  value: string
  title: string
  detail: string
  selected: boolean
}) {
  return (
    <Label
      htmlFor={`st-visibility-${value}`}
      className={cn(
        'flex flex-1 basis-[200px] cursor-pointer flex-col items-start gap-0.5 rounded-lg border p-3.5 transition-colors',
        // The radio itself is sr-only, so its own focus ring is invisible. The
        // card wears it instead - without this a keyboard user arrowing through
        // the group gets no indication of where they are.
        'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
        selected ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/30',
      )}
    >
      <RadioGroupItem id={`st-visibility-${value}`} value={value} className="sr-only" />
      <span className={cn('text-sm font-bold', selected && 'text-primary')}>{title}</span>
      <span className="text-xs font-normal text-muted-foreground text-pretty">{detail}</span>
    </Label>
  )
}

export function StoreSettings() {
  const query = useMyStore()
  const update = useUpdateMyStore()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [seededFrom, setSeededFrom] = useState<string | null>(null)
  const [seededSave, setSeededSave] = useState<StoreProfile | null>(null)

  const baseline = useMemo(() => (query.data ? draftFrom(query.data) : null), [query.data])
  const baselineKey = baseline && JSON.stringify(baseline)

  // Seed from the saved profile, and re-seed whenever one of these fields
  // changes under the form. Derived during render rather than in an effect: an
  // effect would paint the stale draft once before correcting it.
  //
  // Keyed on the seeded values rather than on updatedAt, which is optional - a
  // server that omits it never re-seeded the draft at all, so the form sat on
  // its skeleton forever. Values rather than the profile object, because a
  // branding upload replaces that object without touching a single field of this
  // form, and re-seeding on it would throw away whatever the seller had typed
  // meanwhile.
  if (baseline && baselineKey !== seededFrom) {
    setSeededFrom(baselineKey)
    setDraft(baseline)
  }

  // A save of this form is a new baseline whatever came back, so the form stops
  // reading as dirty: save trims what was typed, and a trailing space trimmed
  // away leaves every seeded field identical to the one already seeded - which
  // the check above would read as nothing to do.
  if (update.data && update.data !== seededSave) {
    setSeededSave(update.data)
    setDraft(draftFrom(update.data))
  }

  const dirty = Boolean(draft && baselineKey && JSON.stringify(draft) !== baselineKey)

  if (query.isError) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
        <p className="font-medium">Couldn't load your store</p>
        <p className="text-sm text-muted-foreground">
          {query.error?.detail ?? 'Something went wrong. Try again.'}
        </p>
        <Button variant="outline" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  const profile = query.data
  if (query.isLoading || !draft || !profile) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-64 w-full max-w-[720px]" />
      </div>
    )
  }

  // Number('19a9') is NaN, which serialises to null against an integer field.
  const trimmedYear = draft.foundedYear.trim()
  const foundedYearValue = /^\d{4}$/.test(trimmedYear) ? Number(trimmedYear) : null
  const foundedYearOk = !trimmedYear || foundedYearValue !== null
  const emailOk =
    !draft.supportEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.supportEmail.trim())
  const handleValue = normaliseHandle(draft.handle)
  const handleOk = HANDLE_PATTERN.test(handleValue)
  const nameOk = Boolean(draft.name.trim())

  // What the footer bar prints, in the design's own words.
  const missing: string[] = []
  if (!nameOk) missing.push('a store name')
  if (!handleOk) missing.push('a store URL')
  if (!emailOk) missing.push('a valid support email')
  if (!foundedYearOk) missing.push('a four-digit year')

  // Every message is named for the field it belongs to, never a general "check
  // your input": the server's errors[] entries are keyed by field, and the local
  // checks are written to the same shape so both land under the same input.
  const serverErrors: Record<string, string> = {}
  for (const entry of update.error?.errors ?? []) {
    if (entry.field && entry.reason && !serverErrors[entry.field]) {
      serverErrors[entry.field] = serverFieldMessage(
        update.error?.status,
        entry.field,
        entry.reason,
      )
    }
  }
  const fieldError = (field: string, local?: string): string | undefined =>
    local ?? serverErrors[field]

  const nameError = fieldError('name', nameOk ? undefined : 'Enter a store name.')
  const handleError = fieldError(
    'handle',
    // slugify already guarantees the charset as the seller types, so the only way
    // to fail the contract's pattern here is to be empty or one character long.
    handleOk ? undefined : draft.handle.trim() ? 'Use at least two characters.' : 'Enter a store URL.',
  )
  const emailError = fieldError('supportEmail', emailOk ? undefined : 'Enter a valid email address.')
  const yearError = fieldError('foundedYear', foundedYearOk ? undefined : 'Enter a four-digit year.')

  // Anything the server complained about that has no field of its own. Without
  // this a rejection naming, say, "request" would disappear entirely.
  const unmappedErrors = (update.error?.errors ?? []).filter(
    (entry) => !entry.field || !['name', 'handle', 'supportEmail', 'foundedYear'].includes(entry.field),
  )
  const bannerError = update.isError
    ? unmappedErrors.length > 0
      ? unmappedErrors.map((entry) => entry.reason).join(' ')
      : Object.keys(serverErrors).length === 0
        ? (update.error?.detail ?? "We couldn't save your store.")
        : undefined
    : undefined

  const canSave = dirty && missing.length === 0 && !update.isPending

  function patch(next: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...next } : current))
  }

  function save() {
    if (!canSave || !draft) return
    update.mutate({
      name: draft.name.trim(),
      handle: handleValue,
      tagline: draft.tagline.trim(),
      location: draft.location.trim(),
      // null, not undefined. An emptied "Selling since" box has to REMOVE the
      // year, and undefined would drop the key from the body - which the server
      // reads as "leave it alone", making the box impossible to empty.
      foundedYear: foundedYearValue,
      supportEmail: draft.supportEmail.trim(),
      about: draft.about.trim(),
      status: draft.onVacation ? 'VACATION' : 'OPEN',
      vacationNote: draft.vacationNote.trim(),
    })
  }

  function discard() {
    if (baseline) {
      update.reset()
      setDraft(baseline)
    }
  }

  const previewUrl = `${STORE_URL_PREFIX}${handleValue || '…'}`
  const savedHandle = profile.handle
  const initials = initialsFrom(draft.name)

  return (
    // min-h-full + flex column so the action bar can be pushed to the bottom on
    // a short page and stay stuck to it on a long one. The portal shell owns the
    // gutter and the scrolling, so there is no padding and no overflow here.
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.01em]">Store settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How your storefront looks to shoppers on Amezo.
          </p>
        </div>
        {/* The SAVED handle, not the draft: an unsaved URL is not a page yet, and
            linking to it would open a 404. */}
        <Button asChild variant="outline" size="sm" className="gap-1.5 font-semibold">
          <Link to={`/stores/${savedHandle}`} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" aria-hidden />
            View live store
          </Link>
        </Button>
      </div>

      {update.isSuccess && !dirty && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-sm font-medium text-primary"
        >
          Storefront updated — changes are live on {STORE_URL_PREFIX}
          {savedHandle}.
        </p>
      )}

      {bannerError && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm font-medium text-destructive"
        >
          {bannerError}
        </p>
      )}

      {/* pb-6 restores the gutter the action bar's -mb-6 takes away. Without it the
          last section ends flush against the bar, because the shell's bottom padding
          now sits BELOW the bar rather than between the two. */}
      <div className="mt-5 flex flex-wrap items-start gap-6 pb-6">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-4">
          {/* Branding sits outside the draft: an upload is live the moment it is
              confirmed, so there is nothing for Save changes to carry and nothing
              for Discard to put back. */}
          <BrandingSection profile={profile} storeName={draft.name} />

          <section className="rounded-xl border p-5">
            <h2 className="text-[15px] font-bold">Store identity</h2>

            <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
              <Field id="st-name" label="Store name" error={nameError}>
                <Input
                  id="st-name"
                  value={draft.name}
                  maxLength={NAME_LIMIT}
                  placeholder="Aurora Audio"
                  aria-invalid={Boolean(nameError)}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </Field>
              <Field id="st-handle" label="Store URL" error={handleError}>
                <InputGroup className="h-9">
                  <InputGroupText className="rounded-l-md bg-muted py-2 pl-3 text-[13px]">
                    {STORE_URL_PREFIX}
                  </InputGroupText>
                  <InputGroupInput
                    id="st-handle"
                    value={draft.handle}
                    placeholder="aurora-audio"
                    aria-invalid={Boolean(handleError)}
                    onChange={(e) => patch({ handle: slugify(e.target.value) })}
                  />
                </InputGroup>
              </Field>
            </div>

            <Field
              id="st-tagline"
              label="Tagline"
              className="mt-3.5"
              hint={`${draft.tagline.length}/${TAGLINE_LIMIT} characters`}
            >
              <Input
                id="st-tagline"
                value={draft.tagline}
                maxLength={TAGLINE_LIMIT}
                placeholder="One line shoppers see under your store name"
                onChange={(e) => patch({ tagline: e.target.value })}
              />
            </Field>

            <div className="mt-3.5 grid gap-3.5 sm:grid-cols-3">
              <Field id="st-location" label="Based in">
                <Input
                  id="st-location"
                  value={draft.location}
                  placeholder="Portland, OR"
                  onChange={(e) => patch({ location: e.target.value })}
                />
              </Field>
              <Field id="st-founded" label="Selling since" error={yearError}>
                <Input
                  id="st-founded"
                  inputMode="numeric"
                  value={draft.foundedYear}
                  placeholder="2019"
                  aria-invalid={Boolean(yearError)}
                  onChange={(e) => patch({ foundedYear: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                />
              </Field>
              <Field id="st-email" label="Support email" error={emailError}>
                <Input
                  id="st-email"
                  type="email"
                  value={draft.supportEmail}
                  placeholder="hello@auroraaudio.com"
                  aria-invalid={Boolean(emailError)}
                  onChange={(e) => patch({ supportEmail: e.target.value })}
                />
              </Field>
            </div>
          </section>

          <section className="rounded-xl border p-5">
            <h2 className="text-[15px] font-bold">About the store</h2>
            <p className="mt-1 text-[13px] text-muted-foreground text-pretty">
              Two or three sentences on what you make and who it is for.
            </p>
            <Field
              id="st-about"
              label="About the store"
              hideLabel
              className="mt-3.5"
              hint={`${draft.about.length}/${ABOUT_LIMIT} characters`}
            >
              <Textarea
                id="st-about"
                rows={6}
                maxLength={ABOUT_LIMIT}
                placeholder="We build small-batch listening gear in Portland…"
                className="leading-relaxed"
                value={draft.about}
                onChange={(e) => patch({ about: e.target.value })}
              />
            </Field>
          </section>

          <section className="rounded-xl border p-5">
            <h2 className="text-[15px] font-bold">Visibility</h2>
            <RadioGroup
              className="mt-3.5 flex flex-wrap gap-2.5"
              aria-label="Visibility"
              value={draft.onVacation ? 'VACATION' : 'OPEN'}
              onValueChange={(next) => patch({ onVacation: next === 'VACATION' })}
            >
              <VisibilityOption
                value="OPEN"
                title="Open for orders"
                detail="Store and active products are visible."
                selected={!draft.onVacation}
              />
              <VisibilityOption
                value="VACATION"
                title="Vacation mode"
                detail="Listings stay up, checkout is paused."
                selected={draft.onVacation}
              />
            </RadioGroup>

            {draft.onVacation && (
              <Field id="st-vacation-note" label="Notice shown to shoppers" className="mt-3.5">
                <Input
                  id="st-vacation-note"
                  value={draft.vacationNote}
                  maxLength={VACATION_NOTE_LIMIT}
                  placeholder="Back on 12 October — orders placed now ship then."
                  onChange={(e) => patch({ vacationNote: e.target.value })}
                />
              </Field>
            )}
          </section>
        </div>

        <aside
          aria-label="Storefront preview"
          // 400px, where the mock says 380. The mock is drawn in Public Sans and
          // this app is not, so "STOREFRONT PREVIEW · amezo.com/stores/…" is 14px
          // wider here than there - at 380 the address truncated mid-host, which
          // reads as a bug rather than as a preview.
          className="sticky top-0 min-w-0 max-w-[400px] flex-[1_1_320px] overflow-hidden rounded-xl border"
        >
          <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3.5 py-2.5">
            <span className="shrink-0 text-xs font-bold tracking-[0.04em] whitespace-nowrap text-muted-foreground uppercase">
              Storefront preview
            </span>
            {/* Plain truncation. A handle long enough to overflow this strip is
                still readable in full in the Store URL field above, and reversing
                the direction to save the tail would let the bidi algorithm move
                the "…" placeholder to the wrong end. */}
            <span className="truncate text-xs text-muted-foreground">{previewUrl}</span>
          </div>

          <div className="relative flex h-[110px] items-center justify-center bg-muted">
            {profile.coverUrl ? (
              <img src={profile.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <span className="text-xs text-muted-foreground">No cover uploaded</span>
            )}
          </div>

          <div className="px-4 pb-4">
            {/* Overlapping the cover band by half its height, the way a storefront
                header does. */}
            <div className="relative -mt-[30px] flex size-[60px] items-center justify-center overflow-hidden rounded-full border-[3px] border-background bg-muted">
              {profile.logoUrl ? (
                <img src={profile.logoUrl} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <span className="text-[17px] font-bold text-muted-foreground">{initials}</span>
              )}
            </div>

            <h3 className="mt-2.5 text-[17px] font-bold tracking-[-0.01em] text-pretty">
              {draft.name.trim() || 'Untitled store'}
            </h3>
            <p className="mt-0.5 text-[13px] text-muted-foreground text-pretty">
              {draft.tagline.trim() || 'Add a tagline so shoppers know what you sell.'}
            </p>

            {/* The mock also prints a 4.8 rating and an "8 products" count here.
                Both are left out rather than invented: nothing on the server can
                answer either for the caller's own store - PublicStore carries
                averageRating and productCount, but GET /api/v1/stores/{handle}
                has no backend behind it. */}
            <p className="mt-2.5 text-xs text-muted-foreground">
              {trimmedYear ? `Selling since ${trimmedYear}` : 'New seller'}
            </p>

            {draft.onVacation && (
              <p className="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs font-semibold text-primary text-pretty">
                {draft.vacationNote.trim() || 'This store is not taking orders right now.'}
              </p>
            )}

            <p className="mt-3 text-[13px] leading-relaxed text-foreground/80 text-pretty">
              {draft.about.trim() || 'Your about text appears here.'}
            </p>

            <p className="mt-3 flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              {draft.location.trim() || 'Location not set'}
            </p>
          </div>
        </aside>
      </div>

      {/* The action bar. -mx-6/-mb-6 cancel the portal shell's gutter so it spans
          the content well and sits flush against its bottom edge, which is what
          lets it stay legible over the form scrolling underneath.

          -bottom-6, not bottom-0, and that is the fix for the bar covering the end
          of the form. A sticky element's offset is measured from the SCROLLPORT'S
          PADDING BOX, and the shell's well has 24px of bottom padding - so bottom-0
          stuck the bar 24px above the bottom of the well while -mb-6 put its resting
          place at the very bottom. The two disagreed by exactly that 24px, which the
          bar spent covering the last 24px of the form: at the end of the scroll the
          Visibility options were still clipped by it, with a dead 24px strip showing
          underneath. Offsetting the stuck position by the same 24px makes stuck and
          resting the same place, so the bar never moves and never covers anything at
          the end. Measured, not guessed - see the note on pb-6 above for the other
          half. */}
      <div className="sticky -bottom-6 -mx-6 -mb-6 mt-auto flex flex-wrap items-center justify-between gap-3 border-t bg-background px-6 py-3.5">
        <p className="text-[13px] text-muted-foreground">
          {missing.length > 0
            ? `Still needs ${missing.join(' and ')}.`
            : dirty
              ? 'Unsaved changes'
              : 'All changes saved'}
        </p>
        <div className="flex gap-2">
          {dirty && (
            <Button variant="outline" onClick={discard}>
              Discard
            </Button>
          )}
          <Button disabled={!canSave} onClick={save}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}
