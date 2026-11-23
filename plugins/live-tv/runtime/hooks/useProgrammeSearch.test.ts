import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act, cleanup } from '@testing-library/react'
import type { EpgProgramme } from '../epg/types'

vi.mock('../index-client', () => ({
  epgSearch: vi.fn(async () => [] as { key: string; programme: EpgProgramme }[]),
  lookupChannels: vi.fn(async () => []),
}))

vi.mock('../live-tv-model', () => ({
  loadChannelsShared: vi.fn(async () => []),
}))

import { epgSearch, lookupChannels } from '../index-client'
import { loadChannelsShared } from '../live-tv-model'
import { useProgrammeSearch } from './useProgrammeSearch'
import { __resetChannelResolverForTests } from '../channel-resolver'

const KEY = 'Sky::http://x/sky'
const channel = { name: 'Sky', logo: null, group: 'Sport', url: 'http://x/sky', tvgId: null, key: KEY, number: 1, tvgIdResolved: null }
const programme = { title: 'Golf Tonight', start: 1000, stop: 2000 }

beforeEach(() => {
  __resetChannelResolverForTests()
  vi.mocked(epgSearch).mockReset()
  vi.mocked(lookupChannels).mockReset()
  vi.mocked(epgSearch).mockResolvedValue([])
  vi.mocked(lookupChannels).mockResolvedValue([])
  vi.mocked(loadChannelsShared).mockReset()
  vi.mocked(loadChannelsShared).mockResolvedValue([channel])
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useProgrammeSearch', () => {
  it('tom fråga söker inte', () => {
    const { result } = renderHook(() => useProgrammeSearch('  ', 0, 86_400_000))
    expect(result.current).toEqual({ hits: [], loading: false })
    expect(epgSearch).not.toHaveBeenCalled()
  })

  it('söker i appen och löser kanalen bakom träffens nyckel', async () => {
    vi.mocked(epgSearch).mockResolvedValue([{ key: KEY, programme }])
    vi.mocked(lookupChannels).mockResolvedValue([channel])
    const { result } = renderHook(() => useProgrammeSearch('golf', 0, 86_400_000))
    await waitFor(() => expect(result.current.hits).toHaveLength(1))
    expect(result.current.hits[0].channel.name).toBe('Sky')
    expect(result.current.hits[0].programme.title).toBe('Golf Tonight')
    expect(lookupChannels).toHaveBeenCalledWith([KEY])
  })

  it('en träff på en kanal som inte finns i profilens listor visas inte', async () => {
    // Indexet och tablån delas mellan profiler (Jerry 2026-11-23).
    vi.mocked(loadChannelsShared).mockResolvedValue([])
    vi.mocked(epgSearch).mockResolvedValue([{ key: KEY, programme }])
    vi.mocked(lookupChannels).mockResolvedValue([channel])
    const { result } = renderHook(() => useProgrammeSearch('golf', 0, 86_400_000))
    await waitFor(() => expect(lookupChannels).toHaveBeenCalled())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hits).toHaveLength(0)
  })

  it('debouncar 150 ms: en snabb serie tangenttryck ger EN sökning', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(epgSearch).mockResolvedValue([])
    const { rerender } = renderHook(({ q }: { q: string }) => useProgrammeSearch(q, 0, 86_400_000), {
      initialProps: { q: 'g' },
    })
    rerender({ q: 'go' })
    rerender({ q: 'gol' })
    rerender({ q: 'golf' })
    expect(epgSearch).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    await waitFor(() => expect(epgSearch).toHaveBeenCalledTimes(1))
    expect(vi.mocked(epgSearch).mock.calls[0][1]).toBe('golf')
  })
})
