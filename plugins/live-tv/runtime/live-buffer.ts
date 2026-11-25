/**
 * LIVEBUFFERTEN: hur mycket spelaren samlar på sig innan den fortsätter efter
 * ett stopp (2026-11-25).
 *
 * Bakgrund: en leverantör som skickar kanalen strax under realtid tömmer
 * bufferten om och om igen. Appen väntar 3 s efter ett stopp (1 s vid start,
 * mpv_embed.rs) — snabbt, men ger ett nytt stopp var 20–60:e sekund. Med mer
 * i bufferten blir stoppen färre och längre isär; priset är att bilden ligger
 * lika många sekunder efter sändningen.
 *
 * Datorn (mpv) får värdena som egenskaper efter att filen laddats. Android
 * (ExoPlayer) får påfyllningen med i öppningen (`nativeLiveOption`), från
 * appen som bär `live` i spelarbryggan; äldre appar struntar i fältet.
 *
 * Bara rena funktioner här: inställningslagret och spelaren läser samma tabell.
 */

export type LiveBuffer = 'fast' | 'stable' | 'max'

export const LIVE_BUFFERS: readonly LiveBuffer[] = ['fast', 'stable', 'max']
export const DEFAULT_LIVE_BUFFER: LiveBuffer = 'fast'

export function sanitizeLiveBuffer(raw: unknown): LiveBuffer {
  return raw === 'stable' || raw === 'max' ? raw : DEFAULT_LIVE_BUFFER
}

export function nextLiveBuffer(current: LiveBuffer): LiveBuffer {
  return LIVE_BUFFERS[(LIVE_BUFFERS.indexOf(current) + 1) % LIVE_BUFFERS.length]
}

export function liveBufferLabelKey(mode: LiveBuffer): 'liveBufferFast' | 'liveBufferStable' | 'liveBufferMax' {
  return mode === 'stable' ? 'liveBufferStable' : mode === 'max' ? 'liveBufferMax' : 'liveBufferFast'
}

/** Sekunder spelaren fyller på efter ett stopp; `null` = appens eget värde. */
export function liveBufferRefillSeconds(mode: LiveBuffer): number | null {
  return mode === 'stable' ? 6 : mode === 'max' ? 12 : null
}

/** Hur långt fram mpv läser när leverantören hinner (appens live-profil: 15/8 s). */
function readaheadSeconds(mode: LiveBuffer): number | null {
  return mode === 'stable' ? 30 : mode === 'max' ? 60 : null
}

export interface MpvProp { name: string; value: string }

/**
 * Det som sätts en gång när filen laddats.
 *
 * TS: pausa och fyll på i stället för att spela ur en tom buffert (appen kör
 * live med cache-pause=no, rätt för HLS men slowmotion på en löpande ström —
 * CL-kvällen 2026-10-13). HLS behåller appens val: segmenten rullar bort
 * under en paus, så där höjs bara läsningen framåt.
 */
export function liveBufferOpenProps(mode: LiveBuffer, hls: boolean): MpvProp[] {
  const props: MpvProp[] = []
  if (!hls) props.push({ name: 'cache-pause', value: 'yes' })
  const ahead = readaheadSeconds(mode)
  if (ahead !== null) {
    props.push({ name: 'cache-secs', value: String(ahead) })
    props.push({ name: 'demuxer-readahead-secs', value: String(ahead) })
  }
  return [...props, ...liveBufferRestartProps(mode, hls)]
}

/**
 * Det som måste sättas OM efter varje playback-restart: appen skriver
 * cache-pause-wait=3 där (mpv_embed.rs), före händelsen till webbvyn.
 */
export function liveBufferRestartProps(mode: LiveBuffer, hls: boolean): MpvProp[] {
  const wait = liveBufferRefillSeconds(mode)
  if (hls || wait === null) return []
  return [{ name: 'cache-pause-wait', value: String(wait) }]
}

/** Sekunder som ligger framför spelhuvudet i bufferten, eller null när det inte går att veta. */
export function bufferAheadSeconds(range: { start: number; end: number } | null, timePos: number): number | null {
  if (!range || !Number.isFinite(timePos) || !Number.isFinite(range.end)) return null
  return Math.max(0, range.end - timePos)
}

/**
 * Xtreams arkiv (catch-up) och VOD är FILER med ett slut, även när de spelas
 * i Live TV:s spelare: `/timeshift/u/p/min/start/id.ts`, `/movie/…`, `/series/…`.
 */
const FINITE_XTREAM_PATH = /^https?:\/\/[^/?#]+\/(timeshift|movie|series)\//i
/** En M3U-lista kan bära filmfiler som "kanaler". */
const FINITE_FILE_EXT = /\.(mp4|mkv|avi|mov|webm|m4v|mp3|flac)$/i

export function isFiniteStreamUrl(url: string): boolean {
  const trimmed = url.trim()
  return FINITE_XTREAM_PATH.test(trimmed) || FINITE_FILE_EXT.test(trimmed.split(/[?#]/)[0])
}

/**
 * `live`-fältet till Androids spelare för KANALENS egen adress, eller
 * undefined för arkiv och VOD — en fil som tar slut ska inte kopplas upp igen.
 * Avgörs på kanalens adress, inte på den som öppnas: timeshift-reläet och
 * strömproxyn är lokala adresser som inte säger vad som ligger bakom.
 */
export function nativeLiveOption(channelUrl: string, mode: LiveBuffer): { rebufferMs: number } | undefined {
  if (isFiniteStreamUrl(channelUrl)) return undefined
  return { rebufferMs: (liveBufferRefillSeconds(mode) ?? 0) * 1000 }
}
