export class ServerError extends Error {
  constructor (message: string, public readonly statusCode: number = 500) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends ServerError {
  constructor (message: string) {
    super(message, 400);
  }
}