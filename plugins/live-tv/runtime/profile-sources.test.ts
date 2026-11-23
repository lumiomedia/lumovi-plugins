import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetPluginStorageForTests, writePluginJson } from '@/lib/plugin-sdk'
import { profileIndexSources, profileSourcesParam, setProfileListsReader } from './profile-sources'
import { listGroups, queryChannels, searchChannels } from './index-client'
import { listVodCategories, lookupVod, queryVod } from './vod-client'

const LISTS = [
  { id: 'l1', name: 'kkz', kind: 'xtream', source: 'xtream://kkz.test/1' },
  { id: 'l2', name: 'm3u', kind: 'm3u', source: 'http://x.test/list.m3u' },
  { id: 'l3', name: 'samma', kind: 'm3u', source: 'http://x.test/list.m3u' },
  { id: 'c1', name: 'Mina', kind: 'custom', source: 'custom:c1' },
  { id: 'gammal', name: 'utan källa' },
]

function stubFetch(body: unknown) {
  const fn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({ ok: true, status: 200, json: async () => body }) as Response)
  vi.stubGlobal('fetch', fn)
  return fn
}

function params(fn: ReturnType<typeof stubFetch>, call = 0): URLSearchParams {
  return new URL(String(fn.mock.calls[call]![0]), 'http://host').searchParams
}

afterEach(() => {
  vi.unstubAllGlobals()
  setProfileListsReader(null)
  __resetPluginStorageForTests()
})

describe('profileIndexSources', () => {
  it('tar bara profilens importerade listor, en gång var', () => {
    expect(profileIndexSources(LISTS)).toEqual(['xtream://kkz.test/1', 'http://x.test/list.m3u'])
  })

  it('läser lagringen när ingen läsare registrerats, och läsaren när den finns', () => {
    writePluginJson('com.lumio.live-tv', 'lists', LISTS)
    expect(profileSourcesParam()).toBe('xtream://kkz.test/1,http://x.test/list.m3u')

    setProfileListsReader(() => [{ kind: 'm3u', source: 'http://annan.test/a.m3u' }])
    expect(profileSourcesParam()).toBe('http://annan.test/a.m3u')
  })

  it('en ny profil utan listor ger en tom mängd', () => {
    expect(profileSourcesParam()).toBe('')
  })
})

describe('"Alla spellistor" stannar i profilens egna listor', () => {
  it('kanaler, grupper och sök skickar profilens källor', async () => {
    writePluginJson('com.lumio.live-tv', 'lists', LISTS)
    const fn = stubFetch({ items: [], groups: [], total: 0, known: true })

    await queryChannels({ offset: 0, limit: 10 })
    await listGroups(null)
    await searchChannels('sport')

    for (const call of [0, 1, 2]) {
      expect(params(fn, call).get('sources')).toBe('xtream://kkz.test/1,http://x.test/list.m3u')
    }
  })

  it('en namngiven källa frågas som förut, utan urval', async () => {
    writePluginJson('com.lumio.live-tv', 'lists', LISTS)
    const fn = stubFetch({ items: [], groups: [], total: 0, known: true })

    await queryChannels({ source: 'xtream://kkz.test/1', offset: 0, limit: 10 })
    await listGroups('xtream://kkz.test/1')

    expect(params(fn, 0).has('sources')).toBe(false)
    expect(params(fn, 1).has('sources')).toBe(false)
  })

  it('en profil utan listor skickar en TOM mängd, inte ingenting', async () => {
    // Utelämnad parameter = hela det delade indexet; tom = inga träffar.
    const fn = stubFetch({ items: [], groups: [], total: 0, known: true })

    await queryChannels({ offset: 0, limit: 10 })

    expect(params(fn).get('sources')).toBe('')
  })

  it('VOD-biblioteket: sida, kategorier och uppslag', async () => {
    writePluginJson('com.lumio.live-tv', 'lists', LISTS)
    const fn = stubFetch({ items: [], categories: [], total: 0, known: true })

    await queryVod({ offset: 0, limit: 10 })
    await listVodCategories(null)
    await lookupVod(null, ['vod:1'])
    await queryVod({ source: 'xtream://kkz.test/1', offset: 0, limit: 10 })
    await lookupVod('xtream://kkz.test/1', ['vod:1'])

    const own = 'xtream://kkz.test/1,http://x.test/list.m3u'
    expect(params(fn, 0).get('sources')).toBe(own)
    expect(params(fn, 1).get('sources')).toBe(own)
    expect(JSON.parse(String(fn.mock.calls[2]![1]!.body))).toEqual({ sources: own, keys: ['vod:1'] })
    expect(params(fn, 3).has('sources')).toBe(false)
    expect(JSON.parse(String(fn.mock.calls[4]![1]!.body))).toEqual({ source: 'xtream://kkz.test/1', keys: ['vod:1'] })
  })
})
