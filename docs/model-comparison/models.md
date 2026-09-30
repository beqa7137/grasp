# Interviewer model comparison

Run 2026-09-30T09:23:35.216Z to 2026-09-30T10:00:07.142Z. Spent $0.7855 of a $2.0000 budget.

Cost is computed from the gateway catalog prices and the reported tokens; Billed is what the gateway reported charging, when it did.

## Summary

| Model | Scoring | Effort (reply / score) | Pass rate | Mean cost / session | Mean billed / session | p50 first token | p50 reply | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | json_schema | low / medium | 89% (31/35) | $0.0013 | $0.0014 | 2488 ms | 2615 ms | 0 |
| spacexai/grok-4.1-fast-reasoning | json_schema | low / medium | 100% (35/35) | $0.0028 | $0.0028 | 3496 ms | 3810 ms | 0 |
| spacexai/grok-4.7 | json_schema | low / medium | 100% (35/35) | $0.0530 | $0.0530 | 2288 ms | 2826 ms | 0 |
| anthropic/claude-sonnet-5.5 | json_schema | low / medium | 94% (33/35) | $0.0282 | $0.0290 | 1273 ms | 2061 ms | 0 |
| deepseek/deepseek-v4-flash | json_schema | low / medium | 97% (34/35) | $0.0019 | $0.0086 | 3678 ms | 4129 ms | 0 |

Strong and weak averages at least a point apart:

- openai/gpt-6-luna: 3/3
- spacexai/grok-4.1-fast-reasoning: 3/3
- spacexai/grok-4.7: 3/3
- anthropic/claude-sonnet-5.5: 3/3
- deepseek/deepseek-v4-flash: 3/3

## coding / strong

| Model | Verdict | Avg | Checks | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | lean-hire (ai) | 2.8 | 3/3 | 3484 / 7144 / 2356 | $0.0016 | $0.0017 | 2727 ms | 16697 ms | - |
| spacexai/grok-4.1-fast-reasoning | strong-hire (ai) | 3.8 | 3/3 | 3420 / 11468 / 4866 | $0.0037 | $0.0037 | 3544 ms | 14063 ms | - |
| spacexai/grok-4.7 | lean-hire (ai) | 2.8 | 3/3 | 8187 / 11136 / 10847 | $0.0870 | $0.0870 | 2403 ms | 144151 ms | - |
| anthropic/claude-sonnet-5.5 | lean-no-hire (ai) | 2.8 | 2/3 (failed: strong verdict) | 6377 / 10955 / 2121 | $0.0362 | $0.0376 | 1359 ms | 10873 ms | - |
| deepseek/deepseek-v4-flash | lean-hire (ai) | 2.6 | 3/3 | 6086 / 5120 / 10952 | $0.0038 | $0.0174 | 3255 ms | 106632 ms | - |

## coding / weak

| Model | Verdict | Avg | Checks | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | no-hire (ai) | 1.0 | 4/4 | 1740 / 6167 / 1127 | $0.0008 | $0.0008 | 2109 ms | 7606 ms | - |
| spacexai/grok-4.1-fast-reasoning | no-hire (ai) | 1.0 | 4/4 | 1516 / 10275 / 2461 | $0.0020 | $0.0020 | 2657 ms | 8868 ms | - |
| spacexai/grok-4.7 | no-hire (ai) | 1.0 | 4/4 | 5790 / 9600 / 2978 | $0.0342 | $0.0342 | 1935 ms | 32955 ms | - |
| anthropic/claude-sonnet-5.5 | no-hire (ai) | 1.0 | 4/4 | 3681 / 9609 / 1602 | $0.0253 | $0.0256 | 1187 ms | 7834 ms | - |
| deepseek/deepseek-v4-flash | no-hire (ai) | 1.0 | 4/4 | 3774 / 5120 / 2442 | $0.0013 | $0.0051 | 3678 ms | 16995 ms | - |

## design / strong

