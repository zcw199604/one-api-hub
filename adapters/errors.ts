export class NotSupportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NotSupportedError"
  }
}

export class AdapterRegistrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AdapterRegistrationError"
  }
}

