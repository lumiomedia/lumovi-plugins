'use client'

import { createElement, useSyncExternalStore, type ComponentType } from 'react'

/*
  SUPPORTERNIVÅN (Lumovi) — appens `ctx.supporter?`, sedd från Live TV.

  Två funktioner här är Plus: inspelning (`liveTvRecording`) och sportläget
  (`sportsMode`). Regeln (samma som kärnans):
   · `ctx.supporter` saknas (värd från före supportermodulen) → allt öppet.
   · Statusen inte hämtad än (eller servern svarar inte) → öppet. En funktion
     ska inte blinka till "låst" vid start för någon med provperiod.
   · Rader/flikar döljs TYST när de är låsta; knappar och inställningar visas
     med lås och förklarar varför.
  Appens `hasFeature` är synkron och false tills statusen är hämtad, så
  "känd" spåras här: först när `status()` gett ett svar räknas ett false
  som låst. `subscribe` ritar om när statusen ändras.
*/

export type LiveTvSupporterFeature = 'liveTvRecording' | 'sportsMode'

/** Det pluginet använder ur appens `PluginSupporterApi`. */
export interface SupporterApiLike {
  status(): Promise<unknown | null>
  hasFeature(id: string): boolean
  subscribe(listener: () => void): () => void
}

let api: SupporterApiLike | null = null
let known = false
let unsubscribe: (() => void) | null = null
const listeners = new Set<() => void>()
const emit = () => { for (const l of [...listeners]) l() }

function load(target: SupporterApiLike): void {
  let pending: Promise<unknown | null>
  try {
    pending = target.status()
  } catch {
    return
  }
  void Promise.resolve(pending).then(
    (status) => {
      if (api !== target) return
      known = status !== null && status !== undefined
      emit()
    },
    () => {},
  )
}

/** Anropas från `register(ctx)` med `ctx.supporter` (undefined på äldre värdar). */
export function installSupporterApi(next: SupporterApiLike | null | undefined): void {
  unsubscribe?.()
  unsubscribe = null
  api = next && typeof next.hasFeature === 'function' && typeof next.status === 'function' ? next : null
  known = false
  emit()
  const target = api
  if (!target) return
  if (typeof target.subscribe === 'function') {
    try {
      unsubscribe = target.subscribe(() => {
        // Värdens ögonblicksbild är redan ny: rita om direkt, och läs om
        // statusen (null efter utloggning → öppet tills den är hämtad igen).
        emit()
        load(target)
      })
    } catch {
      unsubscribe = null
    }
  }
  load(target)
}

/** Låst = värden har en känd status som inte räcker för funktionen. */
export function isFeatureLocked(feature: LiveTvSupporterFeature): boolean {
  if (!api || !known) return false
  try {
    return !api.hasFeature(feature)
  } catch {
    return false
  }
}

export function onSupporterChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useFeatureLocked(feature: LiveTvSupporterFeature): boolean {
  return useSyncExternalStore(onSupporterChanged, () => isFeatureLocked(feature), () => false)
}

/**
 * En bakgrundsmontering som hör till en Plus-funktion (sportens målnotiser,
 * sportens Soffläge-yta): monteras bara när funktionen inte är låst.
 */
export function gatedMount(feature: LiveTvSupporterFeature, Mount: ComponentType): ComponentType {
  function PlusGatedMount() {
    return useFeatureLocked(feature) ? null : createElement(Mount)
  }
  PlusGatedMount.displayName = `PlusGated(${Mount.displayName ?? Mount.name ?? 'Mount'})`
  return PlusGatedMount
}

/** Appens Inställningar → Supporter (samma händelse som pluginets andra djuplänkar in i inställningarna). */
export function openSupporterSettings(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('lumio-open-settings', { detail: { section: 'supporter' } }))
}

/** Tester: tillbaka till "ingen värd-API". */
export function __resetSupporterForTests(): void {
  unsubscribe?.()
  unsubscribe = null
  api = null
  known = false
  listeners.clear()
}
