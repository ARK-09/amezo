import { SearchableSelect } from '@/components/ui/searchable-select'

import { filterCategories, useCategories } from '../api/useCategories'

/**
 * The only way to set a product's category. Backed by GET /categories, so a seller
 * can no longer type one - and the server refuses anything not on the list anyway,
 * which is what makes this a convenience rather than the enforcement.
 */
export function CategorySelect({
  value,
  onChange,
  id,
  invalid,
  selectedName,
}: {
  /** The selected category's slug, or null. */
  value: string | null
  onChange: (slug: string) => void
  id?: string
  invalid?: boolean
  /**
   * The current category's display name, when the caller already has it - an edit
   * form does. Shown until the list loads, so the control never flashes a loading
   * placeholder over a category the seller can see is set.
   */
  selectedName?: string
}) {
  const categories = useCategories()

  return (
    <SearchableSelect
      id={id}
      items={categories.data ?? []}
      value={value}
      onChange={onChange}
      getKey={(category) => category.slug}
      getLabel={(category) => category.name}
      filter={filterCategories}
      label="Category"
      placeholder={categories.isPending ? 'Loading categories…' : 'Select a category'}
      searchPlaceholder="Search categories"
      emptyMessage="No category matches that"
      // Nothing to choose from yet, so the control would be a dead end rather than
      // an empty list to puzzle over.
      disabled={categories.isPending || (categories.data?.length ?? 0) === 0}
      invalid={invalid}
      fallbackLabel={selectedName}
    />
  )
}
