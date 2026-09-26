import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'
import { findRefundRequest } from '@/test/msw/fixtures/refunds'
import { server } from '@/test/msw/server'

import { RefundDecisionPanel } from './RefundDecisionPanel'

/** ref-1 is a REQUESTED refund for $259.98; ref-2 a REQUESTED replacement. */
function renderPanel(refundRequestId = 'ref-1') {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <RefundDecisionPanel refundRequestId={refundRequestId} />
    </QueryClientProvider>,
  )
}

describe('RefundDecisionPanel', () => {
  it('shows one decision at a time, not the amount and the decline reason at once', async () => {
    renderPanel()

    // Approve is what a refund request opens on.
    expect(await screen.findByLabelText('Refund amount')).toBeInTheDocument()
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Explain it to the buyer')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Decline' }))

    expect(await screen.findByLabelText('Explain it to the buyer')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Reason' })).toBeInTheDocument()
    // The amount belongs to approving, and used to sit beside the reason.
    expect(screen.queryByLabelText('Refund amount')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Send replacement' }))

    expect(await screen.findByLabelText(/Message to the buyer/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Explain it to the buyer')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Refund amount')).not.toBeInTheDocument()
  })

  it('opens on what the buyer asked for', async () => {
    renderPanel('ref-2')

    // A replacement request opening on the refund amount asked the seller the
    // wrong question.
    expect(await screen.findByRole('tab', { name: 'Send replacement' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('fills the amount from the Full shortcut', async () => {
    renderPanel()

    const amount = await screen.findByLabelText('Refund amount')
    await userEvent.clear(amount)
    await userEvent.type(amount, '100')
    expect(amount).toHaveValue('100')
    expect(screen.getByText('Partial · $159.98 stays with you')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Full $259.98' }))

    expect(amount).toHaveValue('259.98')
    expect(screen.getByText('Full amount requested · $259.98')).toBeInTheDocument()
  })

  it('will not decline without an explanation for the buyer', async () => {
    renderPanel()
    await screen.findByLabelText('Refund amount')
    await userEvent.click(screen.getByRole('tab', { name: 'Decline' }))

    const decline = screen.getByRole('button', { name: 'Decline request' })
    expect(decline).toBeDisabled()

    await userEvent.type(await screen.findByLabelText('Explain it to the buyer'), 'no')
    expect(decline).toBeDisabled()

    await userEvent.type(
      screen.getByLabelText('Explain it to the buyer'),
      'ugh, the pads came back missing.',
    )
    expect(decline).toBeEnabled()

    await userEvent.click(decline)

    expect(await screen.findByText('Declined because')).toBeInTheDocument()
    expect(screen.getByText('Outside the 30-day return window')).toBeInTheDocument()
  })

  it('shows the seller where the buyer wants the money sent', async () => {
    renderPanel()

    // Collected from the buyer on the request form and then shown to nobody.
    expect(await screen.findByText('Original payment method')).toBeInTheDocument()
  })

  it('names the alternate payout the buyer picked', async () => {
    const request = findRefundRequest('ref-1')!
    server.use(
      http.get('http://localhost:8080/api/v1/refund-requests/ref-1', () =>
        HttpResponse.json({ ...request, payout: 'ALTERNATE_METHOD' }),
      ),
    )
    renderPanel()

    expect(
      await screen.findByText('Another method — support will collect details'),
    ).toBeInTheDocument()
  })

  it('sends a replacement through the approval the server insists on', async () => {
    renderPanel('ref-2')
    await screen.findByRole('tab', { name: 'Send replacement' })

    await userEvent.click(screen.getByRole('button', { name: 'Send replacement' }))

    // REQUESTED -> REPLACEMENT_SENT is not legal, so this is two writes; a
    // single one used to be the obvious thing to build, and it 409s.
    await waitFor(() =>
      expect(screen.getAllByText('Replacement sent').length).toBeGreaterThan(0),
    )
    expect(screen.queryByRole('tab', { name: 'Approve refund' })).not.toBeInTheDocument()
  })

  it('keeps the note against the step it was written on', async () => {
    renderPanel()

    await userEvent.type(
      await screen.findByLabelText(/Note to the buyer/),
      'The label is attached, post it back any time this week.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Approve and request return' }))

    // The note used to be accepted by the API and dropped, so the seller wrote
    // it for a buyer who was never going to see it.
    const entry = (await screen.findByText(/The label is attached/)).closest('li')!
    expect(within(entry).getByText('Approved')).toBeInTheDocument()
  })

  it('records a replacement request settled with money as a refund', async () => {
    renderPanel('ref-2')
    await screen.findByRole('tab', { name: 'Send replacement' })

    await userEvent.click(screen.getByRole('tab', { name: 'Approve refund' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Approve and request return' }))

    // Paying out a request the buyer raised for a replacement used to leave it
    // on the replacement path, where the money could never be released.
    expect(await screen.findByText('Approved · waiting on the return')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark return received' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark replacement sent' })).not.toBeInTheDocument()
  })

  it('offers only the legal move once a request is approved', async () => {
    renderPanel('ref-3')

    expect(await screen.findByText('Approved · waiting on the return')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark return received' })).toBeInTheDocument()
    // The design offers "Undo approval" here. No transition walks an approved
    // request back, so the button is absent rather than broken.
    expect(screen.queryByRole('button', { name: /Undo/ })).not.toBeInTheDocument()
  })
})
