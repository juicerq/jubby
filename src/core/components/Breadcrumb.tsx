import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useNavigation } from '@/core/context/NavigationContext'
import { cn } from '@/lib/utils'

const ease = [0.25, 0.1, 0.25, 1] as const

const itemVariants = {
  initial: { opacity: 0, x: -8 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -8 },
}

const transition = {
  duration: 0.15,
  ease,
}

const separatorTransition = {
  duration: 0.12,
  ease,
  delay: 0.05,
}

interface BreadcrumbProps {
  right?: ReactNode
}

function Breadcrumb({ right }: BreadcrumbProps) {
  const { levels, navigateToLevel } = useNavigation()

  return (
    <header className="flex items-center justify-between h-12 px-3 border-b border-white/8 shrink-0">
      <nav aria-label="Breadcrumb" className="flex items-center min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 min-w-0">
          <AnimatePresence mode="sync" initial={false}>
            {levels.map((level, index) => {
              const isLast = index === levels.length - 1

              return (
                <motion.li
                  key={level.id}
                  layout
                  className="flex items-center gap-1.5 min-w-0"
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  variants={itemVariants}
                  transition={transition}
                >
                  {index > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem
                    label={level.label}
                    onClick={isLast ? undefined : () => navigateToLevel(level.id)}
                    isLast={isLast}
                  />
                </motion.li>
              )
            })}
          </AnimatePresence>
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
    <motion.span
      aria-hidden="true"
      className="text-[13px] text-white/30 select-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={separatorTransition}
    >
      /
    </motion.span>
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
      <motion.span
        className="text-[13px] font-medium text-white/90 tracking-tight"
        aria-current="page"
        initial={{ scale: 0.97, opacity: 0.8 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={transition}
      >
        {label}
      </motion.span>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-[13px] font-medium tracking-tight',
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
