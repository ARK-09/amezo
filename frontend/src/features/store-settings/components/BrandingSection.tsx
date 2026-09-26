import { ImageIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type ProblemDetail } from '@/lib/api/client'
import { apiErrorMessage } from '@/lib/api/transient'

import { useRemoveStoreImage, useUploadStoreImage, type StoreImageSlot } from '../api/useStoreImages'
import { type StoreProfile } from '../api/useStoreProfile'
import { ACCEPTED_IMAGE_ACCEPT, initialsFrom, rejectionFor } from '../branding'

function errorText(error: ProblemDetail | Error | null): string | undefined {
  if (!error) return undefined
  // A ProblemDetail from the API; a plain Error from the direct-to-storage PUT,
  // which carries its own message and has no field apiErrorMessage could read.
  return 'title' in error ? apiErrorMessage(error) : error.message
}

/**
 * Cover and logo. Both apply the moment they land rather than waiting for Save:
 * an upload is only live once confirm runs, so the confirmed profile IS the
 * saved state - there is nothing left for the save button to send.
 */
export function BrandingSection({
  profile,
  storeName,
}: {
  profile: StoreProfile
  storeName: string
}) {
  const upload = useUploadStoreImage()
  const remove = useRemoveStoreImage()
  const [refused, setRefused] = useState<string | null>(null)
  // The server stores a URL, not a filename, so the meta line remembers the one
  // the seller just picked - and falls back to the generic label otherwise.
  const [coverName, setCoverName] = useState<string | null>(null)

  const busy = upload.isPending || remove.isPending
  const uploadingSlot = upload.isPending ? upload.variables.slot : null

  function pick(slot: StoreImageSlot, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Cleared so that re-picking the same file after a rejection still fires a change.
    event.target.value = ''
    if (!file) return

    // Type and size are checked here so a 20 MB photo never leaves the browser.
    const rejection = rejectionFor(file)
    setRefused(rejection)
    if (rejection) return

    remove.reset()
    upload.mutate(
      { slot, file },
      {
        onSuccess: () => {
          if (slot === 'COVER') setCoverName(file.name)
        },
      },
    )
  }

  function drop(slot: StoreImageSlot) {
    setRefused(null)
    upload.reset()
    remove.mutate(slot)
  }

  const failure = refused ?? errorText(upload.error) ?? errorText(remove.error)

  const coverMeta =
    uploadingSlot === 'COVER'
      ? 'Uploading…'
      : profile.coverUrl
        ? `${coverName ?? 'Cover image'} · shown at the top of your store page`
        : 'No cover yet — shoppers see a plain band above your logo.'

  return (
    <section className="rounded-xl border p-6">
      <h2 className="text-[15px] font-bold">Branding</h2>
      <p className="mt-1 text-[13px] text-muted-foreground text-pretty">
        Cover and logo appear at the top of your store page and next to every product listing.
      </p>

      <div className="mt-4 flex flex-col gap-1.5">
        <Label htmlFor="st-cover">Cover image</Label>
        <div className="relative flex h-[150px] items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/40">
          {profile.coverUrl ? (
            <img
              src={profile.coverUrl}
              alt="Store cover"
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5 px-4 text-center text-muted-foreground">
              <ImageIcon className="size-[22px]" aria-hidden />
              <p className="text-[13px] font-semibold text-foreground">
                Drop an image or click to upload
              </p>
              <p className="text-xs">1600 × 400 or wider · JPG or PNG · up to 5 MB</p>
            </div>
          )}
          <Input
            id="st-cover"
            type="file"
            accept={ACCEPTED_IMAGE_ACCEPT}
            aria-label="Upload cover image"
            disabled={busy}
            onChange={(e) => pick('COVER', e)}
            className="absolute inset-0 size-full cursor-pointer rounded-none border-0 p-0 opacity-0"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-xs text-muted-foreground">{coverMeta}</p>
          {profile.coverUrl && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => drop('COVER')}>
              Remove cover
            </Button>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-start gap-4 border-t pt-5">
        <div className="relative flex size-[88px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-dashed bg-muted/40">
          {profile.logoUrl ? (
            <img
              src={profile.logoUrl}
              alt="Brand logo"
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <span className="text-[22px] font-bold text-muted-foreground">
              {initialsFrom(storeName)}
            </span>
          )}
          <Input
            id="st-logo"
            type="file"
            accept={ACCEPTED_IMAGE_ACCEPT}
            aria-label="Upload brand logo"
            disabled={busy}
            onChange={(e) => pick('LOGO', e)}
            className="absolute inset-0 size-full cursor-pointer rounded-none border-0 p-0 opacity-0"
          />
        </div>
        <div className="min-w-0 flex-1 basis-[220px]">
          <Label htmlFor="st-logo">Brand logo</Label>
          <p className="mt-1 text-xs text-muted-foreground text-pretty">
            {uploadingSlot === 'LOGO'
              ? 'Uploading…'
              : 'Square, at least 512 × 512. Shown as a circle, so keep the mark centred.'}
          </p>
          {profile.logoUrl && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2.5"
              disabled={busy}
              onClick={() => drop('LOGO')}
            >
              Remove logo
            </Button>
          )}
        </div>
      </div>

      {failure && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {failure}
        </p>
      )}
    </section>
  )
}
