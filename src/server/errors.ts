/** An error the handler turns into a JSON response with this status. */
export class WebVitalsError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'WebVitalsError'
    this.status = status
  }
}
