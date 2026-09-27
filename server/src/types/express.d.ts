declare global {
  namespace Express {
    interface Request {
      /** Set by the `requestId` middleware; echoed in error responses and logs. */
      requestId: string;
    }
  }
}

export {};
