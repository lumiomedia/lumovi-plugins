/**
 * Profilens egna källor i värdens Live TV-index.
 *
 * Kanalindexet, VOD-biblioteket och sportens kandidater delas mellan profiler
 * i värden. En fråga utan `source` ("Alla spellistor") svarade förr med VARJE
 * profils källor, så en ny profil utan listor såg en annan profils kanaler och
 * filmer. Klienterna skickar därför `sources=<id>,<id>` med profilens egna
 * indexerade listor — per fråga, eftersom telefoner i nätverket kan köra var
 * sin profil samtidigt. Äldre appar ignorerar den okända parametern.
 *
 * Indexerbar = importerad lista (m3u/Xtream) med en källa. Handgjorda listor
 * (`kind === 'custom'`) har sina kanaler i listan, aldrig i indexet.
 *
 * Beroendefri MED FLIT: `live-tv-data` importerar `index-client` och
 * `vod-client`, så de får inte importera `live-tv-data` tillbaka (cykel).
 * `live-tv-data` registrerar i stället sin listläsare här när den laddas; tills
 * dess läses lagringens rådata med samma regel.
 */

import { readPluginJson } from '@/lib/plugin-sdk'

interface ListLike {
  kind?: unknown
  source?: unknown
}

let listsReader: (() => ListLike[]) | null = null

/** Anropas av `live-tv-data` med `getLiveTvLists` (som klassar äldre listor). */
export function setProfileListsReader(reader: (() => ListLike[]) | null): void {
  listsReader = reader
}

function readRawLists(): ListLike[] {
  const parsed = readPluginJson<unknown>('com.lumio.live-tv', 'lists', [])
  return Array.isArray(parsed)
    ? parsed.filter((entry): entry is ListLike => Boolean(entry) && typeof entry === 'object')
    : []
}

export function profileIndexSources(lists: ListLike[] = listsReader ? listsReader() : readRawLists()): string[] {
  const out: string[] = []
  for (const list of lists) {
    if (list.kind === 'custom' || typeof list.source !== 'string' || list.source.length === 0) continue
    if (!out.includes(list.source)) out.push(list.source)
  }
  return out
}

/** Värdet till `sources`-parametern. Tom sträng = profilen har inga källor. */
export function profileSourcesParam(): string {
  return profileIndexSources().join(',')
}
