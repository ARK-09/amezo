import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import {
  ProductCreateFields,
  StatusSegmented,
} from '@/features/seller-portal/components/ProductCreateForm'
import { useProductCreateForm } from '@/features/seller-portal/components/useProductCreateForm'

/**
 * The standalone "add a product" route.
 *
 * It used to hold its own copy of the whole form. The products list now opens
 * the same form in a drawer, so both render ProductCreateFields from one
 * useProductCreateForm - this page is the page chrome around it and nothing
 * else. The route stays because it is linkable and because the drawer's
 * expanded state is not a URL.
 */
export function SellerAddProduct() {
  const navigate = useNavigate()
  const form = useProductCreateForm({ onCreated: () => navigate('/seller/products') })

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Add product</h1>
        <StatusSegmented value={form.status} onChange={form.setStatus} />
      </div>

      <ProductCreateFields form={form} />

      {/* One save, gated on the form being complete AND changed - the same
          boundary the drawer's footer uses, from the same state. */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-[13px] text-muted-foreground">{form.footerNote}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/seller/products')}>
            Cancel
          </Button>
          <Button type="button" disabled={!form.canSave} onClick={() => void form.submit()}>
            {form.isPending ? 'Saving…' : form.saveLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
