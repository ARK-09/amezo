import { Check, Store } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
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

/** Lowercase, dashes, no leading dash - the same shape the server enforces. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-/, '')
}

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

  // Re-seed whenever the saved profile changes, so a successful save becomes
  // the new baseline and the form stops reading as dirty.
  useEffect(() => {
    if (query.data) setDraft(draftFrom(query.data))
  }, [query.data])

  const baseline = useMemo(() => (query.data ? draftFrom(query.data) : null), [query.data])
  const dirty = Boolean(draft && baseline && JSON.stringify(draft) !== JSON.stringify(baseline))

  if (query.isLoading || !draft) {
    return (
      <div className="flex max-w-[720px] flex-col gap-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

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

  const emailOk =
    !draft.supportEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.supportEmail.trim())
  const missing: string[] = []
  if (!draft.name.trim()) missing.push('a store name')
  if (!draft.handle.trim()) missing.push('a store URL')
  if (!emailOk) missing.push('a valid support email')
  const canSave = dirty && missing.length === 0 && !update.isPending

  function patch(next: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...next } : current))
  }

  function save() {
    if (!canSave || !draft) return
    update.mutate({
      name: draft.name.trim(),
      handle: draft.handle.trim(),
      tagline: draft.tagline.trim(),
      location: draft.location.trim(),
      foundedYear: draft.foundedYear ? Number(draft.foundedYear) : undefined,
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
          <Field id="st-handle" label="Store URL" hint={`amezo.com/stores/${draft.handle || '…'}`}>
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
              onChange={(e) => patch({ foundedYear: e.target.value })}
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

      <section className="rounded-xl border p-6">
        <h2 className="text-[15px] font-bold">Preview</h2>
        <Separator className="my-4" />
        <div className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border bg-muted">
            <Store className="size-6 text-muted-foreground" aria-hidden />
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