| Model | Verdict | Avg | Checks | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | lean-hire (ai) | 2.6 | 3/3 | 3038 / 4881 / 1368 | $0.0010 | $0.0011 | 2213 ms | 10454 ms | - |
| spacexai/grok-4.1-fast-reasoning | strong-hire (ai) | 4.0 | 3/3 | 3028 / 8778 / 4041 | $0.0031 | $0.0031 | 2951 ms | 21411 ms | - |
| spacexai/grok-4.7 | lean-hire (ai) | 2.8 | 3/3 | 7554 / 8192 / 10866 | $0.0844 | $0.0844 | 1821 ms | 160241 ms | - |
| anthropic/claude-sonnet-5.5 | lean-no-hire (ai) | 2.2 | 2/3 (failed: strong verdict) | 6136 / 7989 / 2695 | $0.0408 | $0.0421 | 1320 ms | 13152 ms | - |
| deepseek/deepseek-v4-flash | hire (ai) | 3.2 | 3/3 | 4674 / 4096 / 3617 | $0.0017 | $0.0070 | 3358 ms | 29703 ms | - |

## design / weak

| Model | Verdict | Avg | Checks | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | no-hire (ai) | 1.0 | 3/3 | 1493 / 4428 / 679 | $0.0005 | $0.0006 | 2169 ms | 4427 ms | - |
| spacexai/grok-4.1-fast-reasoning | no-hire (ai) | 1.0 | 3/3 | 508 / 8772 / 2006 | $0.0015 | $0.0015 | 2053 ms | 6758 ms | - |
| spacexai/grok-4.7 | no-hire (ai) | 1.0 | 3/3 | 4230 / 8064 / 1370 | $0.0207 | $0.0207 | 1922 ms | 11270 ms | - |
| anthropic/claude-sonnet-5.5 | no-hire (ai) | 1.0 | 3/3 | 3246 / 6810 / 1684 | $0.0247 | $0.0249 | 1636 ms | 7232 ms | - |
| deepseek/deepseek-v4-flash | no-hire (ai) | 1.0 | 3/3 | 1633 / 5120 / 2929 | $0.0011 | $0.0048 | 4763 ms | 19963 ms | - |

## behavioral / strong senior

| Model | Verdict | Avg | Checks | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | hire (ai) | 3.0 | 3/3 | 3386 / 2364 / 2290 | $0.0015 | $0.0016 | 2645 ms | 25212 ms | - |
| spacexai/grok-4.1-fast-reasoning | strong-hire (ai) | 3.6 | 3/3 | 3337 / 4929 / 5146 | $0.0035 | $0.0035 | 5194 ms | 22196 ms | - |
| spacexai/grok-4.7 | lean-hire (ai) | 2.8 | 3/3 | 3877 / 7040 / 10260 | $0.0728 | $0.0728 | 3865 ms | 132671 ms | - |
| anthropic/claude-sonnet-5.5 | lean-hire (ai) | 3.0 | 3/3 | 5784 / 3500 / 1537 | $0.0276 | $0.0286 | 892 ms | 12817 ms | - |
| deepseek/deepseek-v4-flash | hire (ai) | 3.2 | 3/3 | 4184 / 2048 / 10207 | $0.0033 | $0.0154 | 4680 ms | 106541 ms | - |

## behavioral / we-heavy

| Model | Verdict | Avg | Checks | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | no-hire (ai) | 1.4 | 3/4 (failed: cache reads from reply 3) | 4728 / 0 / 2415 | $0.0017 | $0.0018 | 4818 ms | 24876 ms | - |
| spacexai/grok-4.1-fast-reasoning | no-hire (ai) | 1.2 | 4/4 | 2684 / 4576 / 3693 | $0.0026 | $0.0026 | 3368 ms | 18638 ms | - |
| spacexai/grok-4.7 | no-hire (ai) | 1.2 | 4/4 | 4181 / 5632 / 4370 | $0.0374 | $0.0374 | 2217 ms | 45867 ms | - |
| anthropic/claude-sonnet-5.5 | no-hire (ai) | 1.2 | 4/4 | 4883 / 2810 / 1361 | $0.0239 | $0.0247 | 1010 ms | 9849 ms | - |
| deepseek/deepseek-v4-flash | no-hire (ai) | 1.0 | 4/4 | 4098 / 1024 / 3302 | $0.0014 | $0.0062 | 2949 ms | 29482 ms | - |

