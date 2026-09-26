import { Check, Store } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { BrandingSection } from '@/features/store-settings/components/BrandingSection'
import {
  useMyStore,
  useUpdateMyStore,
  type StoreProfile,
} from '@/features/store-settings/api/useStoreProfile'

/** The design's own limit. */
const ABOUT_LIMIT = 600

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

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
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
      <div className="flex max-w-[720px] flex-col gap-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // Number('19a9') is NaN, which serialises to null against an integer field.
  const foundedYearValue = /^\d{4}$/.test(draft.foundedYear.trim())
    ? Number(draft.foundedYear.trim())
    : null
  const foundedYearOk = !draft.foundedYear.trim() || foundedYearValue !== null

  const emailOk =
    !draft.supportEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.supportEmail.trim())
  const missing: string[] = []
  if (!draft.name.trim()) missing.push('a store name')
  const handleValue = normaliseHandle(draft.handle)
  if (!HANDLE_PATTERN.test(handleValue)) {
    missing.push(draft.handle.trim() ? 'a store URL of at least two characters' : 'a store URL')
  }
  if (!emailOk) missing.push('a valid support email')
  if (!foundedYearOk) missing.push('a four-digit year')
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
      foundedYear: foundedYearValue ?? undefined,
      supportEmail: draft.supportEmail.trim(),
      about: draft.about.trim(),
      status: draft.onVacation ? 'VACATION' : 'OPEN',
      vacationNote: draft.vacationNote.trim(),
    })
  }

  const handleError = update.error?.errors?.find((entry) => entry.field === 'handle')

  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">Store settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How your storefront reads to buyers.
        </p>
      </div>

      {update.isSuccess && !dirty && (
        <p
          role="status"
          className="inline-flex items-center gap-2 rounded-md border border-[#16794c]/30 bg-[#16794c]/5 px-3 py-2 text-sm text-[#16794c]"
        >
          <Check className="size-4" aria-hidden />
          Saved
        </p>
      )}

      {/* Branding sits outside the draft: an upload is live the moment it is
          confirmed, so there is nothing for Save changes to carry. */}
      <BrandingSection profile={profile} storeName={draft.name} />

      <section className="rounded-xl border p-6">
        <h2 className="text-[15px] font-bold">Identity</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id="st-name" label="Store name">
            <Input
              id="st-name"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          {/* The previewed URL is the normalised one, so it matches what save sends. */}
          <Field id="st-handle" label="Store URL" hint={`amezo.com/stores/${handleValue || '…'}`}>
            <Input
              id="st-handle"
              value={draft.handle}
              onChange={(e) => patch({ handle: slugify(e.target.value) })}
              aria-invalid={Boolean(handleError)}
            />
          </Field>
          <Field id="st-tagline" label="Tagline" hint="One line, shown under your store name.">
            <Input
              id="st-tagline"
              value={draft.tagline}
              onChange={(e) => patch({ tagline: e.target.value })}
            />
          </Field>
          <Field id="st-location" label="Location">
            <Input
              id="st-location"
              value={draft.location}
              onChange={(e) => patch({ location: e.target.value })}
            />
          </Field>
          <Field id="st-founded" label="Founded">
            <Input
              id="st-founded"
              inputMode="numeric"
              value={draft.foundedYear}
              onChange={(e) => patch({ foundedYear: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            />
          </Field>
          <Field id="st-email" label="Support email">
            <Input
              id="st-email"
              type="email"
              value={draft.supportEmail}
              onChange={(e) => patch({ supportEmail: e.target.value })}
              aria-invalid={!emailOk}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field
            id="st-about"
            label="About"
            hint={`${draft.about.length}/${ABOUT_LIMIT} characters`}
          >
            <Textarea
              id="st-about"
              rows={5}
              maxLength={ABOUT_LIMIT}
              value={draft.about}
              onChange={(e) => patch({ about: e.target.value })}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border p-6">
        <h2 className="text-[15px] font-bold">Availability</h2>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="st-vacation" className="text-sm font-medium">
              Vacation mode
            </Label>
            <p className="mt-1 text-[13px] text-muted-foreground text-pretty">
              Your listings stay visible, with a note telling buyers when you are back.
            </p>
          </div>
          <Switch
            id="st-vacation"
            checked={draft.onVacation}
            onCheckedChange={(next) => patch({ onVacation: next })}
          />
        </div>

        {draft.onVacation && (
          <div className="mt-4">
            <Field id="st-vacation-note" label="Note to buyers">
              <Input
                id="st-vacation-note"
                value={draft.vacationNote}
                onChange={(e) => patch({ vacationNote: e.target.value })}
                placeholder="Back on 12 October — orders placed now ship then."
              />
            </Field>
          </div>
        )}
      </section>

      <section className="rounded-xl border p-6" aria-labelledby="st-preview">
        <h2 id="st-preview" className="text-[15px] font-bold">
          Preview
        </h2>
        <Separator className="my-4" />
        {/* The band only appears once there is a cover, so a store without one
            previews exactly as it did before. */}
        {profile.coverUrl && (
          <div className="mb-4 h-[110px] overflow-hidden rounded-lg bg-muted">
            <img src={profile.coverUrl} alt="" className="size-full object-cover" />
          </div>
        )}
        <div className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
            {profile.logoUrl ? (
              <img src={profile.logoUrl} alt="" className="size-full object-cover" />
            ) : (
              <Store className="size-6 text-muted-foreground" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{draft.name || 'Your store'}</p>
            {draft.tagline && (
              <p className="truncate text-[13px] text-muted-foreground">{draft.tagline}</p>
            )}
            <p className="truncate text-xs text-muted-foreground">
              {[draft.location, draft.foundedYear && `since ${draft.foundedYear}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!canSave} onClick={save}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
        <p className="text-xs text-muted-foreground">
          {missing.length > 0
            ? `Still need ${missing.join(' and ')}`
            : dirty
              ? 'Unsaved changes'
              : 'Everything is saved'}
        </p>
      </div>

      {update.isError && (
        <p className="text-sm text-destructive" role="alert">
          {handleError
            ? `That store URL is ${handleError.reason}.`
            : (update.error?.detail ?? "We couldn't save your store.")}
        </p>
      )}
    </div>
  )
}
