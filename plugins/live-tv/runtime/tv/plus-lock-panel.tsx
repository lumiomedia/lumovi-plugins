'use client'

import { openSupporterSettings, type LiveTvSupporterFeature } from '../supporter'
import { plusLockedTitleKey } from './plus-lock'
import { useTvText } from './tv-strings'
import { Icons, TV, dp, station } from './tv-ui'

/**
 * En hel yta som är Plus (sportvyn, sportens inställningar) när den är låst:
 * förklaringen och en knapp till appens Inställningar → Supporter. Knappen
 * är en station (`data-init`), så fjärren landar på den direkt.
 */
export function PlusLockedPanel({ feature, phone = false }: { feature: LiveTvSupporterFeature; phone?: boolean }) {
  const { tt } = useTvText()
  const px = (n: number) => (phone ? n : dp(n))
  return (
    <div data-testid={`plus-locked-${feature}`} role="group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: px(12), padding: px(phone ? 16 : 24), margin: phone ? 0 : px(24), borderRadius: px(16), border: `1px solid ${TV.lineCard}`, background: TV.s05, color: TV.text, maxWidth: px(640) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: px(10), fontSize: px(phone ? 15 : 20), fontWeight: 600 }}>
        <Icons.Lock size={px(phone ? 16 : 20)} />
        <span>{tt('plusBadge')}</span>
      </div>
      <div style={{ fontSize: px(phone ? 16 : 22), fontWeight: 600, lineHeight: 1.3 }}>{tt(plusLockedTitleKey(feature))}</div>
      <div style={{ fontSize: px(phone ? 14 : 17), color: TV.muted, lineHeight: 1.4 }}>{tt('plusLockedBody')}</div>
      <div
        {...station(openSupporterSettings, undefined, { 'data-testid': `plus-locked-open-${feature}`, 'data-init': '', 'aria-label': tt('plusOpenSupporter') })}
        style={{ minHeight: px(44), padding: `0 ${px(18)}px`, borderRadius: px(10), display: 'inline-flex', alignItems: 'center', fontSize: px(phone ? 15 : 17), fontWeight: 600, cursor: 'pointer', background: TV.acc, color: '#fff' }}
      >
        {tt('plusOpenSupporter')}
      </div>
    </div>
  )
}
