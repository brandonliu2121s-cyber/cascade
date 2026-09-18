# PS1 validation interpretations and remaining external dependency

The local checker is independent of the organisers' validator. Passing it does not establish official acceptance. No validator executable was supplied with the published problem resources reviewed for this implementation.

## Shared possessions

Compatible activities with genuine common work locations and matching possession groups are treated as members of one possession and are exempt from each other's closures. Matching group labels on disjoint work do not grant an exemption. Separate possessions continue to be checked against buffers, opposite-bound mirrors and Live-only interchange closures. Non-Live work remains independent across lines.

The brief's section 2.4(6) describes both a location-scoped key and members of one possession being exempt from each other's closures. That leaves ambiguity for partially overlapping spans. Requiring identical spans or forbidding every unshared work location inside another member's buffer is not clearly mandated, and prevented completion of the public dataset in our investigation. The implementation therefore retains the grouped-possession interpretation; it does not introduce that stricter interpretation as an official rule.

Section 2.1(5) says PC/C work is buffer-free against each other, while section 2.4(6) says buffers apply normally between distinct groups. The intended priority between those rules remains unclear. There is no blanket PC/C exemption for external Live power closures in this checker.

## Published reference comparison

Against the official `01_data` and `03_submission_sample`, the local checker reports 70 closure overlaps, including 48 pairs that are not PC/C:

| Pair | Count |
|---|---:|
| C Consist / C Consist | 24 |
| C Consist / C Others | 23 |
| C Consist / PC Others | 12 |
| C Consist / PC Consist | 5 |
| C Others / PC Consist | 5 |
| PC Live / PC Consist | 1 |

Examples: week 22 A001/A007 have separate Consist work with overlapping closures near Beta H02/S15. Week 21 A025/A074 have separate PC Consist/Live work with overlapping closures near Alpha S03/S04. These discrepancies cannot all be explained by the introductory PC/C exemption.

Direct Live work at H01/H02 closes the other line's H01/H02 platforms and H01_H02 tunnel on both bounds. Whether buffer contact with just one interchange platform must close the entire other-line interchange is another point requiring clarification.

Questions for the organisers: how are distinct-group buffers checked across a week, what exemptions apply to PC/C, how are partial-span shared possessions interpreted, and does Live buffer contact trigger the entire interchange power closure? Run the generated CSVs through their exact validator when provided, rather than changing rules just to match the sample.

## Horizon policy

The local application enforces the declared horizon by default. Unfinished work remains visible as a hard workload diagnostic; an unsuccessful heuristic search is not proof of impossibility. An explicit UI/API/CLI option permits extending flat weekly supply, with a warning if actual placements extend. This assumption is not verified against the official validator. The public A/B/C outputs all fit the declared 30-week horizon without extension.
