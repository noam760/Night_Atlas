import { describe, expect, it } from 'vitest'
import { HorizonFromVector, Observer, RotateVector, Rotation_EQJ_HOR, Spherical, VectorFromSphere } from 'astronomy-engine'
import { magneticDeclination, normalizeOrientation, orientationQuaternion, OrientationSmoother, readingFromQuaternion, skyCenterFromOrientation, wrapDegrees } from './sky-coordinates.ts'

describe('sky coordinate helpers', () => {
  const pose = (alpha: number, beta = 90, gamma = 0, screenAngle = 0) => orientationQuaternion({
    alpha, beta, gamma, absolute: true,
  } as DeviceOrientationEvent, screenAngle)!

  it('smooths across north on the shortest quaternion arc', () => {
    const smoother = new OrientationSmoother()
    smoother.setTarget(pose(359))
    smoother.sample(0)
    smoother.setTarget(pose(1))
    const midpoint = smoother.sample(140 * Math.log(2))!
    expect(Math.abs(midpoint.quaternion.dot(pose(0).quaternion))).toBeCloseTo(1, 8)
  })

  it('has frame-rate-independent exponential smoothing and resets cleanly', () => {
    const sampleAtRate = (frames: number) => {
      const smoother = new OrientationSmoother()
      smoother.setTarget(pose(0))
      smoother.sample(0)
      smoother.setTarget(pose(90))
      for (let frame = 1; frame <= frames; frame++) smoother.sample(frame * 1000 / frames)
      const result = smoother.sample(1000)!
      smoother.reset()
      expect(smoother.sample(1100)).toBeNull()
      return result.quaternion
    }
    expect(sampleAtRate(30).angleTo(sampleAtRate(120))).toBeCloseTo(0, 6)
  })

  it('keeps the viewing ray stable across screen rotation and Euler singularities', () => {
    const portrait = readingFromQuaternion(pose(10, 89.99, 20))
    const landscape = readingFromQuaternion(pose(10, 89.99, 20, 90))
    expect(landscape.azimuth).toBeCloseTo(portrait.azimuth, 8)
    expect(landscape.altitude).toBeCloseTo(portrait.altitude, 8)
    expect(portrait.screenUp!.dot(landscape.screenUp!)).toBeCloseTo(0, 8)
    expect(pose(10, 89.99, 20).quaternion.angleTo(pose(10, 90.01, 20).quaternion)).toBeLessThan(0.001)
  })

  it('carries screen roll into the sky projection without changing the pointing center', () => {
    const date = new Date('2026-11-13T20:00:00Z')
    const location = { latitude: 32, longitude: 34 }
    const portrait = skyCenterFromOrientation(readingFromQuaternion(pose(10, 120, 20)), location, date)
    const landscape = skyCenterFromOrientation(readingFromQuaternion(pose(10, 120, 20, 90)), location, date)
    expect(landscape.rightAscension).toBeCloseTo(portrait.rightAscension, 8)
    expect(landscape.declination).toBeCloseTo(portrait.declination, 8)
    expect(Math.abs(wrapDegrees(landscape.roll! - portrait.roll! + 180) - 180)).toBeCloseTo(90, 8)
  })

  it('does not rotate when the same attitude is encoded by the opposite quaternion sign', () => {
    const smoother = new OrientationSmoother()
    const target = pose(45, 100, 30)
    smoother.setTarget(target)
    smoother.sample(0)
    const opposite = target.quaternion.clone()
    opposite.set(-opposite.x, -opposite.y, -opposite.z, -opposite.w)
    smoother.setTarget({ quaternion: opposite, absolute: true })
    expect(smoother.sample(100)!.quaternion.angleTo(target.quaternion)).toBeCloseTo(0, 6)
  })

  it('corrects magnetic bearings toward true north, but leaves relative readings uncorrected', () => {
    const event = { alpha: 350, beta: 90, gamma: 0, absolute: true } as DeviceOrientationEvent
    expect(readingFromQuaternion(orientationQuaternion(event, 0, 5)!).azimuth).toBeCloseTo(15)
    expect(readingFromQuaternion(orientationQuaternion({ ...event, absolute: false }, 0, 5)!).azimuth).toBeCloseTo(10)
    expect(magneticDeclination({ latitude: 32, longitude: 34 }, new Date('2026-11-13'))).toBeTypeOf('number')
    expect(magneticDeclination({ latitude: 32, longitude: 34 }, new Date('2100-01-01'))).toBeNull()
  })

  it('wraps headings to a compass range', () => {
    expect(wrapDegrees(-1)).toBe(359)
    expect(wrapDegrees(721)).toBe(1)
  })

  it('normalizes device orientation and clamps altitude', () => {
    const reading = normalizeOrientation({
      alpha: 0,
      beta: 90,
      gamma: 0,
      absolute: true,
    } as DeviceOrientationEvent)

    expect(reading).toMatchObject({ azimuth: 0, absolute: true })
    expect(reading?.altitude).toBeCloseTo(0, 10)
  })

  it('uses the compass heading when the browser provides one', () => {
    const event = {
      alpha: 0,
      beta: 90,
      gamma: 0,
      absolute: false,
      webkitCompassHeading: 42,
    } as DeviceOrientationEvent & { webkitCompassHeading: number }

    const reading = normalizeOrientation(event)
    expect(reading).toMatchObject({ azimuth: 42, absolute: true })
    expect(reading?.altitude).toBeCloseTo(0, 10)
  })

  it('uses phone roll when deriving the rear-camera pointing direction', () => {
    const reading = normalizeOrientation({
      alpha: 0,
      beta: 90,
      gamma: 30,
      absolute: true,
    } as DeviceOrientationEvent)

    expect(reading?.azimuth).toBeCloseTo(330)
    expect(reading?.altitude).toBeCloseTo(0)
  })

  it('round-trips the phone pointing direction through equatorial coordinates', () => {
    const date = new Date('2026-11-13T20:00:00Z')
    const location = { latitude: 32, longitude: 34 }
    const center = skyCenterFromOrientation(
      { azimuth: 180, altitude: 45, absolute: true },
      location,
      date,
    )
    const observer = new Observer(location.latitude, location.longitude, 0)
    const equatorialVector = VectorFromSphere(new Spherical(center.declination, center.rightAscension, 1), date)
    const horizontalVector = RotateVector(Rotation_EQJ_HOR(date, observer), equatorialVector)
    const horizontal = HorizonFromVector(horizontalVector, '')

    expect(horizontal.lon).toBeCloseTo(180, 8)
    expect(horizontal.lat).toBeCloseTo(45, 8)
  })
})