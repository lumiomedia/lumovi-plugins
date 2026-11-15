'use client'

import type { JSX, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { Icons, dp, station } from './tv-ui'
import { useTvText } from './tv-strings'
import { V2 } from './v2-tokens'

/**
 * FÄST KANAL I GUIDEN (Reddit-önskemålet "keep the channel on one channel
 * while I scroll through the guide").
 *
 * Förhandsvisningen i guidens hero följer annars den markerade raden — varje
 * fokusflytt (och varje hovring på skrivbordet) byter kanal i rutan efter
 * 300 ms. Klick/OK på kanalcellen fäster kanalen: rutan står kvar på den,
 * raden ritas överst i listan (utanför rullningen) med accentkant, och
 * originalraden tonas. Klick/OK på kanalcellen igen, Bakåt på den fästa raden
 * eller "Lossa" lossar.
 *
 * Fästet är vy-state i guideskalet: det överlever lägesbyten, kategoribyten
 * och fullskärmsspelaren (guiden står kvar under den), men inte att guiden
 * stängs — samma livslängd som markeringen och fönstret. Bara tipset om hur
 * man lossar sparas (en gång per profil).
 *
 * Egen fil utan beroenden på vyerna: vyerna importerar hit, aldrig tvärtom
 * (importcykelfällan).
 */

const ACCENT = 'rgb(var(--accent-500))'
const accentMix = (pct: number) => `color-mix(in srgb, rgb(var(--accent-500)) ${pct}%, transparent)`

/** Radens fästläge: den fästa raden överst, originalraden i listan, eller ingenting. */
export type PinState = 'none' | 'sticky' | 'origin'

/** Attributet på den fästa radens ram — Bakåt, fokusflyttar och frågor skiljer på raderna med det. */
export const PINNED_ROW_ATTR = 'data-guide-pinned-row'
/** Kanalcellens station (fäst/lossa). */
export const CHANNEL_CELL_ATTR = 'data-guide-channel-cell'

export function inPinnedRow(el: Element | null | undefined): boolean {
  return Boolean(el?.closest(`[${PINNED_ROW_ATTR}]`))
}

/** Ramens padding + kant: ramen dras ut lika mycket så radens celler står i samma kolumner som listans. */
const FRAME_INSET = 6

/** Originalraden tonas så kanalen inte syns som två likvärdiga rader. */
export const PIN_ORIGIN_OPACITY = 0.4

/**
 * Ramen runt den fästa raden: accentkant, en etikettrad med nål + "Fäst" och
 * hjälptext, och på skrivbordet en Lossa-knapp. Ligger mellan vyns rubrik och
 * rullningslådan, så den står still medan listan rullar.
 */
export function GuidePinnedFrame({ isTv, onUnpin, children }: { isTv: boolean; onUnpin(): void; children: ReactNode }): JSX.Element {
  const { tt } = useTvText()
  return (
    <div
      data-testid="guide-pinned-row"
      {...{ [PINNED_ROW_ATTR]: '' }}
      style={{ flexShrink: 0, margin: `${dp(6)}px -${dp(FRAME_INSET)}px`, padding: dp(4), borderRadius: dp(16), border: `2px solid ${ACCENT}`, boxShadow: `0 0 18px ${accentMix(30)}`, background: accentMix(8), boxSizing: 'border-box' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: dp(10), minHeight: dp(30), padding: `0 ${dp(10)}px ${dp(4)}px`, fontSize: dp(14), color: V2.accText }}>
        <span style={{ display: 'inline-flex' }}><Icons.Pin size={dp(16)} filled /></span>
        <span style={{ fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{tt('guidePinnedLabel')}</span>
        <span style={{ color: V2.text3, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isTv ? tt('guidePinnedHelpTv') : tt('guidePinnedHelp')}</span>
        {isTv ? null : (
          <div
            data-testid="guide-unpin"
            {...station(onUnpin, undefined, { 'data-v2f': 'btn' })}
            style={{ marginLeft: 'auto', height: dp(28), padding: `0 ${dp(14)}px`, borderRadius: 999, background: 'rgba(252,252,255,0.12)', color: V2.text, display: 'inline-flex', alignItems: 'center', gap: dp(6), fontSize: dp(14), cursor: 'pointer', flexShrink: 0 }}
          >
            {tt('guideUnpin')}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

/** Radernas ordning i vyn (den fästa först, sedan listan) — samma som DOM:en. */
function viewRows(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-guide-v2-row]'))
}

/** Samma slags cell i en annan rad: samma testid, annars radens nu-station, annars första stationen. */
function matchingCell(row: HTMLElement, origin: HTMLElement): HTMLElement | null {
  if (origin.hasAttribute(CHANNEL_CELL_ATTR)) return row.querySelector<HTMLElement>(`[${CHANNEL_CELL_ATTR}]`)
  const testId = origin.dataset.testid
  const same = testId ? row.querySelector<HTMLElement>(`[data-testid="${testId}"][data-f]`) : null
  return same ?? row.querySelector<HTMLElement>('[data-now-station]') ?? row.querySelector<HTMLElement>(`[data-f]:not([${CHANNEL_CELL_ATTR}])`)
}

/**
 * Vyns pilar runt kanalcellen och den fästa raden, som capture på vyns rot:
 *
 * - Kanalcellen: ▸ → radens nu-cell, ◂ → `onLeftEdge` (kategorierna), ▲▼ →
 *   grannradens kanalcell (den fästa raden räknas — den står först).
 * - `rowJump` (Nu/Sen, Kanallista — där appens fokusmotor annars tar ▲▼):
 *   ▲ från listans första rad → den fästa raden, ▼ från den fästa → listans
 *   första. Övriga ▲▼ rörs inte. Tablån har egen ▲▼ (`vertical`) som redan
 *   går över den fästa raden, eftersom den ligger först i DOM:en.
 */
export function guidePinKeyDown(
  event: ReactKeyboardEvent<HTMLElement>,
  root: HTMLElement | null,
  opts: { onLeftEdge?: () => boolean; rowJump: boolean },
): void {
  if (!root || !event.key.startsWith('Arrow')) return
  const target = event.target as HTMLElement
  const row = target.closest<HTMLElement>('[data-guide-v2-row]')
  if (!row || !root.contains(row)) return
  const stop = () => { event.preventDefault(); event.stopPropagation() }
  const rows = viewRows(root)
  const index = rows.indexOf(row)

  if (target.hasAttribute(CHANNEL_CELL_ATTR)) {
    if (event.key === 'ArrowRight') {
      const next = row.querySelector<HTMLElement>('[data-now-station]') ?? row.querySelector<HTMLElement>(`[data-f]:not([${CHANNEL_CELL_ATTR}])`)
      if (next) { next.focus(); stop() }
      return
    }
    if (event.key === 'ArrowLeft') {
      if (opts.onLeftEdge?.()) stop()
      return
    }
    const neighbour = rows[index + (event.key === 'ArrowDown' ? 1 : -1)]
    const cell = neighbour?.querySelector<HTMLElement>(`[${CHANNEL_CELL_ATTR}]`)
    if (cell) { cell.focus(); stop() }
    return
  }

  if (!opts.rowJump || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
  const neighbour = rows[index + (event.key === 'ArrowDown' ? 1 : -1)]
  if (!neighbour || (!inPinnedRow(row) && !inPinnedRow(neighbour))) return
  const cell = matchingCell(neighbour, target)
  if (cell) { cell.focus(); stop() }
}

/**
 * Kanalcellens station (fäst/lossa): `data-v2f="inset"` ger guidens fokusring.
 * Etiketten säger vad OK gör, för skärmläsare och verktygstips.
 */
export function pinCellProps(onToggle: () => void, pinned: boolean, label: string): Record<string, unknown> {
  return {
    ...station(onToggle, undefined, { 'data-v2f': 'inset', [CHANNEL_CELL_ATTR]: '' }),
    'aria-pressed': pinned,
    'aria-label': label,
    title: label,
  }
}
