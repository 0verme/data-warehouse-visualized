import { useEffect, useRef, useState, type ReactNode } from 'react'

interface HorizontalScrollRegionProps {
  children: ReactNode
  className: string
  label: string
  dataDetailRole?: string
}

/**
 * Accessible presentation for wide tables that must preserve their columns.
 * Detection only controls the hint and keyboard region; native overflow keeps
 * ownership of touch, pointer, wheel, and keyboard scrolling.
 */
export function HorizontalScrollRegion({
  children,
  className,
  label,
  dataDetailRole,
}: HorizontalScrollRegionProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [isScrollable, setIsScrollable] = useState(false)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const updateScrollability = () => {
      const next = viewport.scrollWidth > viewport.clientWidth + 1
      setIsScrollable((current) => (current === next ? current : next))
    }

    updateScrollability()
    const observer = new ResizeObserver(updateScrollability)
    observer.observe(viewport)
    for (const child of viewport.children) observer.observe(child)
    window.addEventListener('resize', updateScrollability)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateScrollability)
    }
  }, [])

  return (
    <div className="horizontal-scroll-region">
      {isScrollable && (
        <p className="horizontal-scroll-region__hint" aria-hidden="true">
          可横向滚动查看其余列 <span>↔</span>
        </p>
      )}
      <div
        ref={viewportRef}
        className={`${className} horizontal-scroll-region__viewport`}
        role={isScrollable ? 'region' : undefined}
        aria-label={isScrollable ? label : undefined}
        data-detail-role={dataDetailRole}
        tabIndex={isScrollable ? 0 : undefined}
      >
        {children}
      </div>
    </div>
  )
}
