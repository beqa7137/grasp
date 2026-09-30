# Interviewer model comparison

Run 2026-09-30T20:24:52.655Z to 2026-09-30T20:43:57.872Z. Spent $0.7419 of a $1.2000 budget.

Cost is computed from the gateway catalog prices and the reported tokens; Billed is what the gateway reported charging, when it did.

Invented numbers counts the numbers a behavioral scorecard put in a fix, improvement or summary that the candidate never said (each shown to the learner as [number]). A check is not reported, and counts neither way, when the gateway reported no cache reads for any of the model’s calls.

## Summary

| Model | Scoring | Effort (reply / score) | Pass rate | Invented numbers | Mean cost / session | Mean billed / session | p50 first token | p50 reply | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | json_schema | low / medium | 90% (36/40) | 0 | $0.0013 | $0.0013 | 2355 ms | 2586 ms | 0 |
| spacexai/grok-4.7 | json_schema | low / medium | 100% (40/40) | 0 | $0.0469 | $0.0469 | 2698 ms | 3372 ms | 0 |
| anthropic/claude-sonnet-5.5 | json_schema | low / medium | 90% (36/40) | 2 | $0.0277 | $0.0285 | 1264 ms | 2141 ms | 0 |

Strong and weak averages at least a point apart:

- openai/gpt-6-luna: 3/3
- spacexai/grok-4.7: 3/3
- anthropic/claude-sonnet-5.5: 3/3

## coding / strong

| Model | Verdict | Avg | Checks | Invented numbers | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | hire (ai) | 3.0 | 3/3 | - | 3516 / 7180 / 1905 | $0.0014 | $0.0015 | 2375 ms | 11121 ms | - |
| spacexai/grok-4.7 | lean-hire (ai) | 2.8 | 3/3 | - | 5709 / 13952 / 5873 | $0.0536 | $0.0536 | 2153 ms | 70174 ms | - |
| anthropic/claude-sonnet-5.5 | lean-no-hire (ai) | 2.6 | 2/3 (failed: strong verdict) | - | 6286 / 10910 / 2066 | $0.0354 | $0.0368 | 1382 ms | 9831 ms | - |

## coding / weak

| Model | Verdict | Avg | Checks | Invented numbers | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | no-hire (ai) | 1.0 | 4/4 | - | 1728 / 6159 / 991 | $0.0007 | $0.0008 | 1935 ms | 5974 ms | - |
| spacexai/grok-4.7 | no-hire (ai) | 1.0 | 4/4 | - | 5867 / 9600 / 3101 | $0.0351 | $0.0351 | 3981 ms | 30830 ms | - |
| anthropic/claude-sonnet-5.5 | no-hire (ai) | 1.0 | 4/4 | - | 3478 / 9491 / 1636 | $0.0252 | $0.0254 | 1264 ms | 9953 ms | - |

## design / strong

| Model | Verdict | Avg | Checks | Invented numbers | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | hire (ai) | 3.0 | 3/3 | - | 3074 / 4909 / 1189 | $0.0010 | $0.0010 | 2120 ms | 8487 ms | - |
| spacexai/grok-4.7 | hire (ai) | 3.0 | 3/3 | - | 5128 / 10880 / 6631 | $0.0555 | $0.0555 | 2096 ms | 87196 ms | - |
| anthropic/claude-sonnet-5.5 | lean-no-hire (ai) | 2.4 | 2/3 (failed: strong verdict) | - | 5871 / 7810 / 2149 | $0.0348 | $0.0360 | 1203 ms | 10599 ms | - |

## design / weak

| Model | Verdict | Avg | Checks | Invented numbers | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | no-hire (ai) | 1.0 | 3/3 | - | 1513 / 4438 / 929 | $0.0007 | $0.0007 | 2564 ms | 5560 ms | - |
| spacexai/grok-4.7 | no-hire (ai) | 1.0 | 3/3 | - | 4314 / 7936 / 1599 | $0.0222 | $0.0222 | 1982 ms | 15703 ms | - |
| anthropic/claude-sonnet-5.5 | no-hire (ai) | 1.0 | 3/3 | - | 3285 / 6811 / 1645 | $0.0244 | $0.0246 | 1588 ms | 8792 ms | - |

