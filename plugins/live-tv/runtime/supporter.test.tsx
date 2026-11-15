import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react'
import { __resetForTests } from '@/lib/plugin-sdk'
import { __resetSupporterForTests, installSupporterApi, isFeatureLocked, useFeatureLocked, type SupporterApiLike } from './supporter'
import { useChannelRecording } from './use-channel-recording'
import { __resetRecordingsForTests, RecordRequestError, isSupporterRequired, scheduleRecording, showRecordingsTab, type Recording } from './recordings'
import { RecordingSettingsTvRows } from './recording-settings'
import { TvRail } from './tv/tv-rail'
import { MobileTabBar } from './tv/mobile/mobile-tab-bar'
import { holdMenu } from './tv/programme-actions'
import { tvText } from './tv/tv-strings'
import { getTvSettings } from './tv/tv-settings-store'
import { __resetToastsForTests, hasToasts } from './toast-center'
import type { TvNav } from './tv/tv-shell'
import type { M3uChannel } from './live-tv-data'

/*
  Plus-spärren (Lumovi): inspelning och sportläget. Värden här efterliknar
  appens `ctx.supporter` (lib/supporter/plugin-api.ts): `hasFeature` är false
  tills statusen är hämtad, och Plus-funktioner kräver nivån `plus`
  (provperioden ger plus).
*/

type State = 'trial' | 'supporter' | 'plus' | 'free'
const TIER: Record<State, 'plus' | 'supporter' | null> = { trial: 'plus', plus: 'plus', supporter: 'supporter', free: null }
const PLUS_FEATURES = new Set(['liveTvRecording', 'sportsMode', 'plus'])

function fakeHost(initial: State | null) {
  let status: { state: State } | null = initial ? { state: initial } : null
  const listeners = new Set<() => void>()
  let resolvePending: ((s: { state: State } | null) => void) | null = null
  const api: SupporterApiLike & { set(next: State): void; pending: boolean } = {
    pending: false,
    status: () => {
      if (status) return Promise.resolve(status)
      if (api.pending) return new Promise((r) => { resolvePending = r })
      return Promise.resolve(null)
    },
    hasFeature: (id) => {
      const tier = status ? TIER[status.state] : null
      if (!tier) return false
      return PLUS_FEATURES.has(id) ? tier === 'plus' : true
    },
    subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    set(next) {
      status = { state: next }
      resolvePending?.(status)
      for (const l of [...listeners]) l()
    },
  }
  return api
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

const channel = { name: 'SVT1', logo: null, group: 'SE', url: 'http://x/1.ts', tvgId: 'svt1' }
const programme = { title: 'Rapport', start: 1_000_000, stop: 2_000_000 }
const NOW = 1_500_000

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
function stubRecordFetch(scheduleStatus = 200) {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    if (url.endsWith('/list')) return json({ recordings: [], folder: '/r', freeBytes: 1, keepFreeBytes: 0 })
    if (url.endsWith('/schedule')) {
      return scheduleStatus === 402
        ? json({ error: 'supporter_required', feature: 'liveTvRecording' }, 402)
        : json({ id: 'new', title: 'Rapport', channelName: 'SVT1', channelKey: 'k', playUrl: 'u', startAt: 1, stopAt: 2, status: 'recording', bytes: 0, createdAt: 0 })
    }
    return json({})
  }))
  return calls
}

beforeEach(() => {
  __resetForTests()
  __resetRecordingsForTests()
  __resetSupporterForTests()
  __resetToastsForTests()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  __resetSupporterForTests()
})

