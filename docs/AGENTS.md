# docs/ — research, architecture and runbooks

## Purpose

Durable documentation: what the two upstream tools actually do, how this project is put together,
and the procedure for discovering a new LinkedIn operation.

## Ownership

- `RESEARCH.md` — the evidence base. What `api-anything` and `rea` are, what each ships, its
  limits, and LinkedIn's own constraints (auth shape, allowances, ToS posture).
- `ARCHITECTURE.md` — how the layers fit together and where each responsibility sits.
- `DISCOVERY.md` — the runbook for turning browser evidence into a verified operation spec.

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
- Prefer tables and concrete commands over prose.

## Verification

No automated check covers these documents. They are verified by being followed: the runbook's
offline steps must actually run, and the paper trail for an operation must match the spec that
ships.

## Child DOX Index

None. This folder is owned here.
