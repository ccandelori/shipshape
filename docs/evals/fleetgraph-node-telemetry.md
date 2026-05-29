# FleetGraph Node Telemetry

Generated at: 2026-05-29T21:56:56.592Z

Source report: `docs/evals/fleetgraph-detection-quality-eval.json, docs/evals/fleetgraph-public-trace-verification.json`

Langfuse exposes public sharing at the trace level. Each row below gives the public trace URL plus the concrete observation id for the graph node or model observation inside that trace.

## DQ-Q01 - Completely clean week

Trace: [395191121a1a47b757c1e4e9f3b3917c](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/395191121a1a47b757c1e4e9f3b3917c)

| Observation | Type | Observation id | Parent id | Trace node | Branch path | Guard | Pre-filter | Lifecycle | Tokens | Cost | Latency | Public |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| fleetgraph.at_risk_week.run | CHAIN | `489a15e2f895d447` | — | `run` | `prefilter-exit` | `run` | no | — | 0 | 0 | 555 | yes |
| fleetgraph.at_risk_week.scope | CHAIN | `e65706846b3b44fd` | `489a15e2f895d447` | `scope` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.context | CHAIN | `6245e1de31ff0071` | `489a15e2f895d447` | `context` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.guard | CHAIN | `ddc3b31ca836f888` | `489a15e2f895d447` | `guard` | — | `run` | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.preFilter | CHAIN | `8208f9ef27b2a81b` | `489a15e2f895d447` | `preFilter` | `prefilter-exit` | `run` | no | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.run | SPAN | `t-395191121a1a47b757c1e4e9f3b3917c` | — | `preFilter` | `prefilter-exit` | `run` | no | — | 0 | 0 | — | yes |

## DQ-Q02 - Active work with no blockers

Trace: [48ac10eb11261f4a8342c9b5fe2bfcd8](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/48ac10eb11261f4a8342c9b5fe2bfcd8)

| Observation | Type | Observation id | Parent id | Trace node | Branch path | Guard | Pre-filter | Lifecycle | Tokens | Cost | Latency | Public |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| fleetgraph.at_risk_week.run | CHAIN | `c18d2ac8fcd33e35` | — | `run` | `prefilter-exit` | `run` | no | — | 0 | 0 | 331 | yes |
| fleetgraph.at_risk_week.scope | CHAIN | `73bdc41dfe9eeee6` | `c18d2ac8fcd33e35` | `scope` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.context | CHAIN | `7b1cfbecc74fba85` | `c18d2ac8fcd33e35` | `context` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.guard | CHAIN | `ef250ea62a807605` | `c18d2ac8fcd33e35` | `guard` | — | `run` | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.preFilter | CHAIN | `05500d8183b43758` | `c18d2ac8fcd33e35` | `preFilter` | `prefilter-exit` | `run` | no | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.run | SPAN | `t-48ac10eb11261f4a8342c9b5fe2bfcd8` | — | `preFilter` | `prefilter-exit` | `run` | no | — | 0 | 0 | — | yes |

## DQ-Q03 - Low-priority blocked item with recent positive update

Trace: [0fb30befcc3a0c29aa67e6d3e7827f03](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/0fb30befcc3a0c29aa67e6d3e7827f03)

| Observation | Type | Observation id | Parent id | Trace node | Branch path | Guard | Pre-filter | Lifecycle | Tokens | Cost | Latency | Public |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| fleetgraph.at_risk_week.run | CHAIN | `2f4e9153d7128ef7` | — | `run` | `prefilter-exit` | `run` | no | — | 0 | 0 | 122 | yes |
| fleetgraph.at_risk_week.scope | CHAIN | `540f90335dcd35dc` | `2f4e9153d7128ef7` | `scope` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.context | CHAIN | `fdbf2de8c6832ecd` | `2f4e9153d7128ef7` | `context` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.guard | CHAIN | `c35d33f05678caa7` | `2f4e9153d7128ef7` | `guard` | — | `run` | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.run | SPAN | `t-0fb30befcc3a0c29aa67e6d3e7827f03` | — | `guard` | `prefilter-exit` | `run` | no | — | 0 | 0 | — | yes |
| fleetgraph.at_risk_week.preFilter | CHAIN | `d1d0e689da94c0ba` | `2f4e9153d7128ef7` | `preFilter` | `prefilter-exit` | `run` | no | — | 0 | 0 | 0 | trace-public |

## DQ-Q04 - "Block" language but context is resolved

Trace: [ff8a06791454ec137635c93b52844061](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/ff8a06791454ec137635c93b52844061)

| Observation | Type | Observation id | Parent id | Trace node | Branch path | Guard | Pre-filter | Lifecycle | Tokens | Cost | Latency | Public |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| fleetgraph.at_risk_week.run | CHAIN | `214d6854e2671e33` | — | `run` | `prefilter-exit` | `run` | no | — | 0 | 0 | 124 | yes |
| fleetgraph.at_risk_week.scope | CHAIN | `086d1459f742d35b` | `214d6854e2671e33` | `scope` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.context | CHAIN | `2f9bada168787f61` | `214d6854e2671e33` | `context` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.guard | CHAIN | `2752ccc101fc129d` | `214d6854e2671e33` | `guard` | — | `run` | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.run | SPAN | `t-ff8a06791454ec137635c93b52844061` | — | `guard` | `prefilter-exit` | `run` | no | — | 0 | 0 | — | yes |
| fleetgraph.at_risk_week.preFilter | CHAIN | `559f36e656020204` | `214d6854e2671e33` | `preFilter` | `prefilter-exit` | `run` | no | — | 0 | 0 | 0 | trace-public |

