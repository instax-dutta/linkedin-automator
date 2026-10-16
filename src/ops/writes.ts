/**
 * Write intents: invitations, direct messages and posts.
 *
 * Every one is `verified: false` and deliberately has **no spec**. LinkedIn's write requests use
 * rotating `decorationId` / GraphQL `queryId` parameters, so a request shape recalled from memory
 * would be both unverifiable and permanently drifting. Guessing one onto a production account
 * sends a real message to a real person.
 *
 * These exist so the CLI and the executor can name the capability and refuse it honestly, with a
 * pointer at the discovery runbook, until an observed request shape is promoted into `specs/`.
 */

import type { OperationDescriptor } from "./types.js";

export const WRITE_OPERATIONS: readonly OperationDescriptor[] = [
  {
    name: "sendConnectionInvitation",
    kind: "write",
    site: "linkedin",
    summary: "Send a connection invitation, with an optional note.",
    params: [
      {
        name: "profileId",
        type: "string",
        required: true,
        description: "the recipient's profile identifier",
      },
      {
        name: "note",
        type: "string",
        required: false,
        description: "an optional invitation note",
      },
    ],
    verified: false,
  },
  {
    name: "sendMessage",
    kind: "write",
    site: "linkedin",
    summary: "Send a direct message to an existing conversation participant.",
    params: [
      {
        name: "recipient",
        type: "string",
        required: true,
        description: "the recipient's profile identifier",
      },
      {
        name: "text",
        type: "string",
        required: true,
        description: "the message body",
      },
    ],
    verified: false,
  },
  {
    name: "createPost",
    kind: "write",
    site: "linkedin",
    summary: "Publish a post to the signed-in member's feed.",
    params: [
      {
        name: "text",
        type: "string",
        required: true,
        description: "the post body",
      },
      {
        name: "visibility",
        type: "string",
        required: false,
        description: "audience, e.g. PUBLIC or CONNECTIONS",
      },
    ],
    verified: false,
  },
];
