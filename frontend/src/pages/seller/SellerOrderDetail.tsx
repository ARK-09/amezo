import { type FormEvent, useState } from 'react'
import { useParams } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useSellerOrderDetail, useShipOrder } from '@/features/seller-portal/api/useSellerOrders'
import { formatPrice } from '@/lib/formatPrice'

export function SellerOrderDetail() {
  const { orderId } = useParams<{ orderId: string }>()
  const query = useSellerOrderDetail(orderId!)
  const { mutate: ship, isPending, isError } = useShipOrder(orderId!)
  const [trackingNumber, setTrackingNumber] = useState('')

  function submitShip(e: FormEvent) {
    e.preventDefault()
    ship(trackingNumber)
  }

  if (query.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>
  }

  if (query.isError || !query.data) {
    return (
      <div className="flex flex-col items-center gap-3 p-16 text-center">
        <p className="font-medium">Couldn't load this order</p>
        <Button variant="outline" onClick={() => query.refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  const order = query.data

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">Order {order.id.slice(0, 8)}</h1>
          <p className="text-sm text-muted-foreground">{order.buyerEmail}</p>
          <p className="text-sm text-muted-foreground">
            Placed {new Date(order.placedAt).toLocaleString()}
          </p>
        </div>
        <Badge variant={order.status === 'PLACED' ? 'primary' : 'default'}>{order.status}</Badge>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Variant</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead className="text-right">Unit price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {order.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>{line.productTitle}</TableCell>
              <TableCell>{line.variantLabel}</TableCell>
              <TableCell>{line.quantity}</TableCell>
              <TableCell className="text-right">{formatPrice(line.unitPrice)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-3 flex justify-end text-sm font-semibold">
        <span>Total: {formatPrice(order.total)}</span>
      </div>

      {order.status === 'PLACED' ? (
        <form onSubmit={submitShip} className="mt-6 flex flex-col gap-3 rounded-xl border p-5">
          <p className="text-sm font-bold">Mark as shipped</p>
          <div>
            <label htmlFor="trackingNumber" className="mb-1.5 block text-sm font-medium">
              Tracking number
            </label>
            <Input
              id="trackingNumber"
              required
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
            />
          </div>
          {isError && <p className="text-sm text-destructive">Could not mark this order as shipped.</p>}
          <Button type="submit" disabled={isPending} className="w-fit">
            {isPending ? 'Saving…' : 'Mark as shipped'}
          </Button>
        </form>
      ) : (
        order.trackingNumber && (
          <div className="mt-6 rounded-xl border p-5 text-sm">
            <p className="font-bold">Shipped</p>
            <p className="text-muted-foreground">Tracking: {order.trackingNumber}</p>
            {order.shippedAt && (
              <p className="text-muted-foreground">{new Date(order.shippedAt).toLocaleString()}</p>
            )}
          </div>
        )
      )}
    </div>
  )
}
