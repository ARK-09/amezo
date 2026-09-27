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
    // The button names the amount it is about to approve, as the design does
    // ("Approve $259.98 and send return label"), so a half-typed partial cannot be
    // committed without the seller reading it back.
    await userEvent.click(screen.getByRole('button', { name: /Approve \$259\.98/ }))

    // The note used to be accepted by the API and dropped, so the seller wrote
    // it for a buyer who was never going to see it.
    const entry = (await screen.findByText(/The label is attached/)).closest('li')!
    // Against AWAITING_RETURN, not APPROVED: approving a refund asks for the item
    // back, so that is the step the note was written on.
    expect(within(entry).getByText('Awaiting return')).toBeInTheDocument()
  })

  it('records a replacement request settled with money as a refund', async () => {
    renderPanel('ref-2')
    await screen.findByRole('tab', { name: 'Send replacement' })

    await userEvent.click(screen.getByRole('tab', { name: 'Approve refund' }))
    await userEvent.click(await screen.findByRole('button', { name: /Approve \$298\.00/ }))

    // Paying out a request the buyer raised for a replacement used to leave it
    // on the replacement path, where the money could never be released.
    expect(await screen.findByText('Approved · waiting on the return')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark return received' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark replacement sent' })).not.toBeInTheDocument()
  })

  it('offers the legal move and the undo once a request is approved', async () => {
    renderPanel('ref-3')

    expect(await screen.findByText('Approved · waiting on the return')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark return received' })).toBeInTheDocument()
    // The design puts "Undo approval" here, and the refund state machine now has
    // that transition: an approval is a promise about money, occasionally made
    // against the wrong request, and the alternative was a seller releasing one
    // they never meant to approve.
    expect(screen.getByRole('button', { name: 'Undo approval' })).toBeInTheDocument()
  })

  it('walks an approval back to the decision it came from', async () => {
    renderPanel('ref-3')
    await screen.findByText('Approved · waiting on the return')

    await userEvent.click(screen.getByRole('button', { name: 'Undo approval' }))

    // Back to a request waiting on a decision, with the three-way choice offered
    // again - and the amount the approval set is gone rather than surviving a
    // decision that was withdrawn.
    expect(await screen.findByRole('tab', { name: 'Approve refund' })).toBeInTheDocument()
    expect(screen.queryByText('Approved · waiting on the return')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo approval' })).not.toBeInTheDocument()
  })

  it('will not offer the undo once the return has arrived', async () => {
    const request = findRefundRequest('ref-3')!
    server.use(
      http.get('http://localhost:8080/api/v1/refund-requests/ref-3', () =>
        HttpResponse.json({ ...request, status: 'RETURN_RECEIVED' }),
      ),
    )
    renderPanel('ref-3')

    // Once the buyer has posted the item back, unwinding the approval would
    // strand it - so the server refuses it and the button is not drawn.
    expect(await screen.findByRole('button', { name: 'Release the refund' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo approval' })).not.toBeInTheDocument()
  })
})
