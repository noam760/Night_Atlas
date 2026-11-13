import {
  Observer,
  RotateVector,
  Rotation_HOR_EQJ,
  SphereFromVector,
  Spherical,
  VectorFromHorizon,
} from 'astronomy-engine'
import { Euler, Quaternion, Vector3 } from 'three'
import { model } from 'geomagnetism'

export interface GeoPoint {
  latitude: number
  longitude: number
}

export interface DeviceOrientationReading {
  azimuth: number
  altitude: number
  absolute: boolean
  screenUp?: Vector3
}

export interface SkyCenter {
  rightAscension: number
  declination: number
  roll?: number
}

export interface OrientationPose {
  quaternion: Quaternion
  absolute: boolean
}

export function magneticDeclination(location: GeoPoint, date: Date): number | null {
  try {
    const field = model(date).point([location.latitude, location.longitude])
    return Number.isFinite(field.decl) && field.h >= 2000 ? field.decl : null
  } catch {
    return null
  }
}

export function orientationQuaternion(
  event: DeviceOrientationEvent,
  screenAngle = 0,
  declination = 0,
): OrientationPose | null {
  const compass = event as DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number }
  const hasCompass = Number.isFinite(compass.webkitCompassHeading)
    && compass.webkitCompassHeading! >= 0
    && (compass.webkitCompassAccuracy === undefined || compass.webkitCompassAccuracy >= 0)
  if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)
    || (!Number.isFinite(event.alpha) && !hasCompass)) return null

  const absolute = hasCompass || event.absolute || event.type === 'deviceorientationabsolute'
  const alpha = (hasCompass ? 360 - compass.webkitCompassHeading! : event.alpha!) - (absolute ? declination : 0)
  const radians = Math.PI / 180
  const quaternion = new Quaternion().setFromEuler(new Euler(
    event.beta! * radians, event.gamma! * radians, alpha * radians, 'ZXY',
  ))
  quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -screenAngle * radians))
  return { quaternion, absolute }
}

export class OrientationSmoother {
  private target: OrientationPose | null = null
  private current: Quaternion | null = null
  private previousTime: number | null = null

  setTarget(pose: OrientationPose): void {
    this.target = pose
  }

  sample(time: number): OrientationPose | null {
    if (!this.target) return null
    if (!this.current) this.current = this.target.quaternion.clone()
    const elapsed = this.previousTime === null ? 0 : Math.max(0, time - this.previousTime)
    this.previousTime = time
    this.current.slerp(this.target.quaternion, 1 - Math.exp(-elapsed / 140))
    return { quaternion: this.current.clone(), absolute: this.target.absolute }
  }

  reset(): void {
    this.target = null
    this.current = null
    this.previousTime = null
  }
}

export function readingFromQuaternion(pose: OrientationPose): DeviceOrientationReading {
  const forward = new Vector3(0, 0, -1).applyQuaternion(pose.quaternion)
  return {
    azimuth: wrapDegrees(Math.atan2(forward.x, forward.y) * 180 / Math.PI),
    altitude: Math.asin(Math.max(-1, Math.min(1, forward.z))) * 180 / Math.PI,
    absolute: pose.absolute,
    screenUp: new Vector3(0, 1, 0).applyQuaternion(pose.quaternion),
  }
}

export function wrapDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

export function normalizeOrientation(event: DeviceOrientationEvent): DeviceOrientationReading | null {
  const pose = orientationQuaternion(event)
  return pose ? readingFromQuaternion(pose) : null
}

export function skyCenterFromOrientation(
  orientation: DeviceOrientationReading,
  location: GeoPoint,
  date: Date,
): SkyCenter {
  const observer = new Observer(location.latitude, location.longitude, 0)
  const horizontal = new Spherical(orientation.altitude, orientation.azimuth, 1)
  const horizontalVector = VectorFromHorizon(horizontal, date, '')
  const equatorialVector = RotateVector(Rotation_HOR_EQJ(date, observer), horizontalVector)
  const equatorial = SphereFromVector(equatorialVector)

  let roll = 0
  if (orientation.screenUp) {
    const up = orientation.screenUp
    const upHorizontal = new Spherical(
      Math.asin(Math.max(-1, Math.min(1, up.z))) * 180 / Math.PI,
      wrapDegrees(Math.atan2(up.x, up.y) * 180 / Math.PI), 1,
    )
    const upEquatorial = RotateVector(Rotation_HOR_EQJ(date, observer), VectorFromHorizon(upHorizontal, date, ''))
    const longitude = equatorial.lon * Math.PI / 180
    const latitude = equatorial.lat * Math.PI / 180
    const east = -Math.sin(longitude) * upEquatorial.x + Math.cos(longitude) * upEquatorial.y
    const north = -Math.sin(latitude) * (Math.cos(longitude) * upEquatorial.x + Math.sin(longitude) * upEquatorial.y)
      + Math.cos(latitude) * upEquatorial.z
    roll = Math.atan2(east, north) * 180 / Math.PI
  }

  return {
    rightAscension: wrapDegrees(equatorial.lon),
    declination: equatorial.lat,
    roll,
  }
}