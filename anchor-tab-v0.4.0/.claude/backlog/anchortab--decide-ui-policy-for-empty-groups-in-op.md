---
priority: 5
status: pending
created: 2026-04-24T13:34:03+09:00
size: M
assignee: c2
execution_team: implementer=general-purpose, reviewer=code-reviewer
depends_on: []
parent:
decompose_depth: 0
dor_generated: false
attempts: 0
---

# AnchorTab: decide UI policy for empty groups in options editor

## Goal
Clarify whether user can add empty-tab groups in editor (capture already drops them)

## Context
Code review SHOULD-FIX-1 / Arch #2. Capture filters out empty groups; editor still allows creating them — inconsistency.

## Definition of Ready (DoR)
- [ ] (a) Goal は 1 行で specific & testable
- [ ] (b) Context pointers が列挙
- [ ] (c) External prerequisites unblocked
- [ ] (d) Out-of-Scope が明示
- [ ] (e) Verification が実行可能レベル
- [ ] (f) Execution Team が決定
- [ ] (g) Size = S/M（L は分割）

## Out of Scope
- <TBD>

## Acceptance Criteria
- [ ] <TBD>

## Verification
- **build**: `<TBD>`
- **test**: `<TBD>`
- **ui_check**: `<TBD>`
- **smoke**: `<TBD>`

## Failure Policy
- attempts >= 3 で status=blocked へ自動遷移、blocked_reason 記録
- blocked は pick-next でスキップ、`/backlog blocked` で一覧
