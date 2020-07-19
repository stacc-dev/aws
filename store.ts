import { EventEmitter } from 'events'

export declare interface TokenStore {
  on(event: 'realtime', listener: (token: string, users: number) => void): this
}

export class TokenStore extends EventEmitter {
  private tokens: { [key: string]: number } = {}

  increment(token: string) {
    if (token in this.tokens) {
      this.tokens[token]++
    } else {
      this.tokens[token] = 1
    }
    this.emit('realtime', token, this.tokens[token])
  }

  decrement(token: string) {
    if (token in this.tokens && this.tokens[token] > 0) {
      this.tokens[token]--
    } else {
      this.tokens[token] = 0
    }
    this.emit('realtime', token, this.tokens[token])
  }

  get(token: string) {
    return this.tokens[token] ?? 0
  }
}