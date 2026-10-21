// A tiny stand-in for the Socket.IO client used in tests: records emits, lets tests trigger server events.
export class FakeSocket {
  constructor() {
    this.handlers = new Map()
    this.emitted = []
    this.connected = true
    this.joinReply = { ok: true }
  }

  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event).add(fn)
    return this
  }

  off(event, fn) {
    this.handlers.get(event)?.delete(fn)
    return this
  }

  emit(event, ...args) {
    this.emitted.push([event, ...args.filter((a) => typeof a !== 'function')])
    const ack = args.find((a) => typeof a === 'function')
    if (event === 'showtime:join' && ack) queueMicrotask(() => ack(this.joinReply))
    return this
  }

  disconnect() {
    this.connected = false
    this.disconnects = (this.disconnects ?? 0) + 1
    return this
  }

  connect() {
    this.connected = true
    this.connects = (this.connects ?? 0) + 1
    for (const fn of this.handlers.get('connect') ?? []) fn()
    return this
  }

  /** Simulates the server sending `event`. */
  serverSends(event, payload) {
    for (const fn of this.handlers.get(event) ?? []) fn(payload)
  }

  reset() {
    this.handlers.clear()
    this.emitted = []
    this.connected = true
    this.joinReply = { ok: true }
    this.connects = 0
    this.disconnects = 0
  }
}

export const fakeSocket = new FakeSocket()
