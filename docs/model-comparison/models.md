# Interviewer model comparison

Run 2026-09-30T08:20:51.112Z to 2026-09-30T08:56:37.513Z. Spent $0.5984 of a $3.0000 budget.

Cost is computed from the gateway catalog prices and the reported tokens; Billed is what the gateway reported charging, when it did.

## Summary

| Model | Scoring | Effort (reply / score) | Pass rate | Mean cost / session | Mean billed / session | p50 first token | p50 reply | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| anthropic/claude-sonnet-5.5 | json_schema | low / medium | 94% (33/35) | $0.0279 | $0.0287 | 1136 ms | 1950 ms | 0 |
| google/gemini-3-flash | json_schema | low / high | 74% (26/35) | $0.0109 | $0.0109 | 1578 ms | 1988 ms | 0 |
| openai/gpt-oss-120b | json_schema | low / medium | 100% (35/35) | $0.0015 | $0.0015 | 443 ms | 683 ms | 0 |
| deepseek/deepseek-v4-flash | json_schema | low / medium | 97% (34/35) | $0.0017 | $0.0072 | 3740 ms | 4248 ms | 0 |
| anthropic/claude-haiku-4.5 | json_schema | default / default | 74% (26/35) | $0.0135 | $0.0135 | 700 ms | 1352 ms | 0 |
| alibaba/qwen3.7-plus | text | low / medium | 97% (34/35) | $0.0110 | $0.0110 | 14070 ms | 14603 ms | 0 |

Strong and weak averages at least a point apart:

- anthropic/claude-sonnet-5.5: 3/3
- google/gemini-3-flash: 3/3
- openai/gpt-oss-120b: 3/3
- deepseek/deepseek-v4-flash: 3/3
- anthropic/claude-haiku-4.5: 3/3
- alibaba/qwen3.7-plus: 3/3

## coding / strong

| Model | Verdict | Avg | Checks | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| anthropic/claude-sonnet-5.5 | lean-no-hire (ai) | 2.4 | 2/3 (failed: strong verdict) | 6515 / 10938 / 2107 | $0.0363 | $0.0377 | 1250 ms | 14077 ms | - |
| google/gemini-3-flash | strong-hire (ai) | 4.0 | 2/3 (failed: cache reads from reply 3) | 11325 / 0 / 2193 | $0.0122 | $0.0122 | 875 ms | 8862 ms | - |
| openai/gpt-oss-120b | strong-hire (ai) | 3.8 | 3/3 | 5260 / 6112 / 1302 | $0.0018 | $0.0018 | 375 ms | 6651 ms | - |
| deepseek/deepseek-v4-flash | lean-hire (ai) | 2.6 | 3/3 | 6210 / 5120 / 4597 | $0.0021 | $0.0090 | 3735 ms | 37661 ms | - |
| anthropic/claude-haiku-4.5 | lean-hire (ai) | 3.4 | 2/3 (failed: cache reads from reply 3) | 11883 / 0 / 987 | $0.0168 | $0.0168 | 707 ms | 11582 ms | - |
| alibaba/qwen3.7-plus | strong-hire (ai) | 3.6 | 3/3 | 3627 / 7474 / 6860 | $0.0130 | $0.0129 | 14121 ms | 50730 ms | - |

## coding / weak

| Model | Verdict | Avg | Checks | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| anthropic/claude-sonnet-5.5 | no-hire (ai) | 1.0 | 4/4 | 3551 / 9537 / 1686 | $0.0259 | $0.0261 | 953 ms | 11221 ms | - |
| google/gemini-3-flash | no-hire (ai) | 1.0 | 3/4 (failed: cache reads from reply 3) | 8622 / 0 / 3700 | $0.0154 | $0.0154 | 1188 ms | 8520 ms | - |
| openai/gpt-oss-120b | no-hire (ai) | 1.0 | 4/4 | 3106 / 5536 / 1102 | $0.0014 | $0.0014 | 480 ms | 6122 ms | - |
| deepseek/deepseek-v4-flash | no-hire (ai) | 1.0 | 4/4 | 3714 / 5120 / 3589 | $0.0016 | $0.0066 | 3173 ms | 30467 ms | - |
| anthropic/claude-haiku-4.5 | lean-no-hire (ai) | 1.0 | 3/4 (failed: cache reads from reply 3) | 9217 / 0 / 916 | $0.0138 | $0.0138 | 692 ms | 8838 ms | - |
| alibaba/qwen3.7-plus | no-hire (ai) | 1.0 | 4/4 | 1813 / 6737 / 3324 | $0.0066 | $0.0063 | 7255 ms | 30909 ms | - |

## design / strong

