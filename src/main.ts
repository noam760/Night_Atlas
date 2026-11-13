import '@fontsource/space-grotesk/latin-500.css'
import '@fontsource/space-grotesk/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import mapPinIcon from 'lucide-static/icons/map-pin.svg?raw'
import crosshairIcon from 'lucide-static/icons/crosshair.svg?raw'
import './style.css'
import { getCurrentLocation, openRearCamera, requestOrientationAccess, startLocationWatch, startOrientationWatch } from './device-services.ts'
import { magneticDeclination, orientationQuaternion, OrientationSmoother, readingFromQuaternion, skyCenterFromOrientation, type GeoPoint } from './sky-coordinates.ts'
import { initializeSkyMap, setSkyCenter, setSkyLocation } from './sky-map.ts'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) throw new Error('App mount point is missing')

root.innerHTML = `
  <main class="app-shell" data-mode="chart">
    <video class="camera-feed" id="camera-feed" autoplay muted playsinline aria-hidden="true"></video>
    <div class="sky-wash" aria-hidden="true"></div>
    <header class="topbar">
      <a class="wordmark" href="#" aria-label="Night Atlas home">
        <span class="wordmark-mark" aria-hidden="true">N</span>
        <span><strong>NIGHT ATLAS</strong><small>FIELD SKY GUIDE</small></span>
      </a>
      <div class="top-readout">
        <span class="live-dot" aria-hidden="true"></span>
        <span id="connection-label">CHART MODE</span>
        <span class="readout-divider"></span>
        <time id="clock-readout"></time>
      </div>
      <button class="icon-button locate-button" id="locate-button" type="button" title="Use my location" aria-label="Use my location">
        ${mapPinIcon}
      </button>
    </header>

    <section class="stage" aria-label="Interactive night sky">
      <div class="sky-map" id="celestial-map"></div>
      <div class="viewfinder" aria-hidden="true">
        <span class="viewfinder-top"></span>
        <span class="viewfinder-bottom"></span>
        <span class="viewfinder-left"></span>
        <span class="viewfinder-right"></span>
        <span class="viewfinder-center"></span>
      </div>
      <div class="stage-caption">
        <span class="eyebrow">YOUR LOCAL SKY</span>
        <span id="sky-caption">Move the chart to explore</span>
      </div>
      <div class="bearing-readout" aria-label="Phone pointing direction">
        <span class="bearing-label">POINTING</span>
        <strong id="bearing-value">---°</strong>
        <span id="altitude-value">--° ALT</span>
      </div>
      <div class="notice" id="notice" role="status" aria-live="polite" hidden></div>
    </section>

    <footer class="control-deck">
      <div class="deck-heading">
        <div class="mode-switch" role="group" aria-label="Sky view mode">
          <button class="mode-option is-active" id="chart-mode" type="button" aria-pressed="true">CHART</button>
          <button class="mode-option" id="live-mode" type="button" aria-pressed="false">LIVE CAMERA</button>
        </div>
        <div class="location-readout" id="location-readout">
          <span class="location-mark" aria-hidden="true">+</span>
          <span id="location-label">LOCATION NOT SET</span>
        </div>
      </div>
      <div class="mode-switch tracking-switch" role="group" aria-label="Sky navigation">
        <button class="mode-option is-active" id="manual-tracking" type="button" aria-pressed="true">MANUAL DRAG</button>
        <button class="mode-option" id="compass-tracking" type="button" aria-pressed="false">COMPASS / LIVE SKY</button>
      </div>
      <div class="deck-controls">
        <div class="sensor-status">
          <span class="eyebrow">SENSOR STATUS</span>
          <strong id="sensor-label">Chart is ready</strong>
        </div>
        <button class="action-button" id="recenter-button" type="button" title="Recenter the sky on your phone">${crosshairIcon} RE-CENTER</button>
        <details class="manual-location">
          <summary>SET LOCATION</summary>
          <form id="location-form">
            <label>LATITUDE<input id="latitude-input" name="latitude" type="number" step="any" min="-90" max="90" placeholder="32.08" required /></label>
            <label>LONGITUDE<input id="longitude-input" name="longitude" type="number" step="any" min="-180" max="180" placeholder="34.78" required /></label>
            <button type="submit">APPLY LOCATION</button>
          </form>
        </details>
      </div>
      <div class="deck-footnote"><span>STARS · CONSTELLATIONS · PLANETS</span><span id="permission-note">Camera and sensors start only when requested</span></div>
    </footer>
  </main>
`

