import type { ReactNode } from 'react'
import { useNavigation } from '@/core/context/NavigationContext'
import { cn } from '@/lib/utils'

interface BreadcrumbProps {
  right?: ReactNode
}

function Breadcrumb({ right }: BreadcrumbProps) {
  const { levels } = useNavigation()

  return (
    <header className="flex items-center justify-between h-12 px-3 border-b border-white/8 shrink-0">
      <nav aria-label="Breadcrumb" className="flex items-center min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 min-w-0">
          {levels.map((level, index) => {
            const isLast = index === levels.length - 1

            return (
              <li key={level.id} className="flex items-center gap-1.5 min-w-0">
                {index > 0 && (
                  <BreadcrumbSeparator />
                )}
                <BreadcrumbItem
                  label={level.label}
                  onClick={level.onClick}
                  isLast={isLast}
                />
              </li>
            )
          })}
        </ol>
      </nav>

      {right && (
        <div className="flex items-center ml-2 shrink-0">{right}</div>
      )}
    </header>
  )
}

function BreadcrumbSeparator() {
  return (
    <span
      aria-hidden="true"
      className="text-[13px] text-white/30 select-none"
    >
      /
    </span>
  )
}

interface BreadcrumbItemProps {
  label: string
  onClick?: () => void
  isLast: boolean
}

function BreadcrumbItem({ label, onClick, isLast }: BreadcrumbItemProps) {
  if (isLast) {
    return (
      <span
        className="text-[13px] font-medium text-white/90 tracking-tight truncate"
        aria-current="page"
      >
        {label}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-[13px] font-medium tracking-tight truncate',
        'text-white/50 hover:text-white/80',
        'transition-colors duration-150 ease-out',
        'cursor-pointer bg-transparent border-none p-0'
      )}
    >
      {label}
    </button>
  )
}

export { Breadcrumb }
