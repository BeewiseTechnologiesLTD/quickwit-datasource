# Custom Display Fields in Explore View

## Problem

Explore currently shows log lines as: `timestamp | message`. Users want to display additional fields (e.g., `module`, `bhome`) as visible columns between timestamp and message, configured per-datasource.

## Design

### New Configuration: `displayFields`

A comma-separated string in datasource settings. Example: `"module,bhome"`.

- New `displayFields?: string` property on `QuickwitOptions` (TypeScript) and `ConfiguredFields` (Go)
- New text input in ConfigEditor between "Message field name" and "Log level field"
- Tooltip: "Comma-separated list of fields to display as columns before the log message in Explore view"
- When empty (default), behavior is unchanged

### Resulting Explore Display

```
timestamp | displayField1 | displayField2 | ... | message | ...rest
```

Example with `displayFields: "module,bhome"`:
```
timestamp | module | bhome | message
```

### Backend Changes

**`pkg/quickwit/client/client.go`** — Add `DisplayFields string` to `ConfiguredFields` struct.

**`pkg/quickwit/quickwit.go`** — Extract `displayFields` from `jsonData` and pass to `ConfiguredFields`.

**`pkg/quickwit/response_parser.go`** — In `processLogsResponse()`, add display fields to the JSON-preservation loop so nested/JSON fields are re-injected as serialized strings (same pattern as `LogMessageField` and `LogLevelField`).

### Frontend Changes

**`src/quickwit.ts`** — Add `displayFields?: string` to `QuickwitOptions`.

**`src/datasource/base.ts`** — Add `displayFields: string` property, initialized from `instanceSettings.jsonData.displayFields`.

**`src/configuration/ConfigEditor.tsx`** — Add text input for `displayFields`.

**`src/datasource/processResponse.ts`** — In `processLogsDataFrame()`:
1. Split `datasource.displayFields` by comma
2. For each field name, find the matching field in `dataFrame.fields`
3. Remove matched fields from their current position
4. Insert them between timestamp and `$qw_message` in configured order
5. Result: `[timestamp, displayField1, displayField2, ..., $qw_message, ...rest]`

### Files Changed

| File | Change |
|------|--------|
| `src/quickwit.ts` | Add `displayFields` to `QuickwitOptions` |
| `src/datasource/base.ts` | Add `displayFields` property |
| `src/configuration/ConfigEditor.tsx` | Add display fields input |
| `src/datasource/processResponse.ts` | Reorder fields in log frame |
| `pkg/quickwit/client/client.go` | Add `DisplayFields` to `ConfiguredFields` |
| `pkg/quickwit/quickwit.go` | Extract `displayFields` from config |
| `pkg/quickwit/response_parser.go` | Preserve display fields from JSON flattening |
| `pkg/quickwit/response_parser_qw_test.go` | Add test for display fields preservation |

### Non-Goals

- Per-query field overrides (possible future enhancement)
- Drag-and-drop field reordering in UI
- Fields displayed after the message column
