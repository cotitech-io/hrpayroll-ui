import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { PrivateAccessButton } from './PrivateAccessButton'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #333',
        }}
      >
        <nav style={{ display: 'flex', gap: '1.25rem' }}>
          <NavLink to="/">Activity</NavLink>
          <NavLink to="/employee">Employee</NavLink>
          <NavLink to="/employer">Employer</NavLink>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <PrivateAccessButton />
          <ConnectButton />
        </div>
      </header>
      <main style={{ flex: 1, padding: '1.5rem' }}>{children}</main>
    </div>
  )
}
