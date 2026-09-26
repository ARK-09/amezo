import { RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * The bordered radio card the refund form uses for both the outcome and the
 * payout choice: a real radio for semantics and keyboard use, with the whole
 * card as its hit area.
 */
export function ChoiceCard({
  value,
  label,
  detail,
  selected,
}: {
  value: string
  label: string
  detail: string
  selected: boolean
}) {
  return (
    <Label
      htmlFor={`choice-${value}`}
      className={cn(
        'flex flex-1 basis-[240px] cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors',
        selected ? 'border-primary bg-primary/5' : 'hover:border-neutral-300',
      )}
    >
      <RadioGroupItem id={`choice-${value}`} value={value} className="mt-0.5" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-[13px] leading-[1.5] font-normal text-muted-foreground text-pretty">
          {detail}
        </span>
      </span>
    </Label>
  )
}
