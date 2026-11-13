import { afterEach, describe, expect, it, vi } from 'vitest'
import { installBundledCatalogs, type CatalogLoader } from './sky-data.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('bundled sky catalogs', () => {
  it('serves every bundled catalog without fetching through the tunnel', async () => {
    const network = vi.fn(() => { throw new Error('Bad Gateway') })
    const loader: CatalogLoader = { json: network }
    installBundledCatalogs(loader)
    const files = import.meta.glob('../public/sky-data/*.json')

    expect(Object.keys(files).length).toBeGreaterThanOrEqual(9)
    for (const path of Object.keys(files)) {
      const callback = vi.fn()
      loader.json(path.replace('../public', ''), callback)
      await Promise.resolve()
      expect(callback).toHaveBeenCalledWith(null, expect.any(Object))
    }
    expect(network).not.toHaveBeenCalled()
  })

  it('provides independent copies and preserves unrelated D3 requests', async () => {
    const network = vi.fn()
    const loader = { json: network }
    installBundledCatalogs(loader)
    const first = vi.fn()
    const second = vi.fn()
    loader.json('/sky-data/mw.json', first)
    loader.json('/sky-data/mw.json', second)
    await Promise.resolve()
    expect(first.mock.calls[0][1]).toEqual(second.mock.calls[0][1])
    expect(first.mock.calls[0][1]).not.toBe(second.mock.calls[0][1])
    loader.json('/other.json', first)
    expect(network).toHaveBeenCalledWith('/other.json', first)
  })

  it('preserves catalog coordinates for the renderer to reflect exactly once', async () => {
    const loader: CatalogLoader = { json: vi.fn() }
    installBundledCatalogs(loader)
    const callback = vi.fn()
    loader.json('/sky-data/stars.6.json', callback)
    await Promise.resolve()

    const geometry = callback.mock.calls[0][1].features[0].geometry
    expect(geometry.coordinates[0]).toBe(0.2691)
    expect(geometry.coordinates[1]).toBe(-48.8099)
  })

  it('lets the renderer handle the location-based zenith without a second reflection', async () => {
    const chart = {
      display: vi.fn(),
      rotate: vi.fn(),
      skyview: vi.fn(),
      zenith: vi.fn(() => [120, 45, 0] as [number, number, number]),
    }
    vi.stubGlobal('window', { Celestial: chart, d3: { json: vi.fn() } })
    const { setSkyLocation } = await import('./sky-map.ts')
    const date = new Date('2026-11-13T20:00:00Z')

    setSkyLocation({ latitude: 32, longitude: 34 }, date)

    expect(chart.skyview).toHaveBeenCalledWith({ date, location: [32, 34], timezone: -date.getTimezoneOffset() })
    expect(chart.rotate).not.toHaveBeenCalled()
  })

  it('initializes once and rotates repeatedly without catalog network requests', async () => {
    const network = vi.fn()
    const loader = { json: network }
    const callback = vi.fn()
    const chart = {
      display: vi.fn(() => loader.json('/sky-data/mw.json', callback)),
      rotate: vi.fn(),
      skyview: vi.fn(),
      zenith: vi.fn(() => [120, 45, 0]),
    }
    vi.stubGlobal('window', { Celestial: chart, d3: loader })
    const { initializeSkyMap, setSkyCenter } = await import('./sky-map.ts')
    initializeSkyMap()
    initializeSkyMap()
    for (let heading = 0; heading < 360; heading += 10) {
      setSkyCenter({ rightAscension: heading, declination: 30 })
    }
    await Promise.resolve()
    expect(chart.display).toHaveBeenCalledTimes(1)
    expect(chart.display).toHaveBeenCalledWith(expect.objectContaining({
      projection: 'stereographic',
      follow: 'center',
      disableAnimations: true,
    }))
    expect(chart.rotate).toHaveBeenCalledTimes(36)
    expect(chart.rotate).toHaveBeenNthCalledWith(2, { center: [10, 30, 0] })
    setSkyCenter({ rightAscension: 120, declination: 30, roll: -90 })
    expect(chart.rotate).toHaveBeenLastCalledWith({ center: [120, 30, -90] })
    expect(callback).toHaveBeenCalledWith(null, expect.any(Object))
    expect(network).not.toHaveBeenCalled()
  })
})