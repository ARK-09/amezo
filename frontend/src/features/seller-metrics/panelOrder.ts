import { useState } from 'react'

/**
 * The order the dashboard's charts and widgets sit in, and the move that
 * changes it.
 *
 * Client-side only: which panel a seller likes first is a preference about
 * this browser, not a fact about the shop, so it lives in localStorage and
 * never goes near the API. Every read and write is wrapped, because storage
 * throws in a private window and can be full anywhere - a dashboard that will
 * not render because it could not remember a panel order is a far worse bug
 * than a forgotten panel order.
 */
const STORAGE_PREFIX = 'amezo.seller-dashboard.'

export function usePanelOrder<K extends string>(name: string, fallback: readonly K[]) {
  // Read once, during the initial render, rather than in an effect that then
  // sets state: the page would otherwise paint the default order and jump.
  const [order, setOrder] = useState<K[]>(() => storedOrder(name, fallback))

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= order.length || from < 0 || from >= order.length) return
    const next = order.slice()
    next.splice(to, 0, next.splice(from, 1)[0])
    persist(name, next)
    setOrder(next)
  }

  return { order, move }
}

/**
 * The pointer half of the same move. The dragged index travels in the drag's
 * own payload rather than in React state, so nothing on the page re-renders
 * while a panel is in the air - and the group travels with it, so a chart
 * dropped on a widget is recognised as the nonsense it is and ignored.
 *
 * The buttons are what makes this reachable; this is the shortcut for a mouse.
 */
const DRAG_TYPE = 'text/plain'

export function panelDragProps(group: string, index: number) {
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData(DRAG_TYPE, `${group}:${index}`)
      event.dataTransfer.effectAllowed = 'move'
    },
  }
}

export function panelDropProps(
  group: string,
  index: number,
  move: (from: number, to: number) => void,
) {
  return {
    onDragOver: (event: React.DragEvent) => event.preventDefault(),
    onDrop: (event: React.DragEvent) => {
      const [dropped, from] = event.dataTransfer.getData(DRAG_TYPE).split(':')
      if (dropped !== group) return
      event.preventDefault()
      const source = Number(from)
      if (Number.isInteger(source)) move(source, index)
    },
  }
}

function storedOrder<K extends string>(name: string, fallback: readonly K[]): K[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${name}`)
    if (!raw) return [...fallback]
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...fallback]

    // Only keys this build still knows, each once. Anything stored by an older
    // build that has since been renamed or removed is dropped, and any panel
    // that build did not have is appended - so a new widget shows up at the
    // end instead of disappearing for everyone who has ever dragged a panel.
    const known = new Set<string>(fallback)
    const kept = [...new Set(parsed.filter((key): key is K => typeof key === 'string' && known.has(key)))]
    return [...kept, ...fallback.filter((key) => !kept.includes(key))]
  } catch {
    return [...fallback]
  }
}

function persist(name: string, order: readonly string[]) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${name}`, JSON.stringify(order))
  } catch {
    // Full, or blocked in a private window. The order still applies for this
    // visit; only remembering it is lost.
  }
}
