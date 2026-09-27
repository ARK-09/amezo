import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import {
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
  type UseFormReturn,
} from 'react-hook-form'

import {
  useAddVariant,
  useCreateProduct,
  useDeleteImage,
  useDeleteVariant,
  useReorderImages,
  useSellerProduct,
  useUpdateProduct,
  useUpdateVariant,
  uploadProductImage,
  type SellerProductDetail,
} from '@/features/seller-portal/api/useSellerProducts'
import {
  MAX_IMAGES,
  blankFormValues,
  footerNoteFor,
  formSignature,
  missingFields,
  parsePrice,
  parseStock,
  productFormSchema,
  toFormValues,
  type FormImage,
  type ProductFormValues,
  type WritableStatus,
} from '@/features/seller-portal/components/productForm'
import { errorSentence, mapProblem } from '@/features/seller-portal/components/productFormErrors'
import type { ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

type UpdateProductRequest = components['schemas']['UpdateProductRequest']
type UpdateVariantRequest = components['schemas']['UpdateVariantRequest']

/**
 * One product form, one Save.
 *
 * The form used to be three forms stacked on top of each other - the product's
 * own fields, each variant row, and the image gallery - each with its own save
 * button, because each is a different endpoint. That is the API's shape, not
 * the seller's: the design has one footer button that either commits the whole
 * listing or explains what it could not.
 *
 * ## Why the sequence is explicit rather than a transaction
 *
 * There is no endpoint that takes a product, its variants and its images
 * together, and inventing one on the client by firing them in parallel would
 * make the failure modes worse, not better - the variant cap, the image cap and
 * the SKU uniqueness check are all evaluated per request on the server. So Save
 * runs them in a fixed order, and every step's failure is caught, mapped onto
 * the field that caused it and reported, while the steps that do not depend on
 * it still run.
 *
 * The order matters: variants are CREATED before old ones are DELETED, so
 * replacing a product's only variant is possible at all (the API refuses to
 * delete the last one), and the image ordering is written LAST, once the set of
 * images is settled.
 *
 * ## Why a partial failure does not reset the form
 *
 * After the sequence the product is refetched, and that becomes the baseline
 * the form is diffed against. Whatever saved now matches the server and reads
 * clean; whatever failed still differs and is still dirty, so pressing Save
 * again retries exactly the parts that did not land. Rows that were created and
 * images that were uploaded have their new ids written back into the form
 * first, so a retry updates them instead of making a second copy.
 */

export type ProductFormMode = 'add' | 'edit'

export interface ProductFormController {
  mode: ProductFormMode
  form: UseFormReturn<ProductFormValues>
  values: ProductFormValues
  /** The saved product, in edit mode, once it has loaded. */
  product: SellerProductDetail | undefined
  isLoading: boolean
  loadError: ProblemDetail | null
  reloadProduct: () => void

  variantFields: { id: string }[]
  addVariant: () => void
  duplicateVariant: (index: number) => void
  removeVariant: (index: number) => void

  status: WritableStatus
  setStatus: (value: WritableStatus) => void

  images: FormImage[]
  addImages: (files: FileList | File[] | null) => void
  removeImage: (index: number) => void
  moveImage: (index: number, direction: -1 | 1) => void
  /** Files that were dropped because the product is already at its image cap. */
  skippedImages: number

  dirty: boolean
  canSave: boolean
  footerNote: string
  saveLabel: string
  isSaving: boolean
  /** Whatever the API refused that could not be pinned to a single field. */
  failures: string[]
  submit: () => void
}

interface AddOptions {
  mode: 'add'
  /**
   * @param imageFailures files the product was created without. The product
   * itself exists by then, so this is not a rollback - the caller decides where
   * to send the seller to finish the job.
   */
  onCreated: (product: { id: string; title: string }, imageFailures: string[]) => void
}

interface EditOptions {
  mode: 'edit'
  productId: string
  onSaved: (title: string) => void
}

export function useProductForm(options: AddOptions | EditOptions): ProductFormController {
  const mode = options.mode
  const productId = options.mode === 'edit' ? options.productId : ''
  const onCreated = options.mode === 'add' ? options.onCreated : NO_CREATE
  const onSaved = options.mode === 'edit' ? options.onSaved : NO_SAVE

  const query = useSellerProduct(productId)
  const product = mode === 'edit' ? query.data : undefined

  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct(productId)
  const addVariantMutation = useAddVariant(productId)
  const updateVariant = useUpdateVariant(productId)
  const deleteVariant = useDeleteVariant(productId)
  const deleteImage = useDeleteImage(productId)
  const reorderImages = useReorderImages(productId)

  const [failures, setFailures] = useState<string[]>([])
  const [skippedImages, setSkippedImages] = useState(0)
  const [isSaving, setIsSaving] = useState(false)

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: blankFormValues(),
    // The saved product, fed in reactively rather than copied in from an
    // effect. react-hook-form deep-compares it, so a background refetch that
    // changed nothing resets nothing, and keepDirtyValues means one that DID
    // change still cannot overwrite a field being typed.
    //
    // Held still while a save is running. Each step of the sequence writes to
    // the same cache this reads, so without the pause the form would be
    // re-seeded between two requests of its own save - variants shuffling under
    // the cursor as the server appends the one that was just created.
    values: product && !isSaving ? toFormValues(product) : undefined,
    // keepErrors, because the re-seed that follows a save would otherwise wipe
    // the field errors the save just mapped off a 422 - the seller would be
    // told the listing was refused with nothing saying where.
    resetOptions: { keepDirtyValues: true, keepErrors: true },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })

  const { control, setValue, setError, reset, handleSubmit } = form
  const variantArray = useFieldArray({ control, name: 'variants' })
  // useWatch rather than form.watch(): the same live values, but subscribed
  // through a hook the React compiler can reason about.
  const values = useWatch({ control, defaultValue: form.getValues() }) as ProductFormValues
  const images = values.images ?? []

  // What the server has, as one string. Memoised on the product itself so a
  // keystroke re-signs only the form, not the saved listing as well.
  const baseline = useMemo(
    () => formSignature(product ? toFormValues(product) : blankFormValues()),
    [product],
  )
  const dirty = formSignature(values) !== baseline
  const missing = missingFields(values)
  const canSave = missing.length === 0 && dirty && !isSaving
  const saveLabel = mode === 'edit' ? 'Save changes' : 'Publish product'

  function addVariant() {
    variantArray.append({ label: '', sku: '', price: '', stockQty: '' })
  }

  /**
   * A copy of the row as it reads now, not as it was last saved - the seller is
   * looking at these numbers when they ask for another one like it. SKUs are
   * unique per product, so the copy gets the design's -COPY suffix to edit, and
   * no id, which is what makes it a new row rather than a second editor for the
   * same one.
   */
  function duplicateVariant(index: number) {
    const source = form.getValues(`variants.${index}`)
    variantArray.insert(index + 1, {
      label: source.label,
      sku: source.sku ? `${source.sku}-COPY` : '',
      price: source.price,
      stockQty: source.stockQty,
    })
  }

  function removeVariant(index: number) {
    // A product needs one variant to have a price at all.
    if (variantArray.fields.length <= 1) return
    variantArray.remove(index)
  }

  function addImages(files: FileList | File[] | null) {
    if (!files) return
    const picked = Array.from(files)
    if (picked.length === 0) return
    const current = form.getValues('images')
    // Clamped here as well as on the server, which counts reserved rows toward
    // the cap exactly as this does. Without the clamp the extra files would
    // each presign, get a 409, and read as five failures instead of one clear
    // "that is more than the product can hold".
    const room = Math.max(0, MAX_IMAGES - current.length)
    const taken = picked.slice(0, room)
    setSkippedImages(picked.length - taken.length)
    if (taken.length === 0) return
    setValue(
      'images',
      [
        ...current,
        ...taken.map((file) => ({
          kind: 'staged' as const,
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ],
      { shouldValidate: true },
    )
  }

  function removeImage(index: number) {
    const current = form.getValues('images')
    setValue(
      'images',
      current.filter((_, i) => i !== index),
      { shouldValidate: true },
    )
  }

  function moveImage(index: number, direction: -1 | 1) {
    const current = form.getValues('images')
    const target = index + direction
    if (target < 0 || target >= current.length) return
    const next = [...current]
    ;[next[index], next[target]] = [next[target], next[index]]
    setValue('images', next, { shouldValidate: true })
  }

  /**
   * One refused request, turned into as many field errors as it names and at
   * most one line of prose. `what` is the part of the listing that failed, so a
   * seller reading the footer knows which half of the save is still outstanding.
   */
  function record(what: string, error: unknown, variantIndex?: number): string {
    if (isProblem(error)) {
      const mapped = mapProblem(error, { variantIndex })
      for (const field of mapped.fields) {
        setError(field.path as FieldPath<ProductFormValues>, {
          type: 'server',
          message: field.message,
        })
      }
      if (mapped.message) return `${what}: ${mapped.message}`
      return `${what}: check the highlighted fields.`
    }
    return `${what}: ${errorSentence(error)}`
  }

  async function runCreate(next: ProductFormValues) {
    const problems: string[] = []
    let created: { id: string }
    try {
      created = await createProduct.mutateAsync({
        title: next.title.trim(),
        brandName: next.brandName.trim() || null,
        description: next.description.trim() || null,
        categorySlug: next.categorySlug,
        status: next.status,
        variants: next.variants.map((variant) => ({
          label: variant.label.trim(),
          sku: variant.sku.trim(),
          price: parsePrice(variant.price) ?? 0,
          stockQty: parseStock(variant.stockQty) ?? 0,
        })),
      })
    } catch (error) {
      setFailures([record("This listing wasn't saved", error)])
      return
    }

    // Sequential, and after the product exists: every presign is checked
    // against the product's image cap and the deployment's storage budget, so
    // firing them at once races both.
    const staged = next.images.filter((image): image is Extract<FormImage, { kind: 'staged' }> =>
      image.kind === 'staged',
    )
    for (const [index, image] of staged.entries()) {
      try {
        await uploadProductImage(created.id, { file: image.file, position: index })
      } catch (error) {
        problems.push(`${image.file.name} didn't upload: ${errorSentence(error)}`)
      }
    }

    setFailures(problems)
    onCreated({ id: created.id, title: next.title.trim() }, problems)
  }

  async function runUpdate(next: ProductFormValues, saved: SellerProductDetail) {
    const problems: string[] = []

    // 1. The product's own fields. Only what changed: the API treats an omitted
    //    field as untouched, so a title edit cannot rewrite the description.
    const patch: UpdateProductRequest = {}
    if (next.title.trim() !== saved.title) patch.title = next.title.trim()
    if (next.brandName.trim() !== (saved.brandName ?? '')) patch.brandName = next.brandName.trim()
    if (next.description.trim() !== (saved.description ?? '')) {
      patch.description = next.description.trim()
    }
    if (next.categorySlug !== saved.category.slug) patch.categorySlug = next.categorySlug
    if (next.status !== (saved.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE')) patch.status = next.status
    if (Object.keys(patch).length > 0) {
      try {
        await updateProduct.mutateAsync(patch)
      } catch (error) {
        problems.push(record('Product details', error))
      }
    }

    // 2. New variants first, so replacing the only variant is possible - the
    //    API refuses to delete a product's last one.
    for (const [index, variant] of next.variants.entries()) {
      if (variant.id) continue
      try {
        const addedVariant = await addVariantMutation.mutateAsync({
          label: variant.label.trim(),
          sku: variant.sku.trim(),
          price: parsePrice(variant.price) ?? 0,
          stockQty: parseStock(variant.stockQty) ?? 0,
        })
        // Written back so a retry after a later failure edits this row rather
        // than adding a second copy of it.
        // shouldDirty, so the reactive re-seed that follows the save keeps it:
        // a row the server has an id for must not be matched back up by
        // position, which is not stable when a row was inserted mid-list.
        setValue(`variants.${index}.id`, addedVariant.id, { shouldDirty: true })
      } catch (error) {
        problems.push(record(`The new variant "${variant.label.trim() || 'untitled'}"`, error, index))
      }
    }

    // 3. Edited variants.
    for (const [index, variant] of next.variants.entries()) {
      const before = variant.id ? saved.variants.find((v) => v.id === variant.id) : undefined
      if (!variant.id || !before) continue
      const body: UpdateVariantRequest = {}
      if (variant.label.trim() !== before.label) body.label = variant.label.trim()
      if (variant.sku.trim() !== before.sku) body.sku = variant.sku.trim()
      const price = parsePrice(variant.price)
      if (price !== null && price !== before.price) body.price = price
      const stockQty = parseStock(variant.stockQty)
      if (stockQty !== null && stockQty !== before.stockQty) body.stockQty = stockQty
      if (Object.keys(body).length === 0) continue
      try {
        await updateVariant.mutateAsync({ variantId: variant.id, body })
      } catch (error) {
        problems.push(record(`The variant "${before.label}"`, error, index))
      }
    }

    // 4. Removed variants, last of the three so the product is never
    //    momentarily without one.
    const removedVariants = saved.variants.filter(
      (variant) => !next.variants.some((row) => row.id === variant.id),
    )
    for (const variant of removedVariants) {
      try {
        await deleteVariant.mutateAsync(variant.id)
      } catch (error) {
        problems.push(record(`Removing the variant "${variant.label}"`, error))
      }
    }

    // 5. Removed images.
    const keptIds = new Set(
      next.images.filter((image) => image.kind === 'existing').map((image) => image.id),
    )
    let removalFailed = false
    for (const image of saved.images) {
      if (keptIds.has(image.id)) continue
      try {
        await deleteImage.mutateAsync(image.id)
      } catch (error) {
        removalFailed = true
        problems.push(record('Removing an image', error))
      }
    }

    // 6. New images, in the order they sit in the gallery.
    const uploadedIds = new Map<string, string>()
    for (const [index, image] of next.images.entries()) {
      if (image.kind !== 'staged') continue
      try {
        const uploaded = await uploadProductImage(productId, { file: image.file, position: index })
        uploadedIds.set(image.id, uploaded.id)
      } catch (error) {
        problems.push(`${image.file.name} didn't upload: ${errorSentence(error)}`)
      }
    }

    // 7. The ordering, once the set is settled. Skipped when a removal failed:
    //    the endpoint requires the list to name every image the product still
    //    has, and one that was meant to be gone would make this a second,
    //    confusing failure rather than a useful one.
    const desired = next.images
      .map((image) => (image.kind === 'existing' ? image.id : uploadedIds.get(image.id)))
      .filter((id): id is string => Boolean(id))
    const imagesChanged =
      saved.images.map((image) => image.id).join('\u0000') !== desired.join('\u0000')
    if (!removalFailed && imagesChanged && desired.length > 0) {
      try {
        await reorderImages.mutateAsync(desired)
      } catch (error) {
        problems.push(record('The image order', error))
      }
    }

    // The server is now the authority on what this listing is. Refetching makes
    // it the baseline as well, so the footer's "Unsaved changes" describes only
    // what is still outstanding.
    const refreshed = (await query.refetch()).data

    if (problems.length === 0) {
      if (refreshed) reset(toFormValues(refreshed))
      setFailures([])
      onSaved(next.title.trim())
      return
    }

    // Images that DID upload are swapped for their saved rows, so a retry does
    // not send them a second time.
    if (refreshed && uploadedIds.size > 0) {
      const byId = new Map(refreshed.images.map((image) => [image.id, image]))
      setValue(
        'images',
        next.images.map((image) => {
          if (image.kind === 'existing') return image
          const serverImage = byId.get(uploadedIds.get(image.id) ?? '')
          return serverImage
            ? {
                kind: 'existing' as const,
                id: serverImage.id,
                url: serverImage.url,
                status: serverImage.status,
              }
            : image
        }),
        { shouldDirty: true },
      )
    }
    setFailures(problems)
  }

  const submit = handleSubmit(async (next) => {
    setFailures([])
    setSkippedImages(0)
    setIsSaving(true)
    try {
      if (options.mode === 'add') {
        await runCreate(next)
      } else if (product) {
        await runUpdate(next, product)
      }
    } finally {
      setIsSaving(false)
    }
  })

  return {
    mode,
    form,
    values,
    product,
    isLoading: mode === 'edit' && query.isLoading,
    loadError: mode === 'edit' && query.isError ? query.error : null,
    reloadProduct: () => void query.refetch(),
    status: values.status,
    setStatus: (next) => setValue('status', next, { shouldDirty: true }),
    variantFields: variantArray.fields,
    addVariant,
    duplicateVariant,
    removeVariant,
    images,
    addImages,
    removeImage,
    moveImage,
    skippedImages,
    dirty,
    canSave,
    footerNote: footerNoteFor(missing, dirty),
    saveLabel,
    isSaving,
    failures,
    submit: () => void submit(),
  }
}

/** Placeholders for the callback the other mode does not have. Never called. */
const NO_CREATE: AddOptions['onCreated'] = () => {}
const NO_SAVE: EditOptions['onSaved'] = () => {}

function isProblem(error: unknown): error is ProblemDetail {
  return typeof error === 'object' && error !== null && 'title' in error && 'status' in error
}
