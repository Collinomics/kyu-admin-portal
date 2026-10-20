export class AuthRequestError extends Error {
  readonly code: string;
  readonly retryAfter: number;

  constructor(message: string, code = '', retryAfter = 0) {
    super(message);
    this.name = 'AuthRequestError';
    this.code = code;
    this.retryAfter = retryAfter;
  }
}
