import { describe, expect, it } from 'vitest'
import { bufferAheadSeconds, isFiniteStreamUrl, liveBufferOpenProps, liveBufferRestartProps, nativeLiveOption, nextLiveBuffer, sanitizeLiveBuffer } from './live-buffer'

describe('live-buffer', () => {
  it('okänt värde blir snabb start', () => {
    expect(sanitizeLiveBuffer(undefined)).toBe('fast')
    expect(sanitizeLiveBuffer('nope')).toBe('fast')
    expect(sanitizeLiveBuffer('max')).toBe('max')
  })

  it('stegar runt', () => {
    expect(nextLiveBuffer('fast')).toBe('stable')
    expect(nextLiveBuffer('stable')).toBe('max')
    expect(nextLiveBuffer('max')).toBe('fast')
  })

  it('snabb start på TS är bara pausen — väntetiden är appens', () => {
    expect(liveBufferOpenProps('fast', false)).toEqual([{ name: 'cache-pause', value: 'yes' }])
    expect(liveBufferRestartProps('fast', false)).toEqual([])
  })

  it('stabil på TS: paus, läsning framåt och längre påfyllning', () => {
    expect(liveBufferOpenProps('stable', false)).toEqual([
      { name: 'cache-pause', value: 'yes' },
      { name: 'cache-secs', value: '30' },
      { name: 'demuxer-readahead-secs', value: '30' },
      { name: 'cache-pause-wait', value: '6' },
    ])
    expect(liveBufferRestartProps('max', false)).toEqual([{ name: 'cache-pause-wait', value: '12' }])
  })

  it('HLS pausas aldrig härifrån', () => {
    expect(liveBufferOpenProps('fast', true)).toEqual([])
    const props = liveBufferOpenProps('max', true)
    expect(props.some((p) => p.name === 'cache-pause' || p.name === 'cache-pause-wait')).toBe(false)
    expect(props).toContainEqual({ name: 'cache-secs', value: '60' })
    expect(liveBufferRestartProps('max', true)).toEqual([])
  })

  it('buffert framför spelhuvudet', () => {
    expect(bufferAheadSeconds(null, 10)).toBeNull()
    expect(bufferAheadSeconds({ start: 0, end: 14.5 }, 10)).toBe(4.5)
    expect(bufferAheadSeconds({ start: 0, end: 9 }, 10)).toBe(0)
  })

  it('Android: kanaler får live med påfyllningen, arkiv och film får det inte', () => {
    expect(nativeLiveOption('http://p.test/live/u/p/1.ts', 'fast')).toEqual({ rebufferMs: 0 })
    expect(nativeLiveOption('http://p.test/live/u/p/1.m3u8', 'stable')).toEqual({ rebufferMs: 6000 })
    expect(nativeLiveOption('http://cdn.test/kanal/stream', 'max')).toEqual({ rebufferMs: 12000 })
    // Catch-up och VOD har ett slut: de ska inte kopplas upp igen när de tar slut.
    expect(nativeLiveOption('http://p.test/timeshift/u/p/60/2026-11-25:20-00/1.ts', 'stable')).toBeUndefined()
    expect(nativeLiveOption('http://p.test/movie/u/p/77.mkv', 'stable')).toBeUndefined()
    expect(isFiniteStreamUrl('http://p.test/series/u/p/5.mp4?t=1')).toBe(true)
    expect(isFiniteStreamUrl('https://files.test/film.mp4')).toBe(true)
    expect(isFiniteStreamUrl('http://p.test/live/u/p/1.ts')).toBe(false)
  })
})