describe('supporter: när är något låst', () => {
  it('öppet utan ctx.supporter (äldre appvärd)', () => {
    installSupporterApi(undefined)
    expect(isFeatureLocked('liveTvRecording')).toBe(false)
    expect(isFeatureLocked('sportsMode')).toBe(false)
  })

  it('öppet medan statusen inte är hämtad (null), låst först när svaret säger free', async () => {
    const host = fakeHost(null)
    host.pending = true
    installSupporterApi(host)
    await flush()
    expect(isFeatureLocked('liveTvRecording')).toBe(false)
    await act(async () => { host.set('free') })
    await flush()
    expect(isFeatureLocked('liveTvRecording')).toBe(true)
  })

  it('öppet när servern inte svarar (status null)', async () => {
    installSupporterApi(fakeHost(null))
    await flush()
    expect(isFeatureLocked('sportsMode')).toBe(false)
  })

  it.each(['trial', 'plus'] as const)('öppet i %s', async (state) => {
    installSupporterApi(fakeHost(state))
    await flush()
    expect(isFeatureLocked('liveTvRecording')).toBe(false)
    expect(isFeatureLocked('sportsMode')).toBe(false)
  })

  it.each(['free', 'supporter'] as const)('låst för %s (inspelning och sport är Plus)', async (state) => {
    installSupporterApi(fakeHost(state))
    await flush()
    expect(isFeatureLocked('liveTvRecording')).toBe(true)
    expect(isFeatureLocked('sportsMode')).toBe(true)
  })

  it('useFeatureLocked ritar om när statusen ändras (subscribe)', async () => {
    const host = fakeHost('free')
    installSupporterApi(host)
    const { result } = renderHook(() => useFeatureLocked('sportsMode'))
    await waitFor(() => expect(result.current).toBe(true))
    await act(async () => { host.set('trial') })
    await waitFor(() => expect(result.current).toBe(false))
  })
})

describe('sportläget', () => {
  const railKeys = () => Array.from(document.querySelectorAll('[data-testid^="rail-"]')).map((n) => n.getAttribute('data-testid'))

  it('sportfliken finns utan ctx.supporter', () => {
    render(<TvRail active={null} onSelect={() => {}} isTv={false} narrow={false} labels />)
    expect(railKeys()).toContain('rail-sport')
  })

  it('sportfliken finns i provperioden', async () => {
    installSupporterApi(fakeHost('trial'))
    render(<TvRail active={null} onSelect={() => {}} isTv={false} narrow={false} labels />)
    await flush()
    expect(railKeys()).toContain('rail-sport')
  })

  it.each(['free', 'supporter'] as const)('sportfliken döljs tyst för %s', async (state) => {
    installSupporterApi(fakeHost(state))
    render(<TvRail active={null} onSelect={() => {}} isTv={false} narrow={false} labels />)
    await waitFor(() => expect(railKeys()).not.toContain('rail-sport'))
    expect(railKeys()).toContain('rail-guide')
  })

  it('telefonens sportflik döljs tyst för free, finns i provperioden', async () => {
    const host = fakeHost('free')
    installSupporterApi(host)
    const view = render(<MobileTabBar view="hub" onGo={() => {}} onMore={() => {}} />)
    await waitFor(() => expect(view.queryByTestId('tab-sport')).toBeNull())
    expect(view.queryByTestId('tab-guide')).not.toBeNull()
    await act(async () => { host.set('trial') })
    await waitFor(() => expect(view.queryByTestId('tab-sport')).not.toBeNull())
  })
})

