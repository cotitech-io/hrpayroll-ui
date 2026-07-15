import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { PrivateAccessButton } from './PrivateAccessButton'
import { ThemeToggle } from './ThemeToggle'

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? 'text-primary font-semibold' : 'text-foreground opacity-70 hover:opacity-100'
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <nav className="flex gap-5">
          <NavLink to="/" end className={navLinkClassName}>Activity</NavLink>
          <NavLink to="/employee" className={navLinkClassName}>Employee</NavLink>
          <NavLink to="/employer" className={navLinkClassName}>Employer</NavLink>
        </nav>
        <div className="flex items-center gap-4">
          <PrivateAccessButton />
          <ConnectButton />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
