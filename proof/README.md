# Policy Gatekeeper — Verified Pharos Atlantic proof

Verified by a public deployed Cloudflare Worker and GitHub Actions on 29 October 2026.

- [Live website](https://policy-gatekeeper.trantanlong2411.workers.dev/)
- [Four saved real policy decisions](https://policy-gatekeeper.trantanlong2411.workers.dev/?stream=ci-policy-1793285601479-5p9iuggm)
- [GitHub Actions verified run](https://github.com/trantanlong2411-droid/Policy-Gatekeeper/actions/runs/40895959166)
- [Machine-readable immutable summary](./verified-scenarios.json)
- [Policy file containing the three rules](../config/policy.json)

## Verified results

| Scenario | Policy decision | Decided by | Execution result | RPC attempts |
| --- | --- | --- | --- | ---: |
| Normal below-limit action on allowed contract during allowed hours | ALLOW | ALL_RULES_PASSED | EXECUTED_READ_ONLY, Pharos Atlantic live value 1.0 | 2 |
| Proposed spending above cap | DENY | SPEND_LIMIT | NOT_EXECUTED | **0** |
| Target outside allowlist | DENY | ALLOWLIST | NOT_EXECUTED | **0** |
| UTC hour intentionally outside demo-only window | DENY | TIME_WINDOW | NOT_EXECUTED | **0** |

The allowed action first checked Pharos Atlantic chain ID 688689, then executed `eth_call` against a public read-only view method on the earlier SagaPlayground test contract.

The three denied actions did **not** perform any RPC call: the server evaluated the policy before invoking the action and persisted each denial with its exact reason.

All four decisions were durably recorded and retrieved using a separate GET against a SQLite-backed Cloudflare Durable Object. Repeating a requestId was idempotent. The proof notebook is frozen against additional public writes, preserving its recorded historical state.

The live GitHub job also uploaded the complete `pharos-policy-gatekeeper-proof` JSON artifact (30-day retention); the saved proof notebook and this summary remain publicly accessible.

## Task coverage

1. Policy/config contains spend limit, allowlisted target+method, and UTC time window.
2. Every valid request returns ALLOW/DENY and which specific rule determined it, alongside three checks.
3. Each of the three rules has a verified denial and **zero** attempted RPC calls.
4. All decisions are retained in a persistent, reloadable and downloadable audit log.

## How to reproduce

Open the [website](https://policy-gatekeeper.trantanlong2411.workers.dev/), click New audit notebook, then try Test allowed action, Deny: spend limit, Deny: allowlist and Deny: time window. Refresh and review the preserved audit.

This is a safe read-only skill demonstration. The spend is a hypothetical proposed budget; no PHRS has been spent, no wallet connected, no blockchain write submitted, and no real transfer security is claimed. The time-window denial uses an explicitly tagged demonstration-only restrictive window.