describe('inspelning', () => {
  it('låst: knappen planerar inget utan förklarar, tryck två öppnar Inställningar → Supporter', async () => {
    installSupporterApi(fakeHost('free'))
    const calls = stubRecordFetch()
    const opened: unknown[] = []
    const onOpen = (e: Event) => opened.push((e as CustomEvent).detail)
    window.addEventListener('lumio-open-settings', onOpen)
    const beforeOpen = vi.fn()
    const { result } = renderHook(() => useChannelRecording(channel, programme, NOW, { beforeOpenSettings: beforeOpen }))
    await waitFor(() => expect(result.current.locked).toBe(true))
    await act(() => result.current.toggle())
    expect(result.current.error).toEqual({ kind: 'supporter' })
    expect(calls.some((u) => u.endsWith('/schedule'))).toBe(false)
    await act(() => result.current.toggle())
    expect(beforeOpen).toHaveBeenCalledTimes(1)
    expect(opened).toEqual([{ section: 'supporter' }])
    window.removeEventListener('lumio-open-settings', onOpen)
  })

  it('öppet i supporter-plus: knappen planerar', async () => {
    installSupporterApi(fakeHost('plus'))
    const calls = stubRecordFetch()
    const { result } = renderHook(() => useChannelRecording(channel, programme, NOW))
    await flush()
    expect(result.current.locked).toBe(false)
    await act(() => result.current.toggle())
    expect(calls.some((u) => u.endsWith('/schedule'))).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('öppet utan ctx.supporter, men appens 402 supporter_required blir Plus-förklaringen', async () => {
    const calls = stubRecordFetch(402)
    const { result } = renderHook(() => useChannelRecording(channel, programme, NOW))
    await flush()
    expect(result.current.locked).toBe(false)
    await act(() => result.current.toggle())
    expect(calls.some((u) => u.endsWith('/schedule'))).toBe(true)
    expect(result.current.error).toEqual({ kind: 'supporter' })
  })

  it('scheduleRecording: 402 känns igen som supporter_required', async () => {
    stubRecordFetch(402)
    const err = await scheduleRecording({ title: 't', channelName: 'c', channelKey: 'k', playUrl: 'u', startAt: 1, stopAt: 2 }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RecordRequestError)
    expect(isSupporterRequired(err)).toBe(true)
    expect(isSupporterRequired(new RecordRequestError('HTTP 500', 500, null))).toBe(false)
  })

  it('inställningarna: låst ger EN rad med lås, öppet ger inspelningens rader', async () => {
    const tt = (key: Parameters<typeof tvText>[1], vars?: Record<string, string | number>) => tvText('sv', key, vars)
    stubRecordFetch()
    installSupporterApi(fakeHost('supporter'))
    const view = render(<RecordingSettingsTvRows tvSettings={getTvSettings()} tt={tt} />)
    await waitFor(() => expect(view.queryByTestId('tv-record-locked')).not.toBeNull())
    expect(view.queryByTestId('tv-record-enabled')).toBeNull()
    expect(view.getByTestId('tv-record-locked').textContent).toContain('Inspelning är en Plus-förmån — prova gratis i 14 dagar eller bli supporter')
    // Timeshift är inte Plus och tidigare inspelningar går att öppna.
    expect(view.queryByTestId('tv-timeshift-minutes')).not.toBeNull()
    expect(view.queryByTestId('tv-record-open')).not.toBeNull()
    cleanup()
    __resetSupporterForTests()
    const open = render(<RecordingSettingsTvRows tvSettings={getTvSettings()} tt={tt} />)
    expect(open.queryByTestId('tv-record-enabled')).not.toBeNull()
    expect(open.queryByTestId('tv-record-locked')).toBeNull()
  })

  it('hållmenyn i guiden: låst post bär låset och visar förklaringen i stället för att planera', async () => {
    installSupporterApi(fakeHost('free'))
    await flush()
    const calls = stubRecordFetch()
    const nav = { play: vi.fn(), channelMenu: vi.fn() } as unknown as TvNav & { channelMenu: ReturnType<typeof vi.fn> }
    const tt = (key: Parameters<typeof tvText>[1], vars?: Record<string, string | number>) => tvText('sv', key, vars)
    const start = Date.now() + 3_600_000
    const plain: M3uChannel = { name: 'TV4', group: 'X', url: 'http://x/tv4', tvgId: null }
    holdMenu({ channel: plain, programme: { title: 'Sen', start, stop: start + 3_600_000 }, nav, nowMs: Date.now(), element: document.body, tt, locale: 'sv-SE' })
    const actions = nav.channelMenu.mock.calls[0]![2] as { key: string; label: string; run: () => void }[]
    const record = actions.find((a) => a.key === 'record')!
    expect(record.label).toContain('♥ Plus')
    record.run()
    expect(hasToasts()).toBe(true)
    expect(calls.some((u) => u.endsWith('/schedule'))).toBe(false)
  })

  it('Inspelningar-fliken: låst döljs tyst utan inspelningar, står kvar när det finns några att titta på', () => {
    const rec = { id: 'a' } as Recording
    expect(showRecordingsTab(true, false, null)).toBe(true)
    expect(showRecordingsTab(true, true, { recordings: [], folder: null, freeBytes: null, keepFreeBytes: 0 })).toBe(false)
    expect(showRecordingsTab(true, true, { recordings: [rec], folder: null, freeBytes: null, keepFreeBytes: 0 })).toBe(true)
    expect(showRecordingsTab(false, false, null)).toBe(false)
  })
})
