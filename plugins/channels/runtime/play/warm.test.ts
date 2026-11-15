import { describe, expect, it } from 'vitest'
import { prefetchUrlFor, warmUrlFor } from './warm'

const desk = { androidDirect: false }

describe('förvärmning av filens huvud och index', () => {
  it('WebDAV via appens proxy: proxyns förvärmning med samma källa och sökväg', () => {
    const url = 'http://127.0.0.1:3011/api/webdav-library/stream?source=abc&path=%2FFilm%2FA.mkv&library=webdav'
    expect(warmUrlFor({ url }, 'library', desk)).toBe('/api/webdav-library/warm?source=abc&path=%2FFilm%2FA.mkv&library=webdav')
    // Även på Android: proxyn används där också.
    expect(warmUrlFor({ url }, 'library', { androidDirect: true })).toMatch(/^\/api\/webdav-library\/warm\?/)
  })

  it('Plex/Jellyfin/Emby: källcachens förvärmning, med serverns headers', () => {
    const plex = 'http://192.168.1.10:32400/library/parts/1/file.mkv?X-Plex-Token=t'
    expect(warmUrlFor({ url: plex }, 'library', desk)).toBe(`/api/source-cache/warm?u=${encodeURIComponent(plex)}`)
    const emby = 'https://emby.example/Videos/1/stream.mkv'
    expect(warmUrlFor({ url: emby, requestHeaders: { Referer: 'x' } }, 'library', desk))
      .toBe(`/api/source-cache/warm?u=${encodeURIComponent(emby)}&h=${encodeURIComponent('{"Referer":"x"}')}`)
  })

  it('aldrig strömuppslag (resolverns anropsgräns), aldrig live, inte Android utan källcache', () => {
    expect(warmUrlFor({ url: 'https://addon.example/resolve/k/h/1/x.mkv' }, 'stream', desk)).toBeNull()
    expect(warmUrlFor({ url: 'http://iptv.example/live/u/p/1.m3u8' }, 'library', desk)).toBeNull()
    expect(warmUrlFor({ url: 'https://emby.example/Videos/1/stream.mkv' }, 'library', { androidDirect: true })).toBeNull()
    expect(warmUrlFor({ url: 'file:///x.mkv' }, 'library', desk)).toBeNull()
  })

  it('direktströmning: spelaren förhämtar upplösta filer, aldrig strömuppslag, live eller WebDAV-proxyn', () => {
    const direct = { androidDirect: true }
    const plex = 'http://192.168.1.10:32400/library/parts/1/file.mkv?X-Plex-Token=t'
    expect(prefetchUrlFor({ url: plex }, 'library', direct)).toBe(plex)
    expect(prefetchUrlFor({ url: 'https://addon.example/resolve/k/h/1/x.mkv' }, 'stream', direct)).toBeNull()
    expect(prefetchUrlFor({ url: 'http://iptv.example/live/u/p/1.m3u8' }, 'library', direct)).toBeNull()
    expect(prefetchUrlFor({ url: 'http://127.0.0.1:3011/api/webdav-library/stream?source=a&path=x' }, 'library', direct)).toBeNull()
    expect(prefetchUrlFor({ url: plex }, 'library', desk)).toBeNull()
  })
})