## DQ-Q05 - High volume but all moving with recent standups

Trace: [92847024ef62d15c2dc714a0ce759a19](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/92847024ef62d15c2dc714a0ce759a19)

| Observation | Type | Observation id | Parent id | Trace node | Branch path | Guard | Pre-filter | Lifecycle | Tokens | Cost | Latency | Public |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| fleetgraph.at_risk_week.run | CHAIN | `535e0ca1d3dabfad` | — | `run` | `prefilter-exit` | `run` | no | — | 0 | 0 | 137 | yes |
| fleetgraph.at_risk_week.scope | CHAIN | `5dd66d7c2404b76f` | `535e0ca1d3dabfad` | `scope` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.context | CHAIN | `644a458a1eb30b86` | `535e0ca1d3dabfad` | `context` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.guard | CHAIN | `c6077179397bc3c3` | `535e0ca1d3dabfad` | `guard` | — | `run` | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.preFilter | CHAIN | `a1ca20bdae9f106c` | `535e0ca1d3dabfad` | `preFilter` | `prefilter-exit` | `run` | no | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.run | SPAN | `t-92847024ef62d15c2dc714a0ce759a19` | — | `preFilter` | `prefilter-exit` | `run` | no | — | 0 | 0 | — | yes |

## DQ-Q06 - Old blocker explicitly marked resolved in latest standup

Trace: [f18a74a9a5befc21b2d97bcd30c1c64f](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/f18a74a9a5befc21b2d97bcd30c1c64f)

| Observation | Type | Observation id | Parent id | Trace node | Branch path | Guard | Pre-filter | Lifecycle | Tokens | Cost | Latency | Public |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| fleetgraph.at_risk_week.run | CHAIN | `e1d65c2b4488f2f2` | — | `run` | `prefilter-exit` | `run` | no | — | 0 | 0 | 400 | yes |
| fleetgraph.at_risk_week.scope | CHAIN | `59f7f7b791c9a7f1` | `e1d65c2b4488f2f2` | `scope` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.context | CHAIN | `f82f36607d9e3428` | `e1d65c2b4488f2f2` | `context` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.guard | CHAIN | `d6a6b6a61fed6f69` | `e1d65c2b4488f2f2` | `guard` | — | `run` | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.preFilter | CHAIN | `0ee9c58fccc3c3bb` | `e1d65c2b4488f2f2` | `preFilter` | `prefilter-exit` | `run` | no | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.run | SPAN | `t-f18a74a9a5befc21b2d97bcd30c1c64f` | — | `preFilter` | `prefilter-exit` | `run` | no | — | 0 | 0 | — | yes |

## DQ-R01 - Classic high-priority blocker with standup signal

Trace: [eedcf0102dddb9def28bb663ea1d066a](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/eedcf0102dddb9def28bb663ea1d066a)

| Observation | Type | Observation id | Parent id | Trace node | Branch path | Guard | Pre-filter | Lifecycle | Tokens | Cost | Latency | Public |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| fleetgraph.at_risk_week.run | CHAIN | `ca91938b2c72ec90` | — | `run` | `output` | `run` | yes | `pending_review` | 0 | 0 | 3894 | yes |
| fleetgraph.at_risk_week.scope | CHAIN | `7a0f7ac51908d512` | `ca91938b2c72ec90` | `scope` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.context | CHAIN | `c1bb374531c36fd2` | `ca91938b2c72ec90` | `context` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.guard | CHAIN | `dc526c58b822c8ab` | `ca91938b2c72ec90` | `guard` | — | `run` | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.preFilter | CHAIN | `a292c78dd2c36390` | `ca91938b2c72ec90` | `preFilter` | `model-reason` | `run` | yes | — | 0 | 0 | 0 | trace-public |
| ChatOpenAI | GENERATION | `55cb198bdc045b28` | `8def4dad1df86bfa` | `reason` | — | — | — | — | 1026 | 0.00023085 | 3738 | trace-public |
| fleetgraph.at_risk_week.reason | CHAIN | `354c808a293a899d` | `ca91938b2c72ec90` | `reason` | `model-reason` | `run` | yes | — | 0 | 0 | 3747 | trace-public |
| fleetgraph.at_risk_week.reason.llm | SPAN | `362cda546d71d0e4` | `354c808a293a899d` | `reason` | — | — | — | — | 0 | 0 | 3745 | trace-public |
| RunnableLambda | SPAN | `c7d1323136cf4570` | `9626604449130a3f` | `reason` | — | — | — | — | 0 | 0 | 2 | trace-public |
| RunnableLambda | SPAN | `dd0b5a5842fb1152` | `c7d1323136cf4570` | `reason` | — | — | — | — | 0 | 0 | 1 | trace-public |
| RunnableMap | SPAN | `8def4dad1df86bfa` | `362cda546d71d0e4` | `reason` | — | — | — | — | 0 | 0 | 3740 | trace-public |
| RunnableMap | SPAN | `9626604449130a3f` | `74a01104c0ef7d3d` | `reason` | — | — | — | — | 0 | 0 | 2 | trace-public |
| RunnableWithFallbacks | SPAN | `74a01104c0ef7d3d` | `362cda546d71d0e4` | `reason` | — | — | — | — | 0 | 0 | 3 | trace-public |
| StructuredOutputParser | SPAN | `bc843046fe931601` | `dd0b5a5842fb1152` | `reason` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.policy | CHAIN | `a99185d7d9d09d1d` | `ca91938b2c72ec90` | `policy` | `policy` | `run` | yes | `pending_review` | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.output | CHAIN | `a434a3a8b276299f` | `ca91938b2c72ec90` | `output` | `output` | `run` | yes | `pending_review` | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.run | SPAN | `t-eedcf0102dddb9def28bb663ea1d066a` | — | `output` | `output` | `run` | yes | `pending_review` | 0 | 0 | — | yes |

