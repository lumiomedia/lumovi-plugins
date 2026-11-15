import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { __resetForTests, __setDesktopTauriEnvForTests, __setTvModeForTests, writePluginJson } from '@/lib/plugin-sdk'
import { flushLiveTvIndex, seedLiveTvIndex } from '../../src/__test-stubs__/live-tv-index'
import { LIVE_TV_PLUGIN_ID, channelKey, type LiveTvList } from '../live-tv-data'
import { getTvSettings } from './tv-settings-store'
import type { EpgCacheEntry } from '../epg/types'

vi.mock('../live-tv-player', () => ({ LiveTvPlayer: ({ channel, onClose }: { channel: { name: string }; onClose: () => void }) => <div data-testid="player"><button type="button" data-testid="player-close" onClick={onClose} />{channel.name}</div> }))
import { LiveTvTvShell } from './tv-shell'

/**
 * Fäst kanal i guiden (Reddit: "keep the channel on one channel while I
 * scroll through the guide"): klick/OK på kanalcellen fäster kanalen överst,
 * förhandsvisningen står kvar på den medan fokus flyttas, och Bakåt på den
 * fästa raden / OK igen / Lossa lossar.
 */
const now = Date.now()
const ch = (name: string, group: string, tvgId: string | null = null) => ({ name, logo: null, group, url: `http://x/${name}`, tvgId })
const list: LiveTvList = { id: 'l1', name: 'Xtream', channels: [ch('A', 'Sport', 'a.tv'), ch('B', 'Sport', 'b.tv'), ch('C', 'News')], createdAt: '', urlTvg: 'http://x/epg', epgUrls: [], autoEpgDisabled: false, fetchedAt: null }
const cache: EpgCacheEntry = {
  index: {
    'a.tv': [
      { title: 'Now A', start: now - 10 * 60_000, stop: now + 20 * 60_000 },
      { title: 'Next A', start: now + 20 * 60_000, stop: now + 50 * 60_000 },
    ],
    'b.tv': [
      { title: 'Now B', start: now - 5 * 60_000, stop: now + 25 * 60_000 },
      { title: 'Next B', start: now + 25 * 60_000, stop: now + 55 * 60_000 },
    ],
  },
  fetchedAt: now, sources: ['http://x/epg'],
}
const keyOf = (name: string) => channelKey(ch(name, ''))

afterEach(() => { cleanup(); __setDesktopTauriEnvForTests(false); vi.useRealTimers() })
beforeEach(() => {
  __resetForTests()
  __setTvModeForTests(true)
  writePluginJson(LIVE_TV_PLUGIN_ID, 'lists', [list])
  writePluginJson(LIVE_TV_PLUGIN_ID, 'pins', [])
  seedLiveTvIndex({ cache })
})

const mount = async (mode: 'now' | 'tl' | 'list' = 'now') => {
  writePluginJson(LIVE_TV_PLUGIN_ID, 'live_tv_guide_mode_v1', mode)
  render(<LiveTvTvShell params={{ view: 'guide' }} onNavigate={vi.fn()} onOpenDetails={() => {}} />)
  await flushLiveTvIndex()
}

const pinnedFrame = () => screen.queryByTestId('guide-pinned-row')
/** Listans rad (inte den fästa raden överst). */
const listRow = (name: string) => Array.from(document.querySelectorAll<HTMLElement>('[data-guide-v2-row]'))
  .find((row) => row.dataset.key === keyOf(name) && !row.closest('[data-guide-pinned-row]'))!
const cellOf = (row: HTMLElement) => within(row).getByTestId('guide-channel-v2')
const previewKey = () => screen.getByTestId('guide-hero-preview').getAttribute('data-preview-key')
const press = (key: string) => fireEvent.keyDown(window, { key })

