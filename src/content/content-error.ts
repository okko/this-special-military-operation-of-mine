/**
 * Thrown by content validators when a data table is malformed. The content loader fails loudly
 * at boot rather than letting bad data through silently (docs/areas/00-core-platform.md §3.11).
 */
export class ContentValidationError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'ContentValidationError';
  }
}
