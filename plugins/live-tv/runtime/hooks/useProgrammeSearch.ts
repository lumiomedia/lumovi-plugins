'use client'

import { useEffect, useRef, useState } from 'react'
import { epgSearch } from '../index-client'
import { resolveChannelKeys } from '../channel-resolver'
import { channelKey, getLiveTvLists, LIVE_TV_GLOBAL_EPG_ID, type M3uChannel } from '../live-tv-data'
import { loadChannelsShared } from '../live-tv-model'
import type { EpgProgramme } from '../epg/types'

export interface ProgrammeSearchHit {
  channel: M3uChannel
  programme: EpgProgramme
}

export interface ProgrammeSearchResult {
  hits: ProgrammeSearchHit[]
  loading: boolean
}

/** Kortare än ett bekvämt tryckintervall på fjärrkontrollen: den som slutat skriva ser svaret som omedelbart. */
const DEBOUNCE_MS = 150

const EMPTY: ProgrammeSearchHit[] = []

/** Nycklarna i profilens egna listor: indexerade källor plus manuella listor. */
async function profileChannelKeys(): Promise<Set<string>> {
  const keys = new Set((await loadChannelsShared(null)).map((channel) => channel.key))
  for (const list of getLiveTvLists()) {
    for (const channel of list.channels ?? []) keys.add(channelKey(channel))
  }
  return keys
}

/**
 * Sökning i PROGRAM (spec 4.2) — appen söker, webviewn ritar.
 *
 * Tidigare gick sökningen igenom hela dagens tablå för varje kanal i minnet;
 * med tablån i appen är det ett anrop (`/epg/search`) som lämnar
 * `{ key, programme }`. Kanalerna bakom nycklarna slås upp i samma svep
 * (`resolveChannelKeys`), så en träff på en kanal utanför den laddade
 * uppsättningen ändå kan ritas och öppnas.
 *
 * Fördröjningen ligger kvar (150 ms): på TV skrivs frågan en bokstav i taget
 * och varje bokstav ska inte bli ett anrop. En GENERATIONSRÄKNARE ser till att
 * ett långsamt svar på en gammal fråga aldrig skriver över ett nyare.
 */
export function useProgrammeSearch(
  query: string,
  dayStart: number,
  dayEnd: number,
  opts?: { listId?: string | null; limit?: number },
): ProgrammeSearchResult {
  const listId = opts?.listId === undefined ? LIVE_TV_GLOBAL_EPG_ID : opts.listId
  const limit = opts?.limit ?? 30
  const [state, setState] = useState<ProgrammeSearchResult>(() => ({ hits: EMPTY, loading: false }))
  const generation = useRef(0)

  useEffect(() => {
    const q = query.trim()
    const mine = ++generation.current
    if (!listId || q.length === 0) {
      setState({ hits: EMPTY, loading: false })
      return
    }
    setState((prev) => ({ hits: prev.hits, loading: true }))
    const timer = window.setTimeout(() => {
      epgSearch(listId, q, dayStart, dayEnd, limit)
        .then(async (items) => {
          const [channels, owned] = await Promise.all([
            resolveChannelKeys(items.map((item) => item.key)),
            profileChannelKeys(),
          ])
          // Tablån och indexet delas mellan profiler: bara kanaler ur den
          // här profilens egna listor får bli träffar.
          const byKey = new Map(channels
            .filter((channel) => owned.has(channel.key))
            .map((channel) => [channel.key, channel as M3uChannel]))
          const hits: ProgrammeSearchHit[] = []
          for (const item of items) {
            const channel = byKey.get(item.key)
            if (channel) hits.push({ channel, programme: item.programme })
          }
          hits.sort((left, right) => left.programme.start - right.programme.start)
          if (generation.current === mine) setState({ hits, loading: false })
        })
        .catch(() => {
          if (generation.current === mine) setState({ hits: EMPTY, loading: false })
        })
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [query, dayStart, dayEnd, listId, limit])

  return state
}
