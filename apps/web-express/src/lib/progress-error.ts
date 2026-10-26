export class ProgressError extends Error {
  constructor(public readonly status: number, message: string,public readonly code?:string) { super(message); this.name = 'ProgressError'; }
}
