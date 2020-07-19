export type State = {
  token: string | null,
  lastPing: number,
  timeouts: NodeJS.Timeout[],
  intervals: NodeJS.Timeout[]
}