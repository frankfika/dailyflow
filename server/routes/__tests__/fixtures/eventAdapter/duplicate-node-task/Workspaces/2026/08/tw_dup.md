---
id: tw_dup
kind: topic-space
context: work
mindmapId: mm_dup
title: Duplicate projection test
---

# Intent

Edge case: two distinct mindmap nodes (n_a, n_b) both declare the same taskId
(t_dup) via their kind:task metadata. The daily markdown line only points to
one of them (n_a) — the adapter must flag a duplicate-node integrity issue.

# Sections

- Conflict detection
- Repair strategy
