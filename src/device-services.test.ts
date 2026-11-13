import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestOrientationAccess, startOrientationWatch } from './device-services.ts'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('orientation sensors', () => {
  it('prefers absolute events, falls back when stale and removes both listeners', () => {
    const target = new EventTarget()
    vi.stubGlobal('window', target)
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
    const callback = vi.fn()
    const dispose = startOrientationWatch(callback)
    const send = (type: string, alpha = 10) => {
      target.dispatchEvent(Object.assign(new Event(type), { alpha, beta: 90, gamma: 0, absolute: false }))
    }
    send('deviceorientation')
    send('deviceorientationabsolute')
    send('deviceorientation')
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback.mock.calls[1][0].type).toBe('deviceorientationabsolute')
    clock.mockReturnValue(2100)
    send('deviceorientation')
    expect(callback).toHaveBeenCalledTimes(3)
    send('deviceorientationabsolute', NaN)
    expect(callback).toHaveBeenCalledTimes(3)
    dispose()
    send('deviceorientationabsolute')
    send('deviceorientation')
    expect(callback).toHaveBeenCalledTimes(3)
  })

  it('requests iOS motion access directly and handles denial', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission })
    const pending = requestOrientationAccess()
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(await pending).toBe(true)
    requestPermission.mockResolvedValue('denied')
    expect(await requestOrientationAccess()).toBe(false)
  })
})