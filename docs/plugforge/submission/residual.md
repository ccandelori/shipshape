# Plugforge Residual (post ce-work, pre ce-code-review)

- Minor: e2e/public-ttfe.spec.ts may need secret hash align (sha vs bcrypt in real oauth) + sub secret update in harness for replay test; TTFE timing in real CI (use CC).
- Portal: minimal (no full lists/polish); mgmt via /api/developer (works in session admin).
- OpenAPI for developer internal routes registered basic.
- No DLQ retention policy impl (notes in usage + ops queries); rate baseline post-deploy.
- Agent full rewire deferred (seed + CC + paths ready).
- Web e2e for portal not full (dogfood via fetch in settings; runner will cover public).
- All per deferred in plan; no P0/P1 philosophy (YAGNI, reuse, dedicated, no content tables).

Known residuals logged; acceptable for MVP per Pre-Search risks.
