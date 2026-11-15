import { pushToast } from '../toast-center'
import { openSupporterSettings, type LiveTvSupporterFeature } from '../supporter'
import { tvText, type TvStringKey } from './tv-strings'

/*
  LÅSTA PLUS-KNAPPAR — förklaringen. En knapp som är låst gör ingenting
  annat än att säga varför, med en knapp till appens Inställningar →
  Supporter. Notisen (toast-center) är fjärrbar på TV och nås överallt
  (glasmenyer, hållmenyn i guiden, telefonens ark).
*/

export function plusLockedTitleKey(feature: LiveTvSupporterFeature): TvStringKey {
  return feature === 'sportsMode' ? 'plusSportLocked' : 'plusRecordingLocked'
}

/** Etiketten på en låst knapp/menypost: "Spela in · ♥ Plus". */
export function plusLockedLabel(label: string, lang: string | undefined): string {
  return `${label} · ${tvText(lang, 'plusBadge')}`
}

/**
 * Visar förklaringen. `beforeOpen` körs innan Inställningar öppnas — spelaren
 * ligger över appen och måste stängas först.
 */
export function showPlusLocked(lang: string | undefined, feature: LiveTvSupporterFeature, beforeOpen?: () => void): void {
  pushToast({
    key: `plus-locked:${feature}`,
    kicker: tvText(lang, 'plusBadge'),
    title: tvText(lang, plusLockedTitleKey(feature)),
    body: tvText(lang, 'plusLockedBody'),
    watchLabel: tvText(lang, 'plusOpenSupporter'),
    onWatch: () => {
      beforeOpen?.()
      openSupporterSettings()
    },
    dismissLabel: tvText(lang, 'plusClose'),
    timeoutMs: 12_000,
  })
}
