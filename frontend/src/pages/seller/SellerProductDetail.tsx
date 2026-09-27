import { useLocation, useNavigate, useParams } from 'react-router'

import { ProductFormPage } from '@/features/seller-portal/components/ProductFormPage'
import { useProductForm } from '@/features/seller-portal/components/useProductForm'

/**
 * The dedicated page for one of the seller's own products - the route the
 * drawer's "Full page" opens in a new tab, and a URL that can be bookmarked or
 * shared.
 *
 * It renders the same form the drawer does, from the same controller, so the
 * two cannot drift. All this file decides is where Save and Cancel go
 * afterwards: back to the list, which is where the page was reached from.
 */
export function SellerProductDetail() {
  const { productId = '' } = useParams()
  const navigate = useNavigate()
  // Handed over by the add page when a listing was created but some of its
  // images were not. Nothing else writes it, and an unknown shape is ignored.
  const carried = useLocation().state as { imageFailures?: unknown } | null
  const notices = Array.isArray(carried?.imageFailures)
    ? carried.imageFailures.filter((entry): entry is string => typeof entry === 'string')
    : []

  const controller = useProductForm({
    mode: 'edit',
    productId,
    onSaved: () => navigate('/seller/products'),
  })

  return (
    <ProductFormPage
      controller={controller}
      heading="Edit product"
      // The SAVED name and category, not the ones being typed: this line says
      // which listing is open, and a heading that changed as the title was
      // edited would stop answering that.
      meta={
        controller.product
          ? `${controller.product.title} · ${controller.product.category.name}`
          : undefined
      }
      onCancel={() => navigate('/seller/products')}
      notices={notices}
    />
  )
}
