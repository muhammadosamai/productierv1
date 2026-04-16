# Test cycle: Create issue modal

The test cycle page opens the shared `CreateIssueDialog` instead of an inline form. Optional props `testCycleId` and `testCycleTitle` lock the “Link to Testing Cycle” section and ensure `testCycleId` is sent on create.

- UI: `src/views/TestCycleView.vue`
- Dialog props and read-only cycle link: `src/components/issue/CreateIssueDialog.vue`