## DQ-R02 - Multiple stalled issues with no recent updates

Trace: [3912dc4e3ecf5a17aa88af5afc5e40d0](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/3912dc4e3ecf5a17aa88af5afc5e40d0)

| Observation | Type | Observation id | Parent id | Trace node | Branch path | Guard | Pre-filter | Lifecycle | Tokens | Cost | Latency | Public |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| fleetgraph.at_risk_week.run | CHAIN | `1211a0080c24cd58` | — | `run` | `output` | `run` | yes | `pending_review` | 0 | 0 | 3261 | yes |
| fleetgraph.at_risk_week.scope | CHAIN | `52116e094aaffbc9` | `1211a0080c24cd58` | `scope` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.context | CHAIN | `adc82d6abf90d8b1` | `1211a0080c24cd58` | `context` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.guard | CHAIN | `50a0d88551471b7c` | `1211a0080c24cd58` | `guard` | — | `run` | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.preFilter | CHAIN | `a0606f43847220ea` | `1211a0080c24cd58` | `preFilter` | `model-reason` | `run` | yes | — | 0 | 0 | 0 | trace-public |
| ChatOpenAI | GENERATION | `93e51ae10f265140` | `c913e7432a0d700a` | `reason` | — | — | — | — | 996 | 0.0002151 | 3126 | trace-public |
| fleetgraph.at_risk_week.reason | CHAIN | `c12079ca20c0d2cb` | `1211a0080c24cd58` | `reason` | `model-reason` | `run` | yes | — | 0 | 0 | 3131 | trace-public |
| fleetgraph.at_risk_week.reason.llm | SPAN | `8ef072dee613f290` | `c12079ca20c0d2cb` | `reason` | — | — | — | — | 0 | 0 | 3130 | trace-public |
| RunnableLambda | SPAN | `d03d125bc5cfceb6` | `b333466e4e9288d5` | `reason` | — | — | — | — | 0 | 0 | 1 | trace-public |
| RunnableLambda | SPAN | `ec221ff3453876d9` | `d03d125bc5cfceb6` | `reason` | — | — | — | — | 0 | 0 | 0 | trace-public |
| RunnableMap | SPAN | `b333466e4e9288d5` | `1338f5ea97593cda` | `reason` | — | — | — | — | 0 | 0 | 1 | trace-public |
| RunnableMap | SPAN | `c913e7432a0d700a` | `8ef072dee613f290` | `reason` | — | — | — | — | 0 | 0 | 3127 | trace-public |
| RunnableWithFallbacks | SPAN | `1338f5ea97593cda` | `8ef072dee613f290` | `reason` | — | — | — | — | 0 | 0 | 1 | trace-public |
| StructuredOutputParser | SPAN | `975ba47c24aa49ed` | `ec221ff3453876d9` | `reason` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.policy | CHAIN | `ca62cef348dbb34c` | `1211a0080c24cd58` | `policy` | `policy` | `run` | yes | `pending_review` | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.output | CHAIN | `30690f6563288e37` | `1211a0080c24cd58` | `output` | `output` | `run` | yes | `pending_review` | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.run | SPAN | `t-3912dc4e3ecf5a17aa88af5afc5e40d0` | — | `output` | `output` | `run` | yes | `pending_review` | 0 | 0 | — | yes |

## DQ-R03 - Owner overloaded with no visible progress

Trace: [efad6941fb67264083fb252ee89af120](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/efad6941fb67264083fb252ee89af120)

