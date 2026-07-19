import type { CSSProperties, ReactNode } from 'react'

/** Inline crimson error line. */
export function InlineError({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <p style={{ color: 'crimson', ...style }}>{children}</p>
}
