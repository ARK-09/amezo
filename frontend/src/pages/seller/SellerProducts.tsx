import { ImageOff, Trash2 } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDeleteProduct, useSellerProducts } from '@/features/seller-portal/api/useSellerProducts'

export function SellerProducts() {
  const query = useSellerProducts()
  const { mutate: deleteProduct, isPending: isDeleting } = useDeleteProduct()

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Products</h1>
        <Button asChild>
          <Link to="/seller/products/new">Add product</Link>
        </Button>
      </div>

      {query.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {query.isError && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-medium">Couldn't load products</p>
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {query.isSuccess && query.data.content.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-medium">No products yet</p>
          <p className="text-sm text-muted-foreground">Add your first product to get started.</p>
        </div>
      )}

      {query.isSuccess && query.data.content.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Image</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Variants</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.content.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  <div className="flex size-10 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {product.thumbnailUrl ? (
                      <img src={product.thumbnailUrl} alt={product.title} className="size-full object-cover" />
                    ) : (
                      <ImageOff className="size-4 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    to={`/seller/products/${product.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {product.title}
                  </Link>
                </TableCell>
                <TableCell>{product.category.name}</TableCell>
                <TableCell>{product.variantCount}</TableCell>
                <TableCell>{new Date(product.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${product.title}`}
                    disabled={isDeleting}
                    onClick={() => deleteProduct(product.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
