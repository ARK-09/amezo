/** "AWAITING_RETURN" -> "Awaiting return". Its own module so the badge file
 *  exports nothing but a component and fast refresh keeps working. */
export function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ')
}
