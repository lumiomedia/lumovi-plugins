import type { LumioPlugin } from '@/lib/plugin-sdk'
import { HomeKitSettingsSection } from './homekit-settings-section'

export const HomeKitPlugin: LumioPlugin = {
  id: 'com.lumio.homekit',
  name: { en: 'Apple Home', sv: 'Apple Hem', de: 'Apple Home', fr: 'Apple Maison', es: 'Apple Casa' },
  version: '0.1.1',
  description: {
    en: 'Works with Apple Home: connect Lumio playback events to Apple Home scenes and automations.',
    sv: 'Fungerar med Apple Hem: koppla Lumios uppspelningshändelser till scener och automationer i Apple Hem.',
    de: 'Funktioniert mit Apple Home: Verbinde Lumio-Wiedergabeereignisse mit Szenen und Automationen in Apple Home.',
    fr: 'Compatible avec Apple Maison : associez les événements de lecture de Lumio aux scènes et automatisations d’Apple Maison.',
    es: 'Compatible con Apple Casa: vincula los eventos de reproducción de Lumio con escenas y automatizaciones de Apple Casa.',
  },
  preinstalled: true,

  register(ctx) {
    ctx.registerSettingsSection({
      id: 'homekit',
      label: { en: 'Apple Home', sv: 'Apple Hem', de: 'Apple Home', fr: 'Apple Maison', es: 'Apple Casa' },
      Section: HomeKitSettingsSection,
    })
  },
}