| Model | Verdict | Avg | Checks | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| anthropic/claude-sonnet-5.5 | lean-no-hire (ai) | 2.4 | 2/3 (failed: strong verdict) | 5857 / 7776 / 1978 | $0.0330 | $0.0343 | 1136 ms | 13355 ms | - |
| google/gemini-3-flash | strong-hire (ai) | 4.0 | 2/3 (failed: cache reads from reply 3) | 8515 / 0 / 2094 | $0.0105 | $0.0105 | 1659 ms | 10859 ms | - |
| openai/gpt-oss-120b | strong-hire (ai) | 3.8 | 3/3 | 4648 / 4160 / 1481 | $0.0016 | $0.0016 | 560 ms | 6306 ms | - |
| deepseek/deepseek-v4-flash | lean-hire (ai) | 2.6 | 3/3 | 5080 / 4096 / 5531 | $0.0022 | $0.0097 | 3256 ms | 50175 ms | - |
| anthropic/claude-haiku-4.5 | lean-hire (ai) | 3.0 | 2/3 (failed: cache reads from reply 3) | 10034 / 0 / 1598 | $0.0180 | $0.0180 | 734 ms | 16027 ms | - |
| alibaba/qwen3.7-plus | strong-hire (ai) | 3.6 | 3/3 | 3456 / 5326 / 5782 | $0.0111 | $0.0110 | 11224 ms | 53348 ms | - |

## design / weak

| Model | Verdict | Avg | Checks | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| anthropic/claude-sonnet-5.5 | no-hire (ai) | 1.0 | 3/3 | 3210 / 6815 / 1601 | $0.0238 | $0.0240 | 1736 ms | 9381 ms | - |
| google/gemini-3-flash | no-hire (ai) | 1.0 | 2/3 (failed: cache reads from reply 3) | 6227 / 0 / 1605 | $0.0079 | $0.0079 | 1951 ms | 7005 ms | - |
| openai/gpt-oss-120b | no-hire (ai) | 1.0 | 3/3 | 514 / 5952 / 1053 | $0.0012 | $0.0012 | 453 ms | 3692 ms | - |
| deepseek/deepseek-v4-flash | no-hire (ai) | 1.0 | 3/3 | 1510 / 5120 / 2206 | $0.0009 | $0.0038 | 5182 ms | 13901 ms | - |
| anthropic/claude-haiku-4.5 | no-hire (ai) | 1.0 | 2/3 (failed: cache reads from reply 3) | 7202 / 0 / 913 | $0.0118 | $0.0118 | 870 ms | 8334 ms | - |
| alibaba/qwen3.7-plus | no-hire (ai) | 1.0 | 3/3 | 1685 / 4680 / 4281 | $0.0079 | $0.0077 | 11328 ms | 36053 ms | - |

## behavioral / strong senior

| Model | Verdict | Avg | Checks | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| anthropic/claude-sonnet-5.5 | hire (ai) | 3.2 | 3/3 | 5781 / 3501 / 1605 | $0.0283 | $0.0293 | 1030 ms | 15277 ms | - |
| google/gemini-3-flash | strong-hire (ai) | 3.8 | 2/3 (failed: cache reads from reply 3) | 5724 / 0 / 4405 | $0.0161 | $0.0161 | 1909 ms | 24515 ms | - |
| openai/gpt-oss-120b | strong-hire (ai) | 3.6 | 3/3 | 3645 / 2592 / 1979 | $0.0016 | $0.0016 | 355 ms | 10424 ms | - |
| deepseek/deepseek-v4-flash | hire (ai) | 3.4 | 3/3 | 4167 / 2048 / 6878 | $0.0024 | $0.0110 | 3963 ms | 65375 ms | - |
| anthropic/claude-haiku-4.5 | lean-hire (ai) | 2.8 | 2/3 (failed: cache reads from reply 3) | 6876 / 0 / 1422 | $0.0140 | $0.0140 | 667 ms | 19013 ms | - |
| alibaba/qwen3.7-plus | hire (ai) | 3.4 | 3/3 | 3679 / 2523 / 8110 | $0.0146 | $0.0147 | 19513 ms | 85606 ms | - |

## behavioral / we-heavy

| Model | Verdict | Avg | Checks | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| anthropic/claude-sonnet-5.5 | no-hire (ai) | 1.4 | 4/4 | 4859 / 2803 / 1432 | $0.0246 | $0.0254 | 927 ms | 12318 ms | - |
| google/gemini-3-flash | no-hire (ai) | 1.2 | 3/4 (failed: cache reads from reply 3) | 4587 / 0 / 2010 | $0.0083 | $0.0083 | 1251 ms | 12068 ms | - |
| openai/gpt-oss-120b | no-hire (ai) | 1.2 | 4/4 | 3038 / 2112 / 1459 | $0.0012 | $0.0012 | 395 ms | 8883 ms | - |
| deepseek/deepseek-v4-flash | no-hire (ai) | 1.0 | 4/4 | 4127 / 1024 / 2982 | $0.0013 | $0.0058 | 3740 ms | 25495 ms | - |
| anthropic/claude-haiku-4.5 | no-hire (ai) | 1.0 | 3/4 (failed: cache reads from reply 3) | 5796 / 0 / 1312 | $0.0124 | $0.0124 | 793 ms | 13078 ms | - |
| alibaba/qwen3.7-plus | no-hire (ai) | 1.0 | 4/4 | 4047 / 1052 / 6129 | $0.0115 | $0.0116 | 19522 ms | 60475 ms | - |