describe('Fäst kanal i guiden (TV-läge)', () => {
  it('kanalcellen är en station; klick fäster: EN fäst rad överst, originalraden tonas, nål i cellen och förhandsrutan', async () => {
    await mount()
    const cell = cellOf(listRow('B'))
    expect(cell).toHaveAttribute('data-f')
    expect(pinnedFrame()).toBeNull()
    fireEvent.click(cell)
    const frame = pinnedFrame()!
    expect(frame).toBeInTheDocument()
    expect(screen.getAllByTestId('guide-pinned-row')).toHaveLength(1)
    // Den fästa raden förekommer EN gång överst: en rad i ramen, med kanalens nyckel.
    const stickyRows = frame.querySelectorAll('[data-guide-v2-row]')
    expect(stickyRows).toHaveLength(1)
    expect((stickyRows[0] as HTMLElement).dataset.key).toBe(keyOf('B'))
    expect(within(frame).getByTestId('guide-channel-v2')).toHaveAttribute('data-pin', 'sticky')
    expect(within(frame).getByTestId('guide-channel-pin')).toBeInTheDocument()
    // Originalraden ligger kvar i listan men tonad.
    expect(cellOf(listRow('B'))).toHaveAttribute('data-pin', 'origin')
    expect(listRow('B').style.opacity).toBe('0.4')
    expect(listRow('A').style.opacity).toBe('')
    // Bara en [data-init] (den fästa raden tar ingen).
    expect(document.querySelectorAll('[data-init]')).toHaveLength(1)
    expect(previewKey()).toBe(keyOf('B'))
    expect(screen.getByTestId('guide-hero-preview')).toHaveAttribute('data-pinned')
    expect(screen.getByTestId('guide-hero-preview-pin')).toBeInTheDocument()
  })

  it('tipset visas första gången och sparas; nästa fästning visar det inte igen', async () => {
    await mount()
    fireEvent.click(cellOf(listRow('B')))
    expect(screen.getByTestId('shell-toast')).toHaveTextContent('Channel pinned')
    expect(getTvSettings().guidePinHintSeen).toBe(true)
    cleanup()
    await mount()
    fireEvent.click(cellOf(listRow('A')))
    expect(pinnedFrame()).toBeInTheDocument()
    expect(screen.queryByTestId('shell-toast')).toBeNull()
  })

  it('fokusflytt byter INTE förhandsvisad kanal medan en kanal är fäst (heron följer fortfarande texten)', async () => {
    await mount()
    vi.useFakeTimers()
    // Utan fäst: rutan följer fokus.
    act(() => { within(listRow('A')).getByTestId('nowsen-now').focus() })
    act(() => { vi.advanceTimersByTime(400) })
    act(() => { within(listRow('B')).getByTestId('nowsen-now').focus() })
    act(() => { vi.advanceTimersByTime(400) })
    expect(previewKey()).toBe(keyOf('B'))
    // Fäst A och flytta fokus fritt.
    act(() => { fireEvent.click(cellOf(listRow('A'))) })
    act(() => { within(listRow('B')).getByTestId('nowsen-now').focus() })
    act(() => { vi.advanceTimersByTime(400) })
    act(() => { within(listRow('B')).getByTestId('nowsen-next').focus() })
    act(() => { vi.advanceTimersByTime(400) })
    act(() => { within(listRow('C')).getByTestId('nowsen-empty').focus() })
    act(() => { vi.advanceTimersByTime(400) })
    expect(previewKey()).toBe(keyOf('A'))
    // Texten följer fokus som förut.
    expect(screen.getByTestId('guide-hero-title')).toHaveTextContent('C')
  })

  it('klick på kanalcellen igen (i den fästa raden eller originalraden) lossar', async () => {
    await mount()
    fireEvent.click(cellOf(listRow('B')))
    fireEvent.click(within(pinnedFrame()!).getByTestId('guide-channel-v2'))
    expect(pinnedFrame()).toBeNull()
    expect(cellOf(listRow('B'))).not.toHaveAttribute('data-pin')
    fireEvent.click(cellOf(listRow('B')))
    fireEvent.click(cellOf(listRow('B')))
    expect(pinnedFrame()).toBeNull()
  })

  it('en annan kanals cell flyttar fästet dit (fortfarande en enda fäst rad)', async () => {
    await mount()
    fireEvent.click(cellOf(listRow('B')))
    fireEvent.click(cellOf(listRow('A')))
    expect(screen.getAllByTestId('guide-pinned-row')).toHaveLength(1)
    expect((pinnedFrame()!.querySelector('[data-guide-v2-row]') as HTMLElement).dataset.key).toBe(keyOf('A'))
    expect(previewKey()).toBe(keyOf('A'))
  })

  it('OK på en annan kanals pågående program öppnar spelaren som förut OCH flyttar fästet till den kanalen', async () => {
    await mount()
    fireEvent.click(cellOf(listRow('B')))
    const nowA = within(listRow('A')).getByTestId('nowsen-now')
    act(() => { nowA.focus() })
    fireEvent.keyDown(nowA, { key: 'Enter' })
    fireEvent.keyUp(nowA, { key: 'Enter' })
    await flushLiveTvIndex()
    expect(screen.getByTestId('player')).toHaveTextContent('A')
    expect((pinnedFrame()!.querySelector('[data-guide-v2-row]') as HTMLElement).dataset.key).toBe(keyOf('A'))
  })

  it('D-pad: ▲ från listans första rad går till den fästa raden, ▼ tillbaka; kanalcellen ▲▼ följer också', async () => {
    await mount()
    fireEvent.click(cellOf(listRow('C')))
    const frame = pinnedFrame()!
    const firstNow = within(listRow('A')).getByTestId('nowsen-now')
    act(() => { firstNow.focus() })
    fireEvent.keyDown(firstNow, { key: 'ArrowUp' })
    // C saknar tablå: den fästa radens nu-station är den tomma cellen.
    expect(frame.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toHaveAttribute('data-now-station')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(firstNow)
    // Kanalcellerna: ▲ från första radens cell → den fästa radens cell, ▸ → radens nu-cell.
    const firstCell = cellOf(listRow('A'))
    act(() => { firstCell.focus() })
    fireEvent.keyDown(firstCell, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(within(frame).getByTestId('guide-channel-v2'))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(firstCell)
    fireEvent.keyDown(firstCell, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(firstNow)
  })

  it('Bakåt på den fästa raden lossar och lämnar fokus på originalradens kanalcell; Bakåt utanför lossar inte', async () => {
    await mount()
    fireEvent.click(cellOf(listRow('B')))
    // Fokus i listan (på nu): Bakåt tar guidens vanliga kedja (kategorierna), fästet står kvar.
    act(() => { within(listRow('A')).getByTestId('nowsen-now').focus() })
    press('Escape')
    expect(pinnedFrame()).toBeInTheDocument()
    expect(screen.getByTestId('guide-category-column').contains(document.activeElement)).toBe(true)
    // Fokus på den fästa raden: Bakåt lossar.
    act(() => { within(pinnedFrame()!).getByTestId('guide-channel-v2').focus() })
    press('Escape')
    expect(pinnedFrame()).toBeNull()
    expect(document.activeElement).toBe(cellOf(listRow('B')))
  })

  it('fästet följer med vid lägesbyte (Tablå, Kanallista) och ritas en gång i varje läge', async () => {
    await mount()
    fireEvent.click(cellOf(listRow('A')))
    for (const mode of ['tl', 'list'] as const) {
      fireEvent.click(screen.getByTestId(`guide-mode-${mode}`))
      await flushLiveTvIndex()
      expect(screen.getByTestId('guide-shell')).toHaveAttribute('data-guide-mode', mode)
      expect(screen.getAllByTestId('guide-pinned-row')).toHaveLength(1)
      expect(pinnedFrame()!.querySelectorAll('[data-guide-v2-row]')).toHaveLength(1)
      expect(previewKey()).toBe(keyOf('A'))
    }
  })

  it('Tablå: ▲ från första radens block landar i den fästa raden; ◂▸ i originalraden stannar i originalraden', async () => {
    await mount('tl')
    fireEvent.click(cellOf(listRow('A')))
    await flushLiveTvIndex()
    const frame = pinnedFrame()!
    const blocksA = within(listRow('A')).getAllByTestId('tl-block')
    const first = blocksA.find((b) => b.textContent?.includes('Now A'))!
    act(() => { first.focus() })
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(listRow('A').contains(document.activeElement)).toBe(true)
    expect(document.activeElement?.textContent).toContain('Next A')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: 'ArrowUp' })
    expect(frame.contains(document.activeElement)).toBe(true)
  })
})

describe('Fäst kanal i guiden (skrivbordet)', () => {
  it('Lossa-knappen i den fästa raden lossar', async () => {
    __setTvModeForTests(false)
    __setDesktopTauriEnvForTests(true)
    await mount()
    fireEvent.click(cellOf(listRow('B')))
    expect(screen.getByTestId('shell-toast')).toHaveTextContent('Click it again to unpin')
    fireEvent.click(screen.getByTestId('guide-unpin'))
    expect(pinnedFrame()).toBeNull()
  })
})

/**
 * LAN/fjärr-webbklientens gamla guide (`TvGuideStandard`): kanalraden ÄR
 * stationen och OK spelade kanalen redan — nu spelar den OCH fäster.
 */
describe('Fäst kanal i den gamla guiden (LAN/fjärr)', () => {
  beforeEach(() => { __setTvModeForTests(false); __setDesktopTauriEnvForTests(false) })
  const rows = () => screen.getAllByTestId('guide-row')
  const listRowL = (name: string) => rows().find((r) => r.getAttribute('data-key') === keyOf(name) && !r.closest('[data-guide-pinned-row]'))!
  const legacyPreview = () => screen.getByTestId('guide-preview').getAttribute('data-preview-key')

  it('OK spelar som förut OCH fäster: en fäst rad överst, förhandsrutan står kvar medan fokus flyttas', async () => {
    await mount()
    fireEvent.click(listRowL('B'))
    expect(await screen.findByTestId('player')).toHaveTextContent('B')
    expect(screen.getAllByTestId('guide-pinned-row')).toHaveLength(1)
    expect(within(pinnedFrame()!).getAllByTestId('guide-row')).toHaveLength(1)
    vi.useFakeTimers()
    act(() => { fireEvent.focus(listRowL('C')) })
    act(() => { vi.advanceTimersByTime(400) })
    act(() => { fireEvent.focus(listRowL('A')) })
    act(() => { vi.advanceTimersByTime(400) })
    expect(legacyPreview()).toBe(keyOf('B'))
    expect(screen.getByTestId('guide-preview')).toHaveAttribute('data-pinned')
    // Toppbandets text följer fokus som förut.
    expect(screen.getByTestId('guide-headline')).toHaveTextContent('Now A')
  })

  it('▲ från första raden går till den fästa raden; Bakåt där lossar', async () => {
    await mount()
    fireEvent.click(listRowL('C'))
    await screen.findByTestId('player')
    fireEvent.click(screen.getByTestId('player-close'))
    expect(screen.queryByTestId('player')).toBeNull()
    const first = rows().find((r) => !r.closest('[data-guide-pinned-row]'))!
    act(() => { first.focus() })
    fireEvent.keyDown(first, { key: 'ArrowUp' })
    expect(pinnedFrame()!.contains(document.activeElement)).toBe(true)
    press('Escape')
    expect(pinnedFrame()).toBeNull()
  })

  it('OK på den fästa kanalen igen lossar (spelaren nås via förhandsrutan)', async () => {
    await mount()
    fireEvent.click(listRowL('B'))
    await screen.findByTestId('player')
    fireEvent.click(screen.getByTestId('player-close'))
    fireEvent.click(within(pinnedFrame()!).getByTestId('guide-row'))
    expect(pinnedFrame()).toBeNull()
  })
})
