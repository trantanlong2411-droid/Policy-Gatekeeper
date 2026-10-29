---
name: pharos-policy-gatekeeper
description: Validate Pharos Atlantic read-only actions against server-side spend budget, allowlisted contract and method, and UTC execution window; log every allow/deny and never call RPC on denial.
---

# Policy Gatekeeper

Read config/policy.json to see the three independent rules. The Worker is the policy enforcement point; browser options cannot loosen it.

Each requested action has a stable requestId, notebook stream, target contract, sender account, read-only method and proposedSpendPhrs (a hypothetical number, NOT a blockchain transfer). Request via POST /api/execute.

1. Validate fields and run SPEND_LIMIT, ALLOWLIST and TIME_WINDOW checks at server UTC time.
2. Return ALLOW or DENY with an explicit deciding rule and three PASS/FAIL checks. On DENY, immediately record NOT_EXECUTED and zero RPC requests.
3. On ALLOW, verify Pharos Atlantic chain 688689 and perform ONLY read-only eth_call to an allowlisted view method. Any RPC error is separately recorded as RPC_FAILED_NO_TRANSACTION, not policy DENY.
4. Persist each decision in a SQLite-backed Durable Object; GET /api/audit?stream=ID shows saved history. Reused requestIds do not create duplicate logs.
5. Deny demos test spend above cap, unallowed destination, and an intentionally excluded server UTC window. These demo cases never transfer value.
6. Share the notebook URL and export JSON for reviewer evidence.

No signing, no eth_sendTransaction, no private keys and no real spending are implemented. Hosted Pharos MCP uses mainnet 1672; this demo uses Atlantic 688689.
