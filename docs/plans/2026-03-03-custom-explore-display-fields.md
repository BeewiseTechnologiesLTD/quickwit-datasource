# Custom Display Fields in Explore View — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to configure extra fields (e.g., `module`, `bhome`) that appear as columns between timestamp and message in the Explore log view.

**Architecture:** New `displayFields` config option (comma-separated string) flows from ConfigEditor UI → TypeScript types → Go backend. Backend preserves display fields from JSON flattening. Frontend reorders DataFrame fields to place them before the message.

**Tech Stack:** TypeScript/React (Grafana plugin frontend), Go (backend response parser)

---

### Task 1: Add `DisplayFields` to Go ConfiguredFields struct

**Files:**
- Modify: `pkg/quickwit/client/client.go:35-40`

**Step 1: Add the field**

In `ConfiguredFields` struct, add `DisplayFields` after `LogLevelField`:

```go
type ConfiguredFields struct {
	TimeField        string
	TimeOutputFormat string
	LogMessageField  string
	LogLevelField    string
	DisplayFields    string
}
```

**Step 2: Run Go build to verify compilation**

Run: `cd /Users/oleksandr/oss/quickwit-datasource && go build ./pkg/...`
Expected: SUCCESS (no errors)

**Step 3: Commit**

```bash
git add pkg/quickwit/client/client.go
git commit -m "feat: add DisplayFields to ConfiguredFields struct"
```

---

### Task 2: Wire `displayFields` from JSON config to ConfiguredFields

**Files:**
- Modify: `pkg/quickwit/quickwit.go:60-98`

**Step 1: Extract displayFields from jsonData**

After the `logMessageField` extraction block (line 68), add:

```go
	displayFields, ok := jsonData["displayFields"].(string)
	if !ok {
		displayFields = ""
	}
```

**Step 2: Pass to ConfiguredFields**

Update the `configuredFields` initialization (line 93-98) to include `DisplayFields`:

```go
	configuredFields := es.ConfiguredFields{
		LogLevelField:    logLevelField,
		LogMessageField:  logMessageField,
		DisplayFields:    displayFields,
		TimeField:        "",
		TimeOutputFormat: "",
	}
```

**Step 3: Run Go build to verify compilation**

