export class StudioError extends Error {
  constructor(public code: string, message: string, public status = 502) { super(message); }
}
