# docs/ — research, architecture and runbooks

## Purpose

Durable documentation: what the two upstream tools actually do, how this project is put together,
and the procedure for discovering a new LinkedIn operation.

## Ownership

- `RESEARCH.md` — the evidence base. What `api-anything` and `rea` are, what each ships, its
  limits, and LinkedIn's own constraints (auth shape, allowances, ToS posture).
- `ARCHITECTURE.md` — how the layers fit together and where each responsibility sits.
- `DISCOVERY.md` — the runbook for turning browser evidence into a verified operation spec.
- `TESTING.md` — the two kinds of testing (offline automatically, live by hand), the throwaway
  account, session isolation, the four gates on a write, and how to hand over a session without
  passing a credential through a chat.
- `HANDOFF.md` — the **living** findings and handoff log. Append, and correct in place with a
  labelled amendment rather than rewriting or deleting. Every finding names how it was established;
  the file ends with an explicit verified/unverified split and ordered next actions. This is the
  first thing to read when resuming, and the first thing to update before stopping.

## Local Contracts

- Research notes record claims with their source: which file in which upstream repo, which
  command, or which URL. A claim without a source is a guess and must be labelled one.
- Distinguish what was observed from what was inferred, and from what remains unknown.
- Runbooks are ordered procedures with the exact commands, so they can be followed rather than
  interpreted.
- Documentation must not contradict the AGENTS.md contracts. When they disagree, code and tests
  decide, and the docs are corrected.

## Work Guidance

- Update `RESEARCH.md` when upstream capabilities change, instead of leaving a stale summary.
- Keep `DISCOVERY.md` honest about which steps need a signed-in account and which run offline.
- **Append to `HANDOFF.md` as you go**, not at the end: a finding recorded when it is discovered
  keeps its evidence; one reconstructed later loses it. A finding without a stated basis is a
  guess and must be labelled one.
- New findings are appended; a claim that has since become false is corrected **in place**, with a
  dated, labelled amendment that keeps the original wording above it. Never delete the old claim —
  but never leave it standing unmarked either, because appending a contradiction further down
  leaves the false version as the first thing a later reader sees. (F19 carries one such
  amendment.)
- When a finding changes what is verified, update the `What is verified vs not` section in the
  same edit. That section is what a later session will trust.
- Prefer tables and concrete commands over prose.

## Verification

No automated check covers these documents. They are verified by being followed: the runbook's
offline steps must actually run, and the paper trail for an operation must match the spec that
ships.

## Child DOX Index

None. This folder is owned here.