## behavioral / no metric

| Model | Verdict | Avg | Checks | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| anthropic/claude-sonnet-5.5 | lean-no-hire (ai) | 1.8 | 4/4 | 4970 / 2849 / 1799 | $0.0285 | $0.0293 | 1429 ms | 13512 ms | - |
| google/gemini-3-flash | no-hire (ai) | 1.8 | 3/4 (failed: cache reads from reply 3) | 4678 / 0 / 2775 | $0.0107 | $0.0107 | 3175 ms | 12273 ms | - |
| openai/gpt-oss-120b | no-hire (ai) | 1.6 | 4/4 | 4984 / 320 / 1804 | $0.0014 | $0.0014 | 895 ms | 9055 ms | - |
| deepseek/deepseek-v4-flash | lean-no-hire (ai) | 2.0 | 4/4 | 4140 / 1024 / 3826 | $0.0016 | $0.0069 | 4172 ms | 38904 ms | - |
| anthropic/claude-haiku-4.5 | lean-no-hire (ai) | 1.6 | 3/4 (failed: cache reads from reply 3) | 5859 / 0 / 1325 | $0.0125 | $0.0125 | 728 ms | 14243 ms | - |
| alibaba/qwen3.7-plus | lean-no-hire (ai) | 2.0 | 4/4 | 4074 / 1068 / 6388 | $0.0119 | $0.0120 | 14304 ms | 67245 ms | - |

## behavioral / blame

| Model | Verdict | Avg | Checks | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| anthropic/claude-sonnet-5.5 | no-hire (ai) | 1.4 | 5/5 | 4878 / 2770 / 1702 | $0.0273 | $0.0281 | 1155 ms | 13877 ms | - |
| google/gemini-3-flash | no-hire (ai) | 1.4 | 4/5 (failed: cache reads from reply 3) | 4539 / 0 / 2041 | $0.0084 | $0.0084 | 911 ms | 12402 ms | - |
| openai/gpt-oss-120b | no-hire (ai) | 1.6 | 5/5 | 2899 / 2176 / 2086 | $0.0016 | $0.0016 | 431 ms | 9422 ms | - |
| deepseek/deepseek-v4-flash | no-hire (ai) | 1.4 | 5/5 | 3990 / 1024 / 3191 | $0.0014 | $0.0060 | 3631 ms | 31513 ms | - |
| anthropic/claude-haiku-4.5 | no-hire (ai) | 1.8 | 4/5 (failed: cache reads from reply 3) | 5791 / 0 / 1105 | $0.0113 | $0.0113 | 672 ms | 11325 ms | - |
| alibaba/qwen3.7-plus | no-hire (ai) | 1.4 | 5/5 | 3982 / 1038 / 6351 | $0.0118 | $0.0119 | 18912 ms | 63432 ms | - |

## behavioral / injection

| Model | Verdict | Avg | Checks | Tokens in / cache read / out | Cost | Billed | p50 first token | Score time | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| anthropic/claude-sonnet-5.5 | no-hire (ai) | 1.0 | 3/3 | 4785 / 2649 / 1342 | $0.0235 | $0.0243 | 1351 ms | 12298 ms | - |
| google/gemini-3-flash | no-hire (ai) | 1.0 | 2/3 (failed: cache reads from reply 3) | 4360 / 0 / 2173 | $0.0087 | $0.0087 | 1669 ms | 12301 ms | - |
| openai/gpt-oss-120b | no-hire (ai) | 1.2 | 3/3 | 2796 / 2080 / 1679 | $0.0013 | $0.0013 | 612 ms | 10251 ms | - |
| deepseek/deepseek-v4-flash | no-hire (ai) | 1.0 | 2/3 (failed: cache reads from reply 3) | 4858 / 0 / 3165 | $0.0015 | $0.0063 | 3003 ms | 32222 ms | - |
| anthropic/claude-haiku-4.5 | no-hire (ai) | 1.0 | 2/3 (failed: cache reads from reply 3) | 5481 / 0 / 1057 | $0.0108 | $0.0108 | 675 ms | 11718 ms | - |
| alibaba/qwen3.7-plus | no-hire (ai) | 1.0 | 2/3 (failed: cache reads from reply 3) | 4783 / 0 / 5611 | $0.0109 | $0.0110 | 16091 ms | 51655 ms | - |