| Observation | Type | Observation id | Parent id | Trace node | Branch path | Guard | Pre-filter | Lifecycle | Tokens | Cost | Latency | Public |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| fleetgraph.at_risk_week.run | CHAIN | `7bc27e5134b3a858` | — | `run` | `output` | `run` | yes | `pending_review` | 0 | 0 | 8257 | yes |
| fleetgraph.at_risk_week.scope | CHAIN | `064eb0da2faa1b82` | `7bc27e5134b3a858` | `scope` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.context | CHAIN | `455568d96542dc1f` | `7bc27e5134b3a858` | `context` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.guard | CHAIN | `b1d68723b7ec8ec6` | `7bc27e5134b3a858` | `guard` | — | `run` | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.preFilter | CHAIN | `0483320525f2592d` | `7bc27e5134b3a858` | `preFilter` | `model-reason` | `run` | yes | — | 0 | 0 | 0 | trace-public |
| ChatOpenAI | GENERATION | `d7084a200695ac42` | `37b949aaf0c7ab94` | `reason` | — | — | — | — | 1519 | 0.0003885 | 8111 | trace-public |
| fleetgraph.at_risk_week.reason | CHAIN | `0a261256eecd2f82` | `7bc27e5134b3a858` | `reason` | `model-reason` | `run` | yes | — | 0 | 0 | 8118 | trace-public |
| fleetgraph.at_risk_week.reason.llm | SPAN | `ef8956160d1afa18` | `0a261256eecd2f82` | `reason` | — | — | — | — | 0 | 0 | 8116 | trace-public |
| RunnableLambda | SPAN | `066e16af9f3e30e8` | `bc9be16fed566b28` | `reason` | — | — | — | — | 0 | 0 | 2 | trace-public |
| RunnableLambda | SPAN | `863c923ec268a1b6` | `066e16af9f3e30e8` | `reason` | — | — | — | — | 0 | 0 | 0 | trace-public |
| RunnableMap | SPAN | `37b949aaf0c7ab94` | `ef8956160d1afa18` | `reason` | — | — | — | — | 0 | 0 | 8112 | trace-public |
| RunnableMap | SPAN | `bc9be16fed566b28` | `cebbcde1c5a17e67` | `reason` | — | — | — | — | 0 | 0 | 2 | trace-public |
| RunnableWithFallbacks | SPAN | `cebbcde1c5a17e67` | `ef8956160d1afa18` | `reason` | — | — | — | — | 0 | 0 | 3 | trace-public |
| StructuredOutputParser | SPAN | `5ecfd635d63a7a95` | `863c923ec268a1b6` | `reason` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.policy | CHAIN | `c24ed8955d770292` | `7bc27e5134b3a858` | `policy` | `policy` | `run` | yes | `pending_review` | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.output | CHAIN | `9dea4c053ea66bfc` | `7bc27e5134b3a858` | `output` | `output` | `run` | yes | `pending_review` | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.run | SPAN | `t-efad6941fb67264083fb252ee89af120` | — | `output` | `output` | `run` | yes | `pending_review` | 0 | 0 | — | yes |

## DQ-R04 - Aging technical blocker near week end

Trace: [9e459de6a80456442218e628441d4b9c](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/9e459de6a80456442218e628441d4b9c)

| Observation | Type | Observation id | Parent id | Trace node | Branch path | Guard | Pre-filter | Lifecycle | Tokens | Cost | Latency | Public |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| fleetgraph.at_risk_week.run | CHAIN | `7966b3b4147e00a7` | — | `run` | `output` | `run` | yes | `pending_review` | 0 | 0 | 3812 | yes |
| fleetgraph.at_risk_week.scope | CHAIN | `580d567c5178f09a` | `7966b3b4147e00a7` | `scope` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.context | CHAIN | `f2c645f718b90b76` | `7966b3b4147e00a7` | `context` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.guard | CHAIN | `b9aabca770b2c325` | `7966b3b4147e00a7` | `guard` | — | `run` | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.preFilter | CHAIN | `af9fd624f248ae5a` | `7966b3b4147e00a7` | `preFilter` | `model-reason` | `run` | yes | — | 0 | 0 | 0 | trace-public |
| ChatOpenAI | GENERATION | `f6584b0c30b8dc94` | `fca779d08cd3d4ea` | `reason` | — | — | — | — | 1000 | 0.0002256 | 3662 | trace-public |
| fleetgraph.at_risk_week.reason | CHAIN | `9304c19d831c95c4` | `7966b3b4147e00a7` | `reason` | `model-reason` | `run` | yes | — | 0 | 0 | 3666 | trace-public |
| fleetgraph.at_risk_week.reason.llm | SPAN | `11bf8e0305515f2f` | `9304c19d831c95c4` | `reason` | — | — | — | — | 0 | 0 | 3666 | trace-public |
| RunnableLambda | SPAN | `a1ee9333b2b0570b` | `ae90d4d6969d1169` | `reason` | — | — | — | — | 0 | 0 | 0 | trace-public |
| RunnableLambda | SPAN | `f8ebedd7c597bf1f` | `a1ee9333b2b0570b` | `reason` | — | — | — | — | 0 | 0 | 0 | trace-public |
| RunnableMap | SPAN | `ae90d4d6969d1169` | `49356d378ca8f04f` | `reason` | — | — | — | — | 0 | 0 | 1 | trace-public |
| RunnableMap | SPAN | `fca779d08cd3d4ea` | `11bf8e0305515f2f` | `reason` | — | — | — | — | 0 | 0 | 3663 | trace-public |
| RunnableWithFallbacks | SPAN | `49356d378ca8f04f` | `11bf8e0305515f2f` | `reason` | — | — | — | — | 0 | 0 | 1 | trace-public |
| StructuredOutputParser | SPAN | `47542af42f34b15b` | `f8ebedd7c597bf1f` | `reason` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.policy | CHAIN | `8aac1fc5bd10f631` | `7966b3b4147e00a7` | `policy` | `policy` | `run` | yes | `pending_review` | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.output | CHAIN | `e8f917be5be0961c` | `7966b3b4147e00a7` | `output` | `output` | `run` | yes | `pending_review` | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.run | SPAN | `t-9e459de6a80456442218e628441d4b9c` | — | `output` | `output` | `run` | yes | `pending_review` | 0 | 0 | — | yes |

