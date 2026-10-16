/**
 * The port between this project and `api-anything`.
 *
 * Nothing outside `src/engine/api-anything.ts` may import the vendor package. The automation
 * layer depends on this file only, which is what lets the campaign engine be tested without a
 * session, a browser, or a network call.
 */

/** api-anything's failure vocabulary, preserved verbatim so the operator sees upstream's terms. */
export type FailureClass =
  | "auth"
  | "rate"
  | "blocked"
  | "drift"
  | "input"
  | "refused"
  | "error";

/** A call request. `site`/`op` name an operation; `args` are its declared parameters. */
export interface OperationCall {
  readonly site: string;
  readonly op: string;
  readonly args?: Readonly<Record<string, unknown>>;
}

/** Transport budget. `allowWrites` defaults to false and must be threaded through explicitly. */
export interface EngineCallOptions {
  readonly allowWrites?: boolean;
  /** Highest transport tier to permit. 1 means "plain HTTP only, never open a browser". */
  readonly maxTier?: 1 | 2 | 3;
}

export interface CallSuccess<T = unknown> {
  readonly ok: true;
  readonly data: T;
  readonly tier?: 1 | 2 | 3;
  readonly healed?: boolean;
  readonly ms: number;
  /** Set when the engine cut the payload; the data is then partial. */
  readonly truncated?: string;
}

export interface CallFailure {
  readonly ok: false;
  readonly class: FailureClass;
  readonly reason: string;
  /** api-anything's own remediation hint. Follow it at most once, then stop. */
  readonly next?: string;
  readonly ms: number;
}

export type CallOutcome<T = unknown> = CallSuccess<T> | CallFailure;

/**
 * The exact request a write would send, with credentials replaced by placeholders.
 *
 * Rendering is delegated to api-anything's own dry-run so the preview cannot drift from the real
 * request. A preview is only ever produced, never sent.
 */
export interface RequestPreview {
  readonly site: string;
  readonly op: string;
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface LinkedInClient {
  /** Call one operation. Never throws for site-side failures; the outcome carries the class. */
  call<T = unknown>(
    input: OperationCall,
    opts?: EngineCallOptions,
  ): Promise<CallOutcome<T>>;

  /** Render the request a call would send, without sending it. */
  preview(input: OperationCall): Promise<RequestPreview>;
}

/** Narrow an outcome to its failure arm. */
export function isFailure<T>(outcome: CallOutcome<T>): outcome is CallFailure {
  return outcome.ok === false;
}

/** Narrow an outcome to its success arm. */
export function isSuccess<T>(outcome: CallOutcome<T>): outcome is CallSuccess<T> {
  return outcome.ok === true;
}
