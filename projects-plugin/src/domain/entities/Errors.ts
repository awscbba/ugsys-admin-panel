export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly userMessage: string,
  ) {
    super(userMessage);
    this.name = 'ApiError';
  }
}

export class SessionExpiredError extends ApiError {
  constructor(message = 'Your session has expired. Please log in again.') {
    super(401, 'SESSION_EXPIRED', message);
    this.name = 'SessionExpiredError';
  }
}

export class AccessDeniedError extends ApiError {
  constructor(message = "You don't have permission to perform this action.") {
    super(403, 'ACCESS_DENIED', message);
    this.name = 'AccessDeniedError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'The requested resource was not found.') {
    super(404, 'NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string) {
    super(422, 'VALIDATION_ERROR', message);
    this.name = 'ValidationError';
  }
}

export class ServerError extends ApiError {
  constructor(message = 'An unexpected error occurred. Please try again.') {
    super(500, 'SERVER_ERROR', message);
    this.name = 'ServerError';
  }
}

export class NetworkError extends ApiError {
  constructor(message = 'Unable to connect. Check your network and try again.') {
    super(0, 'NETWORK_ERROR', message);
    this.name = 'NetworkError';
  }
}
