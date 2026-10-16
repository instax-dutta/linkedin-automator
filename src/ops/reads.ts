/**
 * Read-only operations. All five ship with api-anything and were verified live by its maintainers
 * on 2026-09-27, so they are marked `verified` and this project wraps rather than re-learns them.
 *
 * Source: api-anything `sites/linkedin.md`.
 */

import type { OperationDescriptor } from "./types.js";

/**
 * LinkedIn parses the Rest.li `query` parameter before percent-decoding it once, so a comma, colon
 * or parenthesis cannot be encoded to read as text. The value has to avoid them entirely.
 */
const KEYWORDS_PATTERN = /^[^,:()]+$/;
const KEYWORDS_HINT =
  "spaces only: commas, colons and parentheses are Rest.li syntax, so write \"rust engineer zurich\"";

export const READ_OPERATIONS: readonly OperationDescriptor[] = [
  {
    name: "getMe",
    kind: "read",
    site: "linkedin",
    summary: "The signed-in member's own mini profile; confirms the imported session is live.",
    params: [],
    verified: true,
  },
  {
    name: "getProfile",
    kind: "read",
    site: "linkedin",
    summary: "A member profile by public id: name, headline, About text, country, websites.",
    params: [
      {
        name: "publicId",
        type: "string",
        required: true,
        description: "the segment after /in/ in a profile URL",
        hint: "e.g. williamhgates; searchPeople returns it as publicId",
      },
    ],
    verified: true,
  },
  {
    name: "getCompany",
    kind: "read",
    site: "linkedin",
    summary: "A company by universal name: name, tagline, industry, staff count, website, HQ.",
    params: [
      {
        name: "universalName",
        type: "string",
        required: true,
        description: "the segment after /company/ in a company URL",
        hint: "often differs from the brand: the AI company is anthropicresearch",
      },
    ],
    verified: true,
  },
  {
    name: "searchPeople",
    kind: "read",
    site: "linkedin",
    summary: "The first 10 people matches: name, headline, location, url, publicId, distance.",
    params: [
      {
        name: "keywords",
        type: "string",
        required: true,
        description: "search keywords",
        pattern: KEYWORDS_PATTERN,
        hint: KEYWORDS_HINT,
      },
    ],
    verified: true,
  },
  {
    name: "searchCompanies",
    kind: "read",
    site: "linkedin",
    summary: "The first 10 company matches: name, subtitle, followers, description, url.",
    params: [
      {
        name: "keywords",
        type: "string",
        required: true,
        description: "search keywords",
        pattern: KEYWORDS_PATTERN,
        hint: KEYWORDS_HINT,
      },
    ],
    verified: true,
  },
];