## DQ-R05 - Missing weekly plan + visible stalling

Trace: [c9ef7e6b82d2ec366c45b04e42c92758](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/c9ef7e6b82d2ec366c45b04e42c92758)

| Observation | Type | Observation id | Parent id | Trace node | Branch path | Guard | Pre-filter | Lifecycle | Tokens | Cost | Latency | Public |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| fleetgraph.at_risk_week.run | CHAIN | `ac01fc3e506ee94f` | — | `run` | `output` | `run` | yes | `pending_review` | 0 | 0 | 4208 | yes |
| fleetgraph.at_risk_week.scope | CHAIN | `823c7f59d586522a` | `ac01fc3e506ee94f` | `scope` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.context | CHAIN | `f0233f4faa6de91f` | `ac01fc3e506ee94f` | `context` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.guard | CHAIN | `6db6fe6f6787d940` | `ac01fc3e506ee94f` | `guard` | — | `run` | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.preFilter | CHAIN | `344d7a7cd692650a` | `ac01fc3e506ee94f` | `preFilter` | `model-reason` | `run` | yes | — | 0 | 0 | 0 | trace-public |
| ChatOpenAI | GENERATION | `75e2f9e8337521f2` | `3e62afa1bfaac680` | `reason` | — | — | — | — | 1194 | 0.0002763 | 4067 | trace-public |
| fleetgraph.at_risk_week.reason | CHAIN | `e9369e17fd5cd585` | `ac01fc3e506ee94f` | `reason` | `model-reason` | `run` | yes | — | 0 | 0 | 4072 | trace-public |
| fleetgraph.at_risk_week.reason.llm | SPAN | `2f027c76c1faf627` | `e9369e17fd5cd585` | `reason` | — | — | — | — | 0 | 0 | 4071 | trace-public |
| RunnableLambda | SPAN | `276f050b44565707` | `4239b9dde0b793a9` | `reason` | — | — | — | — | 0 | 0 | 0 | trace-public |
| RunnableLambda | SPAN | `4239b9dde0b793a9` | `dad7115276689d46` | `reason` | — | — | — | — | 0 | 0 | 0 | trace-public |
| RunnableMap | SPAN | `3e62afa1bfaac680` | `2f027c76c1faf627` | `reason` | — | — | — | — | 0 | 0 | 4068 | trace-public |
| RunnableMap | SPAN | `dad7115276689d46` | `7c4b2b920fe377eb` | `reason` | — | — | — | — | 0 | 0 | 1 | trace-public |
| RunnableWithFallbacks | SPAN | `7c4b2b920fe377eb` | `2f027c76c1faf627` | `reason` | — | — | — | — | 0 | 0 | 1 | trace-public |
| StructuredOutputParser | SPAN | `dcd8957f81d18a32` | `276f050b44565707` | `reason` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.policy | CHAIN | `5a90c80f07f529b9` | `ac01fc3e506ee94f` | `policy` | `policy` | `run` | yes | `pending_review` | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.output | CHAIN | `064f54b611f6fe20` | `ac01fc3e506ee94f` | `output` | `output` | `run` | yes | `pending_review` | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.run | SPAN | `t-c9ef7e6b82d2ec366c45b04e42c92758` | — | `output` | `output` | `run` | yes | `pending_review` | 0 | 0 | — | yes |

## DQ-R06 - Subtle risk: volume + silence on critical path

Trace: [afe6fce1844efe9340e4c6d6e8b06058](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/afe6fce1844efe9340e4c6d6e8b06058)

