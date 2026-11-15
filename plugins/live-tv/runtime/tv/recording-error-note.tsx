'use client'

import { formatBytes } from '../recordings'
import type { RecordingError } from '../use-channel-recording'
import { TV } from './tv-ui'
import type { TvStringKey } from './tv-strings'

type TT = (key: TvStringKey, vars?: Record<string, string | number>) => string

/**
 * Varför inspelningen inte startade, vid knappen i sex sekunder. 507 från
 * appen = disken ligger redan under marginalen (Jerry 2026-11-10: Mi TV med
 * 1,5 GB ledigt fick "disk full" med noll byte och bara Radera).
 */
export function RecordingErrorNote({ error, ps, tt, onOpenSupporter }: { error: RecordingError; ps: (n: number) => number; tt: TT; onOpenSupporter?: () => void }) {
  if (error.kind === 'supporter') return <PlusLockedNote ps={ps} tt={tt} onOpenSupporter={onOpenSupporter} />
  const text = error.kind === 'noSpace'
    ? tt('recNoSpace', { free: formatBytes(error.freeBytes, 'en'), keep: formatBytes(error.keepFreeBytes, 'en') })
    : tt('recStartFailed')
  return (
    <div data-testid="rec-error" role="status" style={{ marginBottom: ps(10), padding: `${ps(8)}px ${ps(12)}px`, borderRadius: ps(10), background: 'rgba(255,92,92,0.16)', border: '1px solid rgba(255,92,92,0.45)', color: TV.text, fontSize: ps(15), maxWidth: ps(640) }}>
      {text}
    </div>
  )
}

/**
 * Inspelning är Plus: förklaringen vid knappen. På TV nås ingen knapp här
 * utan att fokus flyttas, så samma inspelningsknapp en gång till öppnar
 * Inställningar → Supporter; mus och finger får dessutom en egen knapp.
 */
function PlusLockedNote({ ps, tt, onOpenSupporter }: { ps: (n: number) => number; tt: TT; onOpenSupporter?: () => void }) {
  return (
    <div data-testid="rec-plus-locked" role="status" style={{ marginBottom: ps(10), padding: `${ps(10)}px ${ps(14)}px`, borderRadius: ps(10), background: 'rgba(0,0,0,0.6)', border: `1px solid ${TV.line}`, color: TV.text, fontSize: ps(15), maxWidth: ps(640), display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: ps(6) }}>
      <span style={{ fontWeight: 600 }}>{tt('plusRecordingLocked')}</span>
      <span style={{ opacity: 0.8 }}>{tt('plusPressAgain')}</span>
      {onOpenSupporter ? (
        <button type="button" data-testid="rec-plus-open" onPointerDown={(event) => event.stopPropagation()} onClick={onOpenSupporter} style={{ marginTop: ps(2), padding: `${ps(6)}px ${ps(12)}px`, borderRadius: ps(8), border: 'none', background: TV.acc, color: '#fff', fontWeight: 600, fontSize: ps(14), cursor: 'pointer' }}>
          {tt('plusOpenSupporter')}
        </button>
      ) : null}
    </div>
  )
}