Run: `cd /Users/oleksandr/oss/quickwit-datasource && go build ./pkg/...`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add pkg/quickwit/quickwit.go
git commit -m "feat: wire displayFields from JSON config to ConfiguredFields"
```

---

### Task 3: Preserve display fields from JSON flattening in backend

**Files:**
- Modify: `pkg/quickwit/response_parser.go:111-137`

**Step 1: Write the failing test**

Add to `pkg/quickwit/response_parser_qw_test.go`:

```go
func TestProcessLogsResponseWithDisplayFields(t *testing.T) {
	t.Run("Log query with JSON display field preserves serialized JSON", func(t *testing.T) {
		query := []byte(`
				[
					{
					  "refId": "A",
					  "metrics": [{ "type": "logs"}],
					  "bucketAggs": [
						{
						  "type": "date_histogram",
						  "settings": { "interval": "auto" },
						  "id": "2"
						}
					  ],
					  "key": "Q-1561369883389-0.7611823271062786-0",
					  "query": "hello AND message",
						"sort":[{"testtime":"desc"}]
					}
				]
			`)

		response := []byte(`
				{
					"responses": [
					  {
						"aggregations": {},
						"hits": {
						  "hits": [
							{
							  "_id": "fdsfs",
							  "_type": "_doc",
							  "_index": "mock-index",
							  "_source": {
								"testtime": 1684398201000000000,
								"host": "djisaodjsoad",
								"module": "FileUploaderService",
								"metadata": {"region": "us-east", "version": 3},
								"level": "debug",
								"line": "hello, i am a message"
							  },
								"sort":[1684398201000000000]
							}
						  ]
						}
					  }
					]
				}
			`)

		configuredFields := es.ConfiguredFields{
			TimeOutputFormat: TimestampNanos,
			TimeField:        "testtime",
			LogMessageField:  "line",
			LogLevelField:    "level",
			DisplayFields:    "module,metadata",
		}
		result, _ := queryDataTestWithResponseCode(query, 200, response, configuredFields)
		frames := result.response.Responses["A"].Frames
		logsFrame := frames[0]
		logsFieldMap := make(map[string]*data.Field)
		for _, field := range logsFrame.Fields {
			logsFieldMap[field.Name] = field
		}

		// "module" is a simple string field — should exist as-is
		require.Contains(t, logsFieldMap, "module")
		moduleValue := logsFieldMap["module"].At(0).(*string)
		require.Equal(t, "FileUploaderService", *moduleValue)

		// "metadata" is a JSON object — should be preserved as serialized JSON string
		require.Contains(t, logsFieldMap, "metadata")
		metadataField := logsFieldMap["metadata"]
		require.Equal(t, data.FieldTypeNullableString, metadataField.Type())
		metadataValue := metadataField.At(0).(*string)
		require.NotNil(t, metadataValue)
		require.Contains(t, *metadataValue, "us-east")
		require.Contains(t, *metadataValue, "3")
	})
}
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/oleksandr/oss/quickwit-datasource && go test ./pkg/quickwit/ -run TestProcessLogsResponseWithDisplayFields -v`
Expected: FAIL — `metadata` field won't exist (it gets flattened to `metadata.region` and `metadata.version`)

**Step 3: Implement the fix**

In `processLogsResponse()` in `response_parser.go`, update the field preservation loop (lines 125-136) to also include display fields. Replace:

```go
			for _, fieldName := range []string{configuredFields.LogMessageField, configuredFields.LogLevelField} {
```

With:

```go
			fieldsToPreserve := []string{configuredFields.LogMessageField, configuredFields.LogLevelField}
			for _, df := range strings.Split(configuredFields.DisplayFields, ",") {
				df = strings.TrimSpace(df)
				if df != "" {
					fieldsToPreserve = append(fieldsToPreserve, df)
				}
			}
			for _, fieldName := range fieldsToPreserve {
```

Note: `strings` is already imported in this file.

**Step 4: Run test to verify it passes**

Run: `cd /Users/oleksandr/oss/quickwit-datasource && go test ./pkg/quickwit/ -run TestProcessLogsResponseWithDisplayFields -v`
Expected: PASS

**Step 5: Run all existing tests to check for regressions**

Run: `cd /Users/oleksandr/oss/quickwit-datasource && go test ./pkg/quickwit/ -v`
Expected: All PASS

**Step 6: Commit**

```bash
git add pkg/quickwit/response_parser.go pkg/quickwit/response_parser_qw_test.go
git commit -m "feat: preserve display fields from JSON flattening in backend"
```

---

### Task 4: Add `displayFields` to TypeScript types and datasource class

**Files:**
- Modify: `src/quickwit.ts:5-15`
- Modify: `src/datasource/base.ts:57-82`

**Step 1: Add to QuickwitOptions interface**

In `src/quickwit.ts`, add `displayFields` after `logLevelField`:

```typescript
export interface QuickwitOptions extends DataSourceJsonData {
    timeField: string;
    interval?: string;
    logMessageField?: string;
    logLevelField?: string;
    displayFields?: string;
    dataLinks?: DataLinkConfig[];
    index: string;
    queryEditorConfig?: {
        defaults?: DefaultsConfigOverrides
    }
}
```

**Step 2: Add to BaseQuickwitDataSource**

In `src/datasource/base.ts`, add the property declaration (after `logLevelField` at line 60):

```typescript
  displayFields?: string;
```

And in the constructor (after `this.logLevelField` at line 77), add:

```typescript
    this.displayFields = settingsData.displayFields || '';
```

**Step 3: Verify TypeScript compilation**

Run: `cd /Users/oleksandr/oss/quickwit-datasource && npx tsc --noEmit`
Expected: SUCCESS (or only pre-existing errors)

**Step 4: Commit**

```bash
git add src/quickwit.ts src/datasource/base.ts
git commit -m "feat: add displayFields to TypeScript types and datasource class"
```

---

### Task 5: Add display fields input to ConfigEditor

**Files:**
- Modify: `src/configuration/ConfigEditor.tsx:86-94`

**Step 1: Add the input field**

In `QuickwitDetails`, add a new `InlineField` between "Message field name" (line 85) and "Log level field" (line 86). Insert after the closing `</InlineField>` of Message field name:

```tsx
          <InlineField label="Display fields" labelWidth={26} tooltip="Comma-separated list of fields to display as columns before the log message in Explore view">
            <Input
              id="quickwit_display_fields"
              value={value.jsonData.displayFields}
              onChange={(event) => onChange({ ...value, jsonData: {...value.jsonData, displayFields: event.currentTarget.value}})}
              placeholder="module,bhome"
              width={40}
            />
          </InlineField>
```

**Step 2: Verify TypeScript compilation**

Run: `cd /Users/oleksandr/oss/quickwit-datasource && npx tsc --noEmit`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add src/configuration/ConfigEditor.tsx
git commit -m "feat: add display fields input to ConfigEditor"
```

---

### Task 6: Reorder DataFrame fields in frontend processResponse

**Files:**
- Modify: `src/datasource/processResponse.ts:20-60`

**Step 1: Implement field reordering**

In `processLogsDataFrame()`, after the existing message field logic (after line 59 where `dataFrame.fields = [timestamp, newField, ...rest]`) and before the dataLinks block, add display field reordering:

```typescript
  if (datasource.displayFields) {
    const displayFieldNames = datasource.displayFields.split(',').map(f => f.trim()).filter(f => f);
    if (displayFieldNames.length > 0) {
      const displayFieldEntries: Field[] = [];
      const remainingFields: Field[] = [];

      // First field is always timestamp, second might be $qw_message
      const [first, ...afterFirst] = dataFrame.fields;

      for (const field of afterFirst) {
        if (!displayFieldNames.includes(field.name)) {
          remainingFields.push(field);
        }
      }

      for (const name of displayFieldNames) {
        const found = afterFirst.find(f => f.name === name);
        if (found) {
          displayFieldEntries.push(found);
        }
      }

      dataFrame.fields = [first, ...displayFieldEntries, ...remainingFields];
    }
  }
```

The result when both `logMessageField` and `displayFields` are set:
`[timestamp, module, bhome, $qw_message, ...rest]`

**Step 2: Verify TypeScript compilation**

Run: `cd /Users/oleksandr/oss/quickwit-datasource && npx tsc --noEmit`
Expected: SUCCESS

**Step 3: Build the full plugin**

Run: `cd /Users/oleksandr/oss/quickwit-datasource && npm run build`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add src/datasource/processResponse.ts
git commit -m "feat: reorder display fields before message in Explore log view"
```

---

### Task 7: Manual verification

**Step 1: Build and start**

Run: `cd /Users/oleksandr/oss/quickwit-datasource && ./build_and_start.sh` (or equivalent dev server)

**Step 2: Verify in Grafana**

1. Open Grafana datasource settings for the Quickwit datasource
2. Verify new "Display fields" text input appears between "Message field name" and "Log level field"
3. Enter `module,bhome` in the display fields input
4. Go to Explore view, run a log query
5. Verify columns appear as: `timestamp | module | bhome | message | ...rest`
6. Clear display fields, verify behavior reverts to default: `timestamp | message | ...rest`
