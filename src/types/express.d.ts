import type { AuthPayload } from "../lib/jwt.js";

declare global {
  namespace Express {
    interface Request {
      // Lo llena el middleware `authenticate`
      auth?: AuthPayload;
    }
  }
}

export {};
