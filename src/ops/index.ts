/**
 * The assembled operation catalog: one place that says which LinkedIn operations exist, what they
 * accept, and whether anything may run them yet.
 */

import { READ_OPERATIONS } from "./reads.js";
import { WRITE_OPERATIONS } from "./writes.js";
import {
  OperationInputError,
  type OperationDescriptor,
  type OperationKind,
  type ParamType,
} from "./types.js";

export {
  OperationInputError,
  type OperationDescriptor,
  type OperationKind,
  type OperationParam,
  type ParamType,
} from "./types.js";
export { READ_OPERATIONS } from "./reads.js";
export { WRITE_OPERATIONS } from "./writes.js";

export const OPERATIONS: readonly OperationDescriptor[] = [
  ...READ_OPERATIONS,
  ...WRITE_OPERATIONS,
];

/** Every operation, or only one kind. */
export function listOperations(kind?: OperationKind): readonly OperationDescriptor[] {
  if (kind === undefined) return OPERATIONS;
  return OPERATIONS.filter((op) => op.kind === kind);
}

/** Operation names, in catalog order. Stable identifiers. */
export function operationNames(): readonly string[] {
  return OPERATIONS.map((op) => op.name);
}

/** Look one up. An unknown name is a programming error, not a lookup miss. */
export function findOperation(name: string): OperationDescriptor {
  const found = OPERATIONS.find((op) => op.name === name);
  if (!found) {
    throw new Error(`unknown operation "${name}"; known: ${operationNames().join(", ")}`);
  }
  return found;
}

function isType(value: unknown, type: ParamType): boolean {
  if (type === "array") return Array.isArray(value);
  return typeof value === type;
}

/**
 * Reject arguments that cannot satisfy the declaration, before any request is built.
 *
 * Nothing is coerced: a number where a string belongs is an operator mistake, and guessing what
 * they meant on the way to a live API call is how the wrong profile gets messaged.
 */
export function validateArgs(
  op: OperationDescriptor,
  args: Record<string, unknown>,
): void {
  const declared = new Map(op.params.map((param) => [param.name, param]));

  for (const key of Object.keys(args)) {
    if (!declared.has(key)) {
      throw new OperationInputError(
        `unknown argument "${key}" for ${op.name}; expected ${op.params.map((p) => p.name).join(", ") || "none"}`,
      );
    }
  }

  for (const param of op.params) {
    const value = args[param.name];

    if (value === undefined || value === null) {
      if (param.required) {
        throw new OperationInputError(
          `missing required argument "${param.name}" for ${op.name}`,
          param.hint,
        );
      }
      continue;
    }

    if (!isType(value, param.type)) {
      throw new OperationInputError(
        `argument "${param.name}" must be a ${param.type}, got ${Array.isArray(value) ? "array" : typeof value}`,
        param.hint,
      );
    }

    if (param.pattern && typeof value === "string" && !param.pattern.test(value)) {
      throw new OperationInputError(
        `argument "${param.name}" does not match ${String(param.pattern)}`,
        param.hint,
      );
    }
  }
}