| Observation | Type | Observation id | Parent id | Trace node | Branch path | Guard | Pre-filter | Lifecycle | Tokens | Cost | Latency | Public |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| fleetgraph.at_risk_week.run | CHAIN | `beab3552620b574e` | — | `run` | `output` | `run` | yes | `pending_review` | 0 | 0 | 5706 | yes |
| fleetgraph.at_risk_week.scope | CHAIN | `b94872225da22418` | `beab3552620b574e` | `scope` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.context | CHAIN | `91f268eae1350a5a` | `beab3552620b574e` | `context` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.guard | CHAIN | `c8cb6d7069a17080` | `beab3552620b574e` | `guard` | — | `run` | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.preFilter | CHAIN | `85b44049f8fef829` | `beab3552620b574e` | `preFilter` | `model-reason` | `run` | yes | — | 0 | 0 | 0 | trace-public |
| ChatOpenAI | GENERATION | `108dfd54ca76571c` | `ee4fa56354e18fbf` | `reason` | — | — | — | — | 1352 | 0.00033015 | 5561 | trace-public |
| fleetgraph.at_risk_week.reason | CHAIN | `0e0f54e68f5a7cf3` | `beab3552620b574e` | `reason` | `model-reason` | `run` | yes | — | 0 | 0 | 5565 | trace-public |
| fleetgraph.at_risk_week.reason.llm | SPAN | `3a84b977655baba1` | `0e0f54e68f5a7cf3` | `reason` | — | — | — | — | 0 | 0 | 5564 | trace-public |
| RunnableLambda | SPAN | `0beb3ef8ea786902` | `1726e44e60b63126` | `reason` | — | — | — | — | 0 | 0 | 1 | trace-public |
| RunnableLambda | SPAN | `5b582b75d8033cd2` | `0beb3ef8ea786902` | `reason` | — | — | — | — | 0 | 0 | 1 | trace-public |
| RunnableMap | SPAN | `1726e44e60b63126` | `d4d768a0e4ee94fd` | `reason` | — | — | — | — | 0 | 0 | 1 | trace-public |
| RunnableMap | SPAN | `ee4fa56354e18fbf` | `3a84b977655baba1` | `reason` | — | — | — | — | 0 | 0 | 5562 | trace-public |
| RunnableWithFallbacks | SPAN | `d4d768a0e4ee94fd` | `3a84b977655baba1` | `reason` | — | — | — | — | 0 | 0 | 2 | trace-public |
| StructuredOutputParser | SPAN | `f081d4e72b4bb007` | `5b582b75d8033cd2` | `reason` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.policy | CHAIN | `e80db267afe65cd9` | `beab3552620b574e` | `policy` | `policy` | `run` | yes | `pending_review` | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.output | CHAIN | `041ada87896c0845` | `beab3552620b574e` | `output` | `output` | `run` | yes | `pending_review` | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.run | SPAN | `t-afe6fce1844efe9340e4c6d6e8b06058` | — | `output` | `output` | `run` | yes | `pending_review` | 0 | 0 | — | yes |

## DQ-R07 - Iteration blocker with no standup coverage

Trace: [de9cab014f1d332186c0b62e06448d9f](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/de9cab014f1d332186c0b62e06448d9f)

| Observation | Type | Observation id | Parent id | Trace node | Branch path | Guard | Pre-filter | Lifecycle | Tokens | Cost | Latency | Public |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| fleetgraph.at_risk_week.run | CHAIN | `5f744fa4015fdbae` | — | `run` | `output` | `run` | yes | `pending_review` | 0 | 0 | 4478 | yes |
| fleetgraph.at_risk_week.scope | CHAIN | `a2f95c44f41e48a1` | `5f744fa4015fdbae` | `scope` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.context | CHAIN | `30d970cca88ef0d8` | `5f744fa4015fdbae` | `context` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.guard | CHAIN | `e4b172f98f179f86` | `5f744fa4015fdbae` | `guard` | — | `run` | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.preFilter | CHAIN | `84474ddf4b776480` | `5f744fa4015fdbae` | `preFilter` | `model-reason` | `run` | yes | — | 0 | 0 | 0 | trace-public |
| ChatOpenAI | GENERATION | `6f824e8657367e18` | `184787cb34c9cb7d` | `reason` | — | — | — | — | 1018 | 0.0002373 | 4153 | trace-public |
| fleetgraph.at_risk_week.reason | CHAIN | `4378f11869de60c3` | `5f744fa4015fdbae` | `reason` | `model-reason` | `run` | yes | — | 0 | 0 | 4157 | trace-public |
| fleetgraph.at_risk_week.reason.llm | SPAN | `6fb0e28a92095328` | `4378f11869de60c3` | `reason` | — | — | — | — | 0 | 0 | 4156 | trace-public |
| RunnableLambda | SPAN | `4cce0a2afc6cd68e` | `cd78f7b7f7dff0cf` | `reason` | — | — | — | — | 0 | 0 | 0 | trace-public |
| RunnableLambda | SPAN | `cd78f7b7f7dff0cf` | `39fb87952f2138e9` | `reason` | — | — | — | — | 0 | 0 | 0 | trace-public |
| RunnableMap | SPAN | `184787cb34c9cb7d` | `6fb0e28a92095328` | `reason` | — | — | — | — | 0 | 0 | 4154 | trace-public |
| RunnableMap | SPAN | `39fb87952f2138e9` | `91318e86621aa2ec` | `reason` | — | — | — | — | 0 | 0 | 0 | trace-public |
| RunnableWithFallbacks | SPAN | `91318e86621aa2ec` | `6fb0e28a92095328` | `reason` | — | — | — | — | 0 | 0 | 1 | trace-public |
| StructuredOutputParser | SPAN | `a88a82307783e046` | `4cce0a2afc6cd68e` | `reason` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.policy | CHAIN | `fec7d2437c1aabea` | `5f744fa4015fdbae` | `policy` | `policy` | `run` | yes | `pending_review` | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.output | CHAIN | `28735955dc4aef10` | `5f744fa4015fdbae` | `output` | `output` | `run` | yes | `pending_review` | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.run | SPAN | `t-de9cab014f1d332186c0b62e06448d9f` | — | `output` | `output` | `run` | yes | `pending_review` | 0 | 0 | — | yes |

