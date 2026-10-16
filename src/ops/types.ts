/** Descriptor vocabulary for the LinkedIn operation catalog. */

export type OperationKind = "read" | "write";

export type ParamType = "string" | "number" | "boolean" | "object" | "array";

export interface OperationParam {
  readonly name: string;
  readonly type: ParamType;
  readonly required: boolean;
  readonly description: string;
  /** A regex the whole value must match. Guards are enforced before any request is built. */
  readonly pattern?: RegExp;
  /** What to tell the operator when this argument is rejected. */
  readonly hint?: string;
}

export interface OperationDescriptor {
  readonly name: string;
  readonly kind: OperationKind;
  readonly site: string;
  readonly summary: string;
  readonly params: readonly OperationParam[];
  /**
   * Whether the request shape has been observed against the live site. `false` means no operation
   * spec exists yet, so the executor must refuse it. Writes drafted from bundle evidence land here
   * until someone confirms the real traffic.
   */
  readonly verified: boolean;
}

/** Raised when arguments cannot satisfy an operation's declaration. */
export class OperationInputError extends Error {
  readonly hint?: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = "OperationInputError";
    if (hint !== undefined) this.hint = hint;
  }
}
