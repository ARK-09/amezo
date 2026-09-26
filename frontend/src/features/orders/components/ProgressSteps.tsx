import { cn } from '@/lib/utils'

export type StepState = 'done' | 'current' | 'todo' | 'failed'

export interface ProgressStep {
  key: string
  label: string
  detail?: string | null
  state: StepState
}

const DOT: Record<StepState, string> = {
  done: 'bg-primary',
  current: 'border-[3px] border-primary bg-background',
  todo: 'border-2 border-[#e0e0e0] bg-background',
  failed: 'bg-[#b42318]',
}

/**
 * The horizontal stepper the order and refund panels both use: a dot per stage
 * with a rule running to the next one, filled only as far as progress has
 * actually reached.
 */
export function ProgressSteps({ steps }: { steps: ProgressStep[] }) {
  return (
    <ol className="flex flex-wrap gap-y-1">
      {steps.map((step) => (
        <li key={step.key} className="min-w-[130px] flex-1 basis-[150px] pr-3">
          <div className="flex items-center gap-2">
            <span className={cn('size-[13px] shrink-0 rounded-full', DOT[step.state])} />
            <span
              className={cn('h-[3px] flex-1', step.state === 'done' ? 'bg-primary' : 'bg-[#ececec]')}
            />
          </div>
          <p className="mt-[9px] text-[13px] font-semibold">{step.label}</p>
          {step.detail && <p className="mt-0.5 text-xs text-muted-foreground">{step.detail}</p>}
        </li>
      ))}
    </ol>
  )
}
