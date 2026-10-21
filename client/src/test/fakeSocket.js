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

  /** Simulates the server sending `event`. */
  serverSends(event, payload) {
    for (const fn of this.handlers.get(event) ?? []) fn(payload)
  }

  reset() {
    this.handlers.clear()
    this.emitted = []
    this.connected = true
    this.joinReply = { ok: true }
  }
}

export const fakeSocket = new FakeSocket()
