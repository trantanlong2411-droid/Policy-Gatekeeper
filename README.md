# Policy Gatekeeper — Pharos Agent Arena (Medium, 100 points)

[Public website](https://policy-gatekeeper.trantanlong2411.workers.dev/) · [GitHub](https://github.com/trantanlong2411-droid/Policy-Gatekeeper)

This is a pre-execution policy gate for public, read-only Pharos Atlantic smart-contract calls. Before any RPC action is performed, it evaluates three independent rules: a maximum proposed spending budget, a contract-and-method allowlist, and allowed UTC execution hours. Every request produces ALLOW or DENY with the exact deciding rule and all individual checks. DENY cases never invoke an RPC method. Every decision is appended to an auditable, SQLite-backed Cloudflare Durable Object, so the history survives page refresh and Worker deployments.

The policy is stored in [config/policy.json](./config/policy.json). Changing the committed file and redeploying updates the real server-side policy; web clients cannot override the standard policy. The window defaults to 00:00–24:00 UTC for continuous availability. The dedicated **denyTime** test constructs a narrow demonstrative server-side policy window that intentionally excludes the current UTC hour, clearly labeled as a demonstration of the time-window rule.

## Critical limits / honesty

The `requestedSpendPhrs` field represents the agent's **hypothetical proposed spending amount** for policy evaluation, not real funds, fees or on-chain spending. All ALLOW executions use **eth_call only**, with zero ETH/PHRS value, to query the existing public SagaPlayground testnet contract. No token transfers, wallet signatures or transaction broadcasting are possible. The project demonstrates policy enforcement for simulated budgets and live read-only actions; it does **not** claim to enforce actual production transfers or secure spending limits for a separate external agent.

The public audit notebook is not authenticated or private. It is suitable only for harmless demos and reviewer proofs, not for personal or financial data. There is no privileged administrative route for policy override.

Network: Pharos Atlantic Testnet 688689. Public read-only RPC via `https://atlantic.dplabs-internal.com`. Hosted Pharos MCP is mainnet 1672, so this demo reads Atlantic JSON-RPC directly.

## Verified deployed execution proof

- [Permanent reviewer evidence](./proof/README.md) includes one allowed real Pharos read and a denial for each of three rule types.
- [Read-only public saved audit](https://policy-gatekeeper.trantanlong2411.workers.dev/?stream=ci-policy-1793285601479-5p9iuggm) includes 4 independently persisted decisions, 3 of which were denied with zero RPC attempts.
- [GitHub Actions run 40895959166](https://github.com/trantanlong2411-droid/Policy-Gatekeeper/actions/runs/40895959166) passed live HTTP / Pharos testnet checks and 10/10 tests.
- Follow-up GitHub Actions deployment checks the same original journal to prove the history was not lost when Worker code was updated.

## Requirement mapping

| Task requirement | Evidence |
|---|---|
| Policy file contains 3+ rule types | Version-controlled `config/policy.json` contains SPEND_LIMIT, ALLOWLIST (contract + method), TIME_WINDOW (UTC). |
| Each request reports allow/deny and exact rule | `decision`, `decidedBy`, and three `checks` are returned from the server. All-rule PASS returns `ALL_RULES_PASSED`. |
| Denied actions are never executed; one deny per rule | Server evaluates before any RPC invocation. `rpcCallsAttempted=0` and `executionStatus=NOT_EXECUTED` for each of three deny demos; allow only executes `eth_call`. |
| Keeps audit log | Cloudflare SQLite-backed Durable Object saves records and unique request IDs, allowing reload and downloadable JSON evidence. |

## Reviewer walkthrough

1. Open the [website](https://policy-gatekeeper.trantanlong2411.workers.dev/).
2. Click **Test allowed action**. Default request is within all three rules. The policy decision should be `ALLOW`, followed by an actual read-only `eth_call`, returning `EXECUTED_READ_ONLY` if the RPC is available.
3. Click **Deny: spend limit**. The server inserts an intentionally above-cap proposed amount of 1 PHRS. The result must be `DENY / SPEND_LIMIT` with `rpcCallsAttempted=0`.
4. Click **Deny: allowlist**. The server switches to an unallowed contract for that demonstrative request. The result must be `DENY / ALLOWLIST`, no RPC.
5. Click **Deny: time window**. The server deliberately uses a restricted test UTC window excluding the actual current server hour. The result must be `DENY / TIME_WINDOW`, no RPC.
6. Refresh the page or click Reload audit. Each decision remains stored, including UTC timestamp, checks, reason, whether RPC was attempted, and action outcome. Export JSON evidence and use the notebook URL as Proof Link.
7. Repeating the same request ID produces a duplicate response rather than a second audit event.

The DEMO scenarios are explicitly identified. They are not secret overrides to allow any spending, and they never submit real transactions.

## Test and deploy

```bash
npm install
npm test
npm run build-check
npx wrangler deploy
```

Cloudflare's connected GitHub integration deploys the `main` branch. GitHub Actions also runs unit tests and a **live deployed-worker test** that checks all three denial reasons, confirms zero RPC calls for denied requests, verifies one allowed read-only RPC call, and reloads the saved audit from Cloudflare. The successful job uploads `pharos-policy-gatekeeper-proof` as a JSON artifact (30-day retention). An offline unit-test pass must not be represented as live network proof.

[GitHub Actions workflow](https://github.com/trantanlong2411-droid/Policy-Gatekeeper/actions/workflows/verify.yml).

## References

- [Policy Gatekeeper task](https://pharos-agent-arena.vercel.app/tasks/policy-gatekeeper)
- [Cloudflare Durable Object storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)
- [Ethereum eth_call](https://ethereum.org/en/developers/docs/apis/json-rpc/)
- [Pharos MCP](https://github.com/PharosNetwork/pharos-mcp)
