import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { __resetForTests, __setDesktopTauriEnvForTests, __setTvModeForTests } from '@/lib/plugin-sdk'
import { LiveTvTvShell } from './tv-shell'
import { getTvSettings } from './tv-settings-store'

/**
 * Egen fil: `tv-settings.test.tsx` mockar plugin-sdk med en spridd kopia, och
 * där är `isDesktopTauriEnv` fryst till false — raden hade aldrig synts.
 */
const mount = () => render(<LiveTvTvShell pageId="live-tv-browse" params={{ view: 'settings' }} onNavigate={() => {}} onOpenDetails={() => {}} />)

beforeEach(() => { __resetForTests(); __setTvModeForTests(true) })
afterEach(() => { cleanup(); __setDesktopTauriEnvForTests(false) })

describe('Livebuffert i Live TV:s inställningar', () => {
  it('skrivbordsappen: raden stegar Snabb start → Stabil → Extra stabil och skriver lagret', () => {
    __setDesktopTauriEnvForTests(true)
    mount()
    const row = screen.getByTestId('setting-liveBuffer')
    expect(row).toHaveAttribute('data-f')
    expect(row).toHaveTextContent('Fast start')
    fireEvent.click(row)
    expect(getTvSettings().liveBuffer).toBe('stable')
    expect(screen.getByTestId('setting-liveBuffer')).toHaveTextContent('Stable')
    fireEvent.click(screen.getByTestId('setting-liveBuffer'))
    expect(getTvSettings().liveBuffer).toBe('max')
  })
  it('webbklienten har ingen rad — dess <video> buffrar själv', () => {
    mount()
    expect(screen.queryByTestId('setting-liveBuffer')).toBeNull()
  })
})