## DQ-R08 - Critical path items silent for multiple standups

Trace: [40a2a18b8cfdc3ffcad3d80dc5414306](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/40a2a18b8cfdc3ffcad3d80dc5414306)

| Observation | Type | Observation id | Parent id | Trace node | Branch path | Guard | Pre-filter | Lifecycle | Tokens | Cost | Latency | Public |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| fleetgraph.at_risk_week.run | CHAIN | `b6e882e933b47293` | — | `run` | `output` | `run` | yes | `pending_review` | 0 | 0 | 5865 | yes |
| fleetgraph.at_risk_week.scope | CHAIN | `ef24afc1905d5774` | `b6e882e933b47293` | `scope` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.context | CHAIN | `e7d4bb314d0ebc75` | `b6e882e933b47293` | `context` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.guard | CHAIN | `df821ceae0af74e4` | `b6e882e933b47293` | `guard` | — | `run` | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.preFilter | CHAIN | `40de22ffde53c6fc` | `b6e882e933b47293` | `preFilter` | `model-reason` | `run` | yes | — | 0 | 0 | 0 | trace-public |
| ChatOpenAI | GENERATION | `bde286cce6ae4a1d` | `8e1631cb55e86fe9` | `reason` | — | — | — | — | 1560 | 0.00039375 | 5654 | trace-public |
| fleetgraph.at_risk_week.reason | CHAIN | `dc1c5a85b77afd6a` | `b6e882e933b47293` | `reason` | `model-reason` | `run` | yes | — | 0 | 0 | 5658 | trace-public |
| fleetgraph.at_risk_week.reason.llm | SPAN | `44f9805f2f08bfb9` | `dc1c5a85b77afd6a` | `reason` | — | — | — | — | 0 | 0 | 5657 | trace-public |
| RunnableLambda | SPAN | `02e946f4c5fd4147` | `1c22bc0364ed71e4` | `reason` | — | — | — | — | 0 | 0 | 1 | trace-public |
| RunnableLambda | SPAN | `1c22bc0364ed71e4` | `97070b478aa2d8cd` | `reason` | — | — | — | — | 0 | 0 | 1 | trace-public |
| RunnableMap | SPAN | `8e1631cb55e86fe9` | `44f9805f2f08bfb9` | `reason` | — | — | — | — | 0 | 0 | 5654 | trace-public |
| RunnableMap | SPAN | `97070b478aa2d8cd` | `4fed90557b366f6e` | `reason` | — | — | — | — | 0 | 0 | 1 | trace-public |
| RunnableWithFallbacks | SPAN | `4fed90557b366f6e` | `44f9805f2f08bfb9` | `reason` | — | — | — | — | 0 | 0 | 1 | trace-public |
| StructuredOutputParser | SPAN | `d507fc248201dd25` | `02e946f4c5fd4147` | `reason` | — | — | — | — | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.policy | CHAIN | `8f9d29b10f518205` | `b6e882e933b47293` | `policy` | `policy` | `run` | yes | `pending_review` | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.output | CHAIN | `de657cbd3b521bd4` | `b6e882e933b47293` | `output` | `output` | `run` | yes | `pending_review` | 0 | 0 | 0 | trace-public |
| fleetgraph.at_risk_week.run | SPAN | `t-40a2a18b8cfdc3ffcad3d80dc5414306` | — | `output` | `output` | `run` | yes | `pending_review` | 0 | 0 | — | yes |

## TRACE-144ea791 - fleetgraph.at_risk_week.run

Trace: [144ea791af91486a3a83f102f52856c0](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/144ea791af91486a3a83f102f52856c0)

| Observation | Type | Observation id | Parent id | Trace node | Branch path | Guard | Pre-filter | Lifecycle | Tokens | Cost | Latency | Public |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| fleetgraph.at_risk_week.run | CHAIN | `52564e9c8eb6015c` | — | `run` | `prefilter-exit` | `run` | no | — | 0 | 0 | 447 | yes |
| fleetgraph.at_risk_week.scope | CHAIN | `664af629eccd1d2a` | `52564e9c8eb6015c` | `scope` | — | — | — | — | 0 | 0 | 14 | trace-public |
| fleetgraph.at_risk_week.context | CHAIN | `6b0ea1c3f3a02ae8` | `52564e9c8eb6015c` | `context` | — | — | — | — | 0 | 0 | 18 | trace-public |
| fleetgraph.at_risk_week.guard | CHAIN | `bcdd48481ce17aa7` | `52564e9c8eb6015c` | `guard` | — | `run` | — | — | 0 | 0 | 5 | trace-public |
| fleetgraph.at_risk_week.preFilter | CHAIN | `e4f640898c2454e8` | `52564e9c8eb6015c` | `preFilter` | `prefilter-exit` | `run` | no | — | 0 | 0 | 2 | trace-public |
| fleetgraph.at_risk_week.run | SPAN | `t-144ea791af91486a3a83f102f52856c0` | — | `preFilter` | `prefilter-exit` | `run` | no | — | 0 | 0 | — | yes |

