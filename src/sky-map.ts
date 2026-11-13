import type { GeoPoint, SkyCenter } from './sky-coordinates.ts'
import { installBundledCatalogs, type CatalogLoader } from './sky-data.ts'

interface SkyChartApi {
  display: (config: Record<string, unknown>) => void
  rotate: (options: { center: [number, number, number] }) => void
  skyview: (options: { date: Date; location: [number, number]; timezone: number }) => void
}

declare global {
  interface Window {
    Celestial?: SkyChartApi
    d3?: CatalogLoader
  }
}

const chart = window.Celestial
let initialized = false

export function initializeSkyMap(): void {
  if (!chart) throw new Error('The local sky-chart scripts did not load')
  if (initialized) return

  if (!window.d3) throw new Error('The sky-chart data loader did not load')
  installBundledCatalogs(window.d3)

  chart.display({
    container: 'celestial-map',
    width: 0,
    projection: 'stereographic',
    projectionRatio: 1,
    transform: 'equatorial',
    follow: 'center',
    center: [0, 0, 0],
    orientationfixed: true,
    disableAnimations: true,
    zoomlevel: 1.7,
    zoomextend: 8,
    interactive: true,
    controls: false,
    keyboard: false,
    mouse: true,
    form: false,
    datapath: `${import.meta.env.BASE_URL}sky-data/`,
    background: { fill: '#071016', opacity: 0, stroke: '#071016', width: 0 },
    stars: {
      show: true,
      data: 'stars.6.json',
      limit: 6,
      colors: true,
      propername: true,
      propernameType: 'name',
      propernameLimit: 1.5,
      designation: false,
      size: 7,
    },
    dsos: { show: false },
    constellations: {
      show: true,
      names: true,
      namesType: 'en',
      lines: true,
      lineStyle: { stroke: '#75d9d3', width: 1.2, opacity: 0.72 },
      nameStyle: {
        fill: '#c4e7df',
        align: 'center',
        baseline: 'middle',
        opacity: 0.88,
        font: ["14px 'Georgia', serif", "12px 'Georgia', serif", "11px 'Georgia', serif"],
      },
    },
    mw: { show: false },
    lines: {
      graticule: { show: false },
      equatorial: { show: false },
      ecliptic: { show: false },
      galactic: { show: false },
      supergalactic: { show: false },
    },
    horizon: { show: false },
  })
  initialized = true
}

export function setSkyLocation(location: GeoPoint, date: Date): void {
  chart?.skyview({
    date,
    location: [location.latitude, location.longitude],
    timezone: -date.getTimezoneOffset(),
  })
}

export function setSkyCenter(center: SkyCenter): void {
  chart?.rotate({ center: [center.rightAscension, center.declination, center.roll ?? 0] })
}