## behavioral / no metric

| Model | Verdict | Avg | Checks | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | lean-no-hire (ai) | 2.4 | 3/4 (failed: cache reads from reply 3) | 4797 / 0 / 2354 | $0.0017 | $0.0017 | 2675 ms | 16596 ms | - |
| spacexai/grok-4.1-fast-reasoning | lean-hire (ai) | 2.6 | 4/4 | 2697 / 4612 / 5473 | $0.0035 | $0.0035 | 6118 ms | 37820 ms | - |
| spacexai/grok-4.7 | lean-no-hire (ai) | 2.0 | 4/4 | 5181 / 4736 / 8191 | $0.0619 | $0.0619 | 6771 ms | 80209 ms | - |
| anthropic/claude-sonnet-5.5 | lean-no-hire (ai) | 2.0 | 4/4 | 4967 / 2854 / 1359 | $0.0241 | $0.0249 | 1048 ms | 10155 ms | - |
| deepseek/deepseek-v4-flash | lean-no-hire (ai) | 2.2 | 4/4 | 4146 / 1024 / 5906 | $0.0021 | $0.0097 | 5333 ms | 54285 ms | - |

## behavioral / blame

| Model | Verdict | Avg | Checks | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | no-hire (ai) | 1.6 | 4/5 (failed: cache reads from reply 3) | 4688 / 0 / 2515 | $0.0017 | $0.0018 | 2305 ms | 19662 ms | - |
| spacexai/grok-4.1-fast-reasoning | lean-no-hire (ai) | 2.0 | 5/5 | 2646 / 4556 / 3505 | $0.0025 | $0.0025 | 7660 ms | 18480 ms | - |
| spacexai/grok-4.7 | no-hire (ai) | 1.4 | 5/5 | 5068 / 4736 / 5504 | $0.0455 | $0.0455 | 4307 ms | 67100 ms | - |
| anthropic/claude-sonnet-5.5 | no-hire (ai) | 1.4 | 5/5 | 4864 / 2768 / 1489 | $0.0252 | $0.0259 | 1401 ms | 10505 ms | - |
| deepseek/deepseek-v4-flash | no-hire (ai) | 1.4 | 5/5 | 4097 / 1024 / 3191 | $0.0014 | $0.0061 | 4108 ms | 35185 ms | - |

## behavioral / injection

| Model | Verdict | Avg | Checks | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai/gpt-6-luna | no-hire (ai) | 1.0 | 2/3 (failed: cache reads from reply 3) | 4431 / 0 / 2031 | $0.0015 | $0.0015 | 2498 ms | 15597 ms | - |
| spacexai/grok-4.1-fast-reasoning | no-hire (ai) | 1.0 | 3/3 | 2553 / 4444 / 3312 | $0.0024 | $0.0024 | 5831 ms | 15530 ms | - |
| spacexai/grok-4.7 | no-hire (ai) | 1.0 | 3/3 | 4026 / 5504 / 3686 | $0.0329 | $0.0329 | 1622 ms | 45110 ms | - |
| anthropic/claude-sonnet-5.5 | no-hire (ai) | 1.0 | 3/3 | 4761 / 2649 / 1633 | $0.0264 | $0.0271 | 1370 ms | 10418 ms | - |
| deepseek/deepseek-v4-flash | no-hire (ai) | 1.0 | 2/3 (failed: cache reads from reply 3) | 4910 / 0 / 2900 | $0.0014 | $0.0060 | 2208 ms | 29374 ms | - |
