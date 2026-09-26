import { useState } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useMessageStore } from '@/features/store/api/useStorefront'

/** Mirrors the contract's minLength, so a reject is caught before the round trip. */
const MIN_BODY = 10
const MAX_BODY = 2000
const MAX_SUBJECT = 120

/**
 * The design's "Message" button. It opens a composer rather than doing nothing:
 * POST /api/v1/stores/{handle}/messages accepts the question for delivery, and
 * where the seller reads it is the platform's business, not the buyer's.
 */
export function MessageStoreDialog({
  handle,
  storeName,
  signedIn,
}: {
  handle: string | undefined
  storeName: string
  /** The seller replies to the caller's account address, so there has to be one. */
  signedIn: boolean
}) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const send = useMessageStore(handle)

  const trimmed = body.trim()
  const canSend = trimmed.length >= MIN_BODY && trimmed.length <= MAX_BODY && !send.isPending

  function close(next: boolean) {
    setOpen(next)
    // A closed composer keeps nothing: reopening it to a stale draft and a stale
    // error reads as though the last message failed to send.
    if (!next) {
      setSubject('')
      setBody('')
      send.reset()
    }
  }

  if (!signedIn) {
    return (
      <Button variant="outline" className="h-10 rounded-full px-[18px]" asChild>
        <Link to="/sign-in">Message</Link>
      </Button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-10 rounded-full px-[18px]">
          Message
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Message {storeName}</DialogTitle>
          <DialogDescription>
            The seller replies by email. Do not include payment details.
          </DialogDescription>
        </DialogHeader>

        {send.isSuccess ? (
          <p className="text-sm" role="status">
            Sent. {storeName} will reply to the address on your account.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="msg-subject">
                Subject <span className="text-muted-foreground">Optional</span>
              </Label>
              <Input
                id="msg-subject"
                value={subject}
                maxLength={MAX_SUBJECT}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="msg-body">Message</Label>
              <Textarea
                id="msg-body"
                value={body}
                rows={5}
                maxLength={MAX_BODY}
                onChange={(e) => setBody(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {trimmed.length < MIN_BODY
                  ? `At least ${MIN_BODY} characters.`
                  : `${trimmed.length} of ${MAX_BODY} characters.`}
              </p>
            </div>
            {send.isError && (
              <p className="text-sm text-destructive" role="alert">
                {send.error?.detail ?? "That message couldn't be sent."}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {send.isSuccess ? (
            <DialogClose asChild>
              <Button>Done</Button>
            </DialogClose>
          ) : (
            <>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                disabled={!canSend}
                onClick={() =>
                  send.mutate({ subject: subject.trim() || undefined, body: trimmed })
                }
              >
                {send.isPending ? 'Sending…' : 'Send message'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
