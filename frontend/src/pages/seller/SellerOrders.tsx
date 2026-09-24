import { useState } from 'react'
import { useNavigate } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { type OrderStatus, useSellerOrders } from '@/features/seller-portal/api/useSellerOrders'
import { formatPrice } from '@/lib/formatPrice'

const STATUS_OPTIONS: { value: OrderStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'PLACED', label: 'Placed' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'DELIVERED', label: 'Delivered' },
]

export function SellerOrders() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const query = useSellerOrders(statusFilter === 'all' ? undefined : statusFilter)

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Orders</h1>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as OrderStatus | 'all')}>
          <SelectTrigger aria-label="Filter by status" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {query.isError && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-medium">Couldn't load orders</p>
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {query.isSuccess && query.data.content.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-medium">No orders yet</p>
        </div>
      )}

      {query.isSuccess && query.data.content.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead>Placed</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.content.map((order) => (
              <TableRow
                key={order.id}
                className="cursor-pointer"
                onClick={() => navigate(`/seller/orders/${order.id}`)}
              >
                <TableCell className="font-mono text-xs">{order.id.slice(0, 8)}</TableCell>
                <TableCell>{order.buyerEmail}</TableCell>
                <TableCell>{new Date(order.placedAt).toLocaleDateString()}</TableCell>
                <TableCell>{formatPrice(order.total)}</TableCell>
                <TableCell>
                  <Badge variant={order.status === 'PLACED' ? 'primary' : 'default'}>{order.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
