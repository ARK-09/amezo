import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PaginationBar } from '@/components/ui/pagination'
import {
  Table,
  TableAction,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function List({ fill = false }: { fill?: boolean }) {
  return (
    <TableContainer
      fill={fill}
      footer={
        <PaginationBar
          page={0}
          totalPages={2}
          onPageChange={() => {}}
          range={{ totalElements: 8, pageSize: 5, sizes: [5, 10], onSizeChange: () => {} }}
        />
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Trail Backpack</TableCell>
            <TableCell>
              <TableAction variant="outline">Edit</TableAction>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  )
}

const scroll = () => document.querySelector('[data-slot="table-scroll"]')
const container = () => document.querySelector('[data-slot="table-container"]')

describe('TableContainer', () => {
  it('holds the table and the footer in one bordered box', () => {
    render(<List />)

    expect(container()).toContainElement(screen.getByRole('table'))
    expect(container()).toContainElement(screen.getByRole('navigation', { name: 'pagination' }))
    expect(container()?.className).toContain('border')
    expect(container()?.className).toContain('overflow-hidden')
  })

  it('pins the footer below the scrolling rows rather than inside them', () => {
    render(<List />)

    const bar = document.querySelector('[data-slot="table-footer-bar"]')
    expect(bar).toContainElement(screen.getByRole('navigation', { name: 'pagination' }))
    // Outside the scroll boundary, so paging controls never scroll out of reach.
    expect(scroll()).not.toContainElement(bar as HTMLElement)
    expect(bar?.className).toContain('shrink-0')
  })

  it('renders without a footer at all when a list has no pager', () => {
    render(
      <TableContainer>
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Trail Backpack</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>,
    )

    expect(document.querySelector('[data-slot="table-footer-bar"]')).toBeNull()
  })

  /**
   * `fill` is the opt-in: min-h-0 is what lets the box shrink below its rows, and
   * so what makes the rows scroll instead of the page. Without it the container
   * is as tall as its content, which is what every unconverted list still wants.
   */
  it('only takes the height the page has left when asked to fill', () => {
    const { unmount } = render(<List />)
    expect(container()?.className).not.toContain('min-h-0')
    unmount()

    render(<List fill />)
    expect(container()?.className).toContain('min-h-0')
    expect(scroll()?.className).toContain('min-h-0')
    expect(scroll()?.className).toContain('overflow-auto')
  })

  it('leaves the table one scroll boundary, and sticks the header to it', () => {
    render(<List fill />)

    // Table's own overflow wrapper would be a second boundary, and the sticky
    // header has nothing to stick to inside it.
    expect(screen.getByRole('table').parentElement).toBe(scroll())
    expect(screen.getByRole('table').querySelector('thead')?.className).toContain('sticky')
  })

  it('leaves a table outside a container exactly as it was', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    )

    const table = screen.getByRole('table')
    expect(table.parentElement?.className).toContain('overflow-x-auto')
    expect(table.querySelector('thead')?.className).not.toContain('sticky')
  })
})

describe('TableAction', () => {
  it('is wider than a plain small button, so a row action reads as a target', () => {
    render(<List />)

    const edit = screen.getByRole('button', { name: 'Edit' })
    expect(edit.className).toContain('min-w-[4.5rem]')
    expect(edit.className).toContain('px-4')
    expect(edit.className).toContain('text-[13px]')
    // Still a Button, so variants and disabled states come from one place.
    expect(edit).toHaveAttribute('data-slot', 'button')
  })
})