## TRACE-b0fb54c7 - fleetgraph.at_risk_week.output

Trace: [b0fb54c7f46e28c96d1eaa531fc89d0d](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b0fb54c7f46e28c96d1eaa531fc89d0d)

| Observation | Type | Observation id | Parent id | Trace node | Branch path | Guard | Pre-filter | Lifecycle | Tokens | Cost | Latency | Public |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| fleetgraph.at_risk_week.run | CHAIN | `f300e6792045484c` | — | `run` | `output` | `run` | yes | `open` | 0 | 0 | 7385 | yes |
| fleetgraph.at_risk_week.scope | CHAIN | `0b4690c7d29010ab` | `f300e6792045484c` | `scope` | — | — | — | — | 0 | 0 | 5 | trace-public |
| fleetgraph.at_risk_week.context | CHAIN | `04d8e5ba18b7919d` | `f300e6792045484c` | `context` | — | — | — | — | 0 | 0 | 20 | trace-public |
| fleetgraph.at_risk_week.guard | CHAIN | `90eb8b19f1f472f3` | `f300e6792045484c` | `guard` | — | `run` | — | — | 0 | 0 | 27 | trace-public |
| fleetgraph.at_risk_week.preFilter | CHAIN | `63af0c054b1a0fb2` | `f300e6792045484c` | `preFilter` | `model-reason` | `run` | yes | — | 0 | 0 | 1 | trace-public |
| fleetgraph.at_risk_week.run | SPAN | `t-b0fb54c7f46e28c96d1eaa531fc89d0d` | — | `preFilter` | `output` | `run` | yes | `open` | 0 | 0 | — | yes |
| ChatOpenAI | GENERATION | `bdf1fe9e2945a39e` | `a91f6d495be63a64` | `reason` | — | — | — | — | 1292 | 0.00026445 | 6745 | trace-public |
| fleetgraph.at_risk_week.reason | CHAIN | `4f2b94cf8413cd00` | `f300e6792045484c` | `reason` | `model-reason` | `run` | yes | — | 0 | 0 | 6791 | trace-public |
| fleetgraph.at_risk_week.reason.llm | SPAN | `cd564e0cc0e46f13` | `4f2b94cf8413cd00` | `reason` | — | — | — | — | 0 | 0 | 6783 | trace-public |
| RunnableLambda | SPAN | `0a207e4f251289ac` | `d4ce7c14f9313a23` | `reason` | — | — | — | — | 0 | 0 | 5 | trace-public |
| RunnableLambda | SPAN | `d4ce7c14f9313a23` | `e2cdd5623c0f5eca` | `reason` | — | — | — | — | 0 | 0 | 8 | trace-public |
| RunnableMap | SPAN | `a91f6d495be63a64` | `cd564e0cc0e46f13` | `reason` | — | — | — | — | 0 | 0 | 6758 | trace-public |
| RunnableMap | SPAN | `e2cdd5623c0f5eca` | `e86fd92abbf2be0f` | `reason` | — | — | — | — | 0 | 0 | 10 | trace-public |
| RunnableWithFallbacks | SPAN | `e86fd92abbf2be0f` | `cd564e0cc0e46f13` | `reason` | — | — | — | — | 0 | 0 | 15 | trace-public |
| StructuredOutputParser | SPAN | `8477f75677dbe9ad` | `0a207e4f251289ac` | `reason` | — | — | — | — | 0 | 0 | 2 | trace-public |
| fleetgraph.at_risk_week.policy | CHAIN | `878446e851aa2b43` | `f300e6792045484c` | `policy` | `policy` | `run` | yes | `open` | 0 | 0 | 2 | trace-public |
| fleetgraph.at_risk_week.output | CHAIN | `c462342404db7122` | `f300e6792045484c` | `output` | `output` | `run` | yes | `open` | 0 | 0 | 47 | trace-public |
| fleetgraph.at_risk_week.output | SPAN | `t-b0fb54c7f46e28c96d1eaa531fc89d0d` | — | `output` | `output` | `run` | yes | `open` | 0 | 0 | — | yes |

## TRACE-b2624ad3 - fleetgraph.chat.response

Trace: [b2624ad3010625d9f91ce4945404e758](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/b2624ad3010625d9f91ce4945404e758)

| Observation | Type | Observation id | Parent id | Trace node | Branch path | Guard | Pre-filter | Lifecycle | Tokens | Cost | Latency | Public |
|---|---|---|---|---|---|---|---|---|---:|---:|---:|---|
| fleetgraph.chat.llm | GENERATION | `cbce54cd6e9afde2` | `842406515f8f12c7` | — | — | — | — | — | 2163 | 0.00023445 | 3741 | trace-public |
| fleetgraph.chat.response | CHAIN | `842406515f8f12c7` | — | — | — | — | — | — | 0 | 0 | 4086 | yes |
| fleetgraph.chat.response | SPAN | `t-b2624ad3010625d9f91ce4945404e758` | — | — | — | — | — | — | 0 | 0 | — | yes |

