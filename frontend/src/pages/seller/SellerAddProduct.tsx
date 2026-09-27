import { useNavigate } from 'react-router'

import { ProductFormPage } from '@/features/seller-portal/components/ProductFormPage'
import { useProductForm } from '@/features/seller-portal/components/useProductForm'

/**
 * The standalone "add a product" route - what the add drawer's "Full page"
 * opens, and a URL a seller can go straight to.
 *
 * The same controller and the same fields the drawer uses; this file is the
 * page chrome around them and nothing else.
 */
export function SellerAddProduct() {
  const navigate = useNavigate()

  const controller = useProductForm({
    mode: 'add',
    onCreated: ({ id }, imageFailures) => {
      // The product exists either way - only the pictures can fail after it. So
      // a listing whose images did not all upload goes to its own edit page,
      // carrying what failed, rather than back to a list that would say nothing
      // about it.
      if (imageFailures.length > 0) {
        navigate(`/seller/products/${id}`, { state: { imageFailures } })
        return
      }
      navigate('/seller/products')
    },
  })

  return (
    <ProductFormPage
      controller={controller}
      heading="Add product"
      meta="Publishes to your store."
      onCancel={() => navigate('/seller/products')}
    />
  )
}
