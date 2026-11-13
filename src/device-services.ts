import { normalizeOrientation, type DeviceOrientationReading, type GeoPoint } from './sky-coordinates.ts'

export function getCurrentLocation(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      reject,
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 },
    )
  })
}

export function startLocationWatch(onLocation: (location: GeoPoint) => void, onError: () => void): () => void {
  if (!navigator.geolocation) {
    onError()
    return () => undefined
  }
  const watchId = navigator.geolocation.watchPosition(
    ({ coords }) => onLocation({ latitude: coords.latitude, longitude: coords.longitude }),
    onError,
    { enableHighAccuracy: true, maximumAge: 60_000, timeout: 20_000 },
  )
  return () => navigator.geolocation.clearWatch(watchId)
}

export async function requestOrientationAccess(): Promise<boolean> {
  if (typeof DeviceOrientationEvent === 'undefined') return false
  const orientationEvent = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<'granted' | 'denied'>
  }
  if (!orientationEvent.requestPermission) return true
  try {
    return (await orientationEvent.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

export function startOrientationWatch(onOrientation: (event: DeviceOrientationEvent) => void): () => void {
  let lastAbsoluteTime = -Infinity
  const handleOrientation = (event: DeviceOrientationEvent) => {
    if (!normalizeOrientation(event)) return
    const now = performance.now()
    if (event.type === 'deviceorientationabsolute') lastAbsoluteTime = now
    else if (now - lastAbsoluteTime < 2000) return
    onOrientation(event)
  }
  window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener)
  window.addEventListener('deviceorientation', handleOrientation)
  return () => {
    window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener)
    window.removeEventListener('deviceorientation', handleOrientation)
  }
}

export async function openRearCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera access requires a supported browser on a secure connection')
  }
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  })
}

export function readOrientation(event: DeviceOrientationEvent): DeviceOrientationReading | null {
  return normalizeOrientation(event)
}