const app = root.querySelector<HTMLElement>('.app-shell')!
const video = root.querySelector<HTMLVideoElement>('#camera-feed')!
const clockReadout = root.querySelector<HTMLElement>('#clock-readout')!
const connectionLabel = root.querySelector<HTMLElement>('#connection-label')!
const sensorLabel = root.querySelector<HTMLElement>('#sensor-label')!
const locationLabel = root.querySelector<HTMLElement>('#location-label')!
const skyCaption = root.querySelector<HTMLElement>('#sky-caption')!
const bearingValue = root.querySelector<HTMLElement>('#bearing-value')!
const altitudeValue = root.querySelector<HTMLElement>('#altitude-value')!
const notice = root.querySelector<HTMLElement>('#notice')!
const permissionNote = root.querySelector<HTMLElement>('#permission-note')!
const chartButton = root.querySelector<HTMLButtonElement>('#chart-mode')!
const liveButton = root.querySelector<HTMLButtonElement>('#live-mode')!
const locationForm = root.querySelector<HTMLFormElement>('#location-form')!
const latitudeInput = root.querySelector<HTMLInputElement>('#latitude-input')!
const longitudeInput = root.querySelector<HTMLInputElement>('#longitude-input')!
const compassButton = root.querySelector<HTMLButtonElement>('#compass-tracking')!
const manualButton = root.querySelector<HTMLButtonElement>('#manual-tracking')!

let currentLocation: GeoPoint | null = null
let liveCleanup: (() => void) | null = null
let cameraStream: MediaStream | null = null
let activeMode: 'chart' | 'live' = 'chart'
let latestOrientation: DeviceOrientationEvent | null = null
let trackingMode: 'manual' | 'compass' = 'manual'
let orientationCleanup: (() => void) | null = null
let compassSession = 0
let liveSession = 0
let animationFrame: number | null = null
let latestSensorTime = -Infinity
let declination: number | null = null
const smoother = new OrientationSmoother()

initializeSkyMap()
app.dataset.tracking = 'manual'
updateClock()
window.setInterval(updateClock, 1000)

root.querySelector<HTMLButtonElement>('#locate-button')!.addEventListener('click', () => {
  void locateUser()
})

chartButton.addEventListener('click', () => setMode('chart'))
liveButton.addEventListener('click', () => setMode('live'))
compassButton.addEventListener('click', () => { void startCompass() })
manualButton.addEventListener('click', stopCompass)
root.querySelector<HTMLButtonElement>('#recenter-button')!.addEventListener('click', () => {
  smoother.reset()
  void startCompass()
})

document.addEventListener('visibilitychange', () => {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame)
  animationFrame = null
  smoother.reset()
  latestOrientation = null
  if (!document.hidden && trackingMode === 'compass') scheduleSkyFrame()
})

locationForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const latitude = Number(latitudeInput.value)
  const longitude = Number(longitudeInput.value)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    setNotice('Enter a valid latitude and longitude.')
    return
  }
  applyLocation({ latitude, longitude })
  locationForm.closest('details')?.removeAttribute('open')
  setNotice('Location set on this device only.')
})

function updateClock(): void {
  clockReadout.textContent = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
}

function setMode(mode: 'chart' | 'live'): void {
  if (activeMode === mode) return
  activeMode = mode
  app.dataset.mode = mode
  chartButton.classList.toggle('is-active', mode === 'chart')
  liveButton.classList.toggle('is-active', mode === 'live')
  chartButton.setAttribute('aria-pressed', String(mode === 'chart'))
  liveButton.setAttribute('aria-pressed', String(mode === 'live'))
  clearNotice()

  if (mode === 'live') {
    void startLiveMode()
  } else {
    stopLiveMode()
    connectionLabel.textContent = 'CHART MODE'
    if (trackingMode === 'manual') sensorLabel.textContent = 'Manual drag'
    skyCaption.textContent = 'Drag to rotate · pinch to zoom'
    permissionNote.textContent = trackingMode === 'compass' ? 'Camera off · compass active' : 'Camera and sensors are off'
  }
}

async function startLiveMode(): Promise<void> {
  const session = ++liveSession
  connectionLabel.textContent = 'CONNECTING SENSORS'
  sensorLabel.textContent = 'Waiting for permissions'
  skyCaption.textContent = 'Aligning the sky to your phone'
  permissionNote.textContent = 'Allow camera, location, and motion access when prompted'

  const cameraRequest = openRearCamera()
  const locationRequest = getCurrentLocation()
  void startCompass(false)
  const [cameraResult, locationResult] = await Promise.allSettled([
    cameraRequest,
    locationRequest,
  ])

  if (activeMode !== 'live' || session !== liveSession) {
    if (cameraResult.status === 'fulfilled') cameraResult.value.getTracks().forEach((track) => track.stop())
    return
  }

  const messages: string[] = []
  const cleanup: Array<() => void> = []

  if (cameraResult.status === 'fulfilled') {
    cameraStream = cameraResult.value
    video.srcObject = cameraStream
  } else {
    messages.push('Camera unavailable')
  }

  if (locationResult.status === 'fulfilled') {
    applyLocation(locationResult.value)
    cleanup.push(startLocationWatch(applyLocation, () => {
      locationLabel.textContent = 'LOCATION SIGNAL LOST'
    }))
  } else {
    messages.push('Location unavailable')
  }

  liveCleanup = () => cleanup.forEach((dispose) => dispose())
  connectionLabel.textContent = cameraStream ? 'LIVE SKY' : 'LIVE · CAMERA OFF'
  sensorLabel.textContent = trackingMode === 'manual' ? 'Manual drag'
    : messages.length ? messages.join(' · ') : 'Waiting for compass data'
  skyCaption.textContent = cameraStream ? 'Stars mapped to your view' : 'Chart view · camera permission needed for overlay'
  permissionNote.textContent = messages.length ? 'Chart controls remain available' : 'Live sensor data stays on this device'
  if (messages.length) setNotice(`${messages.join('. ')}. Use Set Location or Chart mode to continue.`)
}