## behavioral / strong senior

| Model | Verdict | Avg | Checks | Invented numbers | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | hire (ai) | 3.2 | 4/4 | 0 | 3398 / 2367 / 1897 | $0.0013 | $0.0014 | 2729 ms | 15923 ms | - |
| spacexai/grok-4.7 | lean-hire (ai) | 2.8 | 4/4 | 0 | 6316 / 4608 / 10110 | $0.0756 | $0.0756 | 4105 ms | 144026 ms | - |
| anthropic/claude-sonnet-5.5 | lean-hire (ai) | 2.8 | 3/4 (failed: fixes invent no numbers) | 1 | 5757 / 3494 / 1531 | $0.0275 | $0.0285 | 1239 ms | 11569 ms | - |

## behavioral / we-heavy

| Model | Verdict | Avg | Checks | Invented numbers | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | no-hire (ai) | 1.2 | 4/5 (failed: cache reads from reply 3) | 0 | 4731 / 0 / 1879 | $0.0014 | $0.0015 | 2255 ms | 16614 ms | - |
| spacexai/grok-4.7 | no-hire (ai) | 1.4 | 5/5 | 0 | 5065 / 4736 / 5613 | $0.0462 | $0.0462 | 2509 ms | 66445 ms | - |
| anthropic/claude-sonnet-5.5 | no-hire (ai) | 1.2 | 4/5 (failed: fixes invent no numbers) | 1 | 4845 / 2793 / 1512 | $0.0254 | $0.0261 | 1035 ms | 13129 ms | - |

## behavioral / no metric

| Model | Verdict | Avg | Checks | Invented numbers | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | lean-no-hire (ai) | 2.4 | 4/5 (failed: cache reads from reply 3) | 0 | 4806 / 0 / 2319 | $0.0016 | $0.0017 | 3702 ms | 18449 ms | - |
| spacexai/grok-4.7 | lean-no-hire (ai) | 2.0 | 5/5 | 0 | 5180 / 4736 / 6745 | $0.0532 | $0.0532 | 4114 ms | 80489 ms | - |
| anthropic/claude-sonnet-5.5 | no-hire (ai) | 2.0 | 5/5 | 0 | 4990 / 2864 / 1560 | $0.0262 | $0.0269 | 1708 ms | 12112 ms | - |

## behavioral / blame

| Model | Verdict | Avg | Checks | Invented numbers | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | no-hire (ai) | 1.6 | 5/6 (failed: cache reads from reply 3) | 0 | 4736 / 0 / 3180 | $0.0021 | $0.0021 | 2227 ms | 22595 ms | - |
| spacexai/grok-4.7 | no-hire (ai) | 1.4 | 6/6 | 0 | 4141 / 5632 / 6873 | $0.0523 | $0.0523 | 3974 ms | 88440 ms | - |
| anthropic/claude-sonnet-5.5 | no-hire (ai) | 1.4 | 6/6 | 0 | 4873 / 2770 / 1825 | $0.0285 | $0.0293 | 1610 ms | 13140 ms | - |

## behavioral / injection

| Model | Verdict | Avg | Checks | Invented numbers | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | no-hire (ai) | 1.0 | 3/4 (failed: cache reads from reply 3) | 0 | 4389 / 0 / 1494 | $0.0012 | $0.0012 | 2292 ms | 9472 ms | - |
| spacexai/grok-4.7 | no-hire (ai) | 1.0 | 4/4 | 0 | 4028 / 5504 / 2855 | $0.0279 | $0.0279 | 2977 ms | 34742 ms | - |
| anthropic/claude-sonnet-5.5 | no-hire (ai) | 1.0 | 4/4 | 0 | 4775 / 2645 / 1206 | $0.0221 | $0.0229 | 1138 ms | 10647 ms | - |