function stopLiveMode(): void {
  liveSession++
  liveCleanup?.()
  liveCleanup = null
  cameraStream?.getTracks().forEach((track) => track.stop())
  cameraStream = null
  video.srcObject = null
}

function setTrackingControls(): void {
  const compass = trackingMode === 'compass'
  app.dataset.tracking = trackingMode
  compassButton.classList.toggle('is-active', compass)
  manualButton.classList.toggle('is-active', !compass)
  compassButton.setAttribute('aria-pressed', String(compass))
  manualButton.setAttribute('aria-pressed', String(!compass))
}

async function startCompass(requestLocation = true): Promise<void> {
  if (trackingMode === 'compass') return
  const session = ++compassSession
  const permission = requestOrientationAccess()
  trackingMode = 'compass'
  setTrackingControls()
  clearNotice()
  sensorLabel.textContent = 'Waiting for motion permission'
  if (requestLocation && !currentLocation) void locateUser()
  const allowed = await permission
  if (session !== compassSession) return
  if (!allowed) {
    stopCompass()
    setNotice('Motion access was denied or is unavailable. Use Compass to retry, or drag manually.')
    return
  }
  orientationCleanup = startOrientationWatch((event) => {
    latestOrientation = event
    latestSensorTime = performance.now()
  })
  skyCaption.textContent = 'Live sky'
  permissionNote.textContent = 'Compass readings stay on this device'
  scheduleSkyFrame()
}

function stopCompass(): void {
  compassSession++
  trackingMode = 'manual'
  orientationCleanup?.()
  orientationCleanup = null
  if (animationFrame !== null) cancelAnimationFrame(animationFrame)
  animationFrame = null
  latestOrientation = null
  smoother.reset()
  setTrackingControls()
  bearingValue.textContent = '---°'
  altitudeValue.textContent = '--° ALT'
  sensorLabel.textContent = 'Manual drag'
  skyCaption.textContent = 'Manual sky'
  permissionNote.textContent = activeMode === 'live' ? 'Camera active · compass off' : 'Camera and sensors are off'
}

function scheduleSkyFrame(): void {
  if (animationFrame === null && !document.hidden && trackingMode === 'compass') {
    animationFrame = requestAnimationFrame(updateLiveSky)
  }
}

async function locateUser(): Promise<void> {
  sensorLabel.textContent = 'Requesting location permission'
  try {
    const location = await getCurrentLocation()
    applyLocation(location)
    sensorLabel.textContent = 'Location linked · chart controls active'
    setNotice('Your location is used only to calculate the local sky.')
  } catch {
    sensorLabel.textContent = 'Location unavailable · enter coordinates manually'
    setNotice('Location access was unavailable. You can enter coordinates below.')
  }
}

function applyLocation(location: GeoPoint): void {
  const firstLocation = currentLocation === null
  currentLocation = location
  declination = magneticDeclination(location, new Date())
  setSkyLocation(location, new Date())
  if (firstLocation && trackingMode === 'manual') {
    setSkyCenter(skyCenterFromOrientation({ azimuth: 0, altitude: 90, absolute: true }, location, new Date()))
  }
  latitudeInput.value = String(location.latitude)
  longitudeInput.value = String(location.longitude)
  locationLabel.textContent = `${location.latitude.toFixed(2)}°, ${location.longitude.toFixed(2)}°`
}

function updateLiveSky(time: number): void {
  animationFrame = null
  if (trackingMode !== 'compass' || document.hidden) return
  scheduleSkyFrame()
  if (!latestOrientation || time - latestSensorTime > 2500) {
    sensorLabel.textContent = 'Waiting for compass data'
    return
  }
  if (!currentLocation) {
    sensorLabel.textContent = 'Location needed for live sky'
    return
  }
  const screenAngle = window.screen.orientation?.angle ?? window.orientation ?? 0
  const target = orientationQuaternion(latestOrientation, screenAngle, declination ?? 0)
  if (!target) return
  smoother.setTarget(target)
  const smoothed = smoother.sample(time)
  if (!smoothed) return
  const orientation = readingFromQuaternion(smoothed)

  const center = skyCenterFromOrientation(orientation, currentLocation, new Date())
  setSkyCenter(center)
  bearingValue.textContent = `${(Math.round(orientation.azimuth) % 360).toString().padStart(3, '0')}°`
  altitudeValue.textContent = `${Math.round(orientation.altitude)}° ALT`
  sensorLabel.textContent = orientation.absolute
    ? declination === null ? 'Magnetic north · uncorrected' : 'True north · WMM estimate'
    : 'Relative heading · north unavailable'
}

function setNotice(message: string): void {
  notice.textContent = message
  notice.hidden = false
}

function clearNotice(): void {
  notice.textContent = ''
  notice.hidden = true
}
