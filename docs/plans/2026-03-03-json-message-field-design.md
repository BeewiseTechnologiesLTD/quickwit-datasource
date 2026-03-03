# Fix JSON Message/Level Field Display in Logs — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix log display in Grafana Explore when the configured message or level field is a JSON-type field in Quickwit.

**Architecture:** The backend's `flatten()` function destroys top-level JSON object keys by expanding them into dot-notated sub-keys. We preserve configured log fields by re-injecting the original JSON value (serialized as a string) after flattening, when the configured key is missing from the flattened result.

**Tech Stack:** Go, Grafana Plugin SDK, testify

---

### Task 1: Write failing test for JSON message field

**Files:**
- Modify: `pkg/quickwit/response_parser_qw_test.go` (append new test at end of file, before closing `}` on line 280)

**Step 1: Write the failing test**

Add this test to the `TestProcessLogsResponseWithDifferentTimeOutputFormat` function in `response_parser_qw_test.go`, after the last `t.Run` block (after line 279, before the closing `}` on line 280):

```go
	t.Run("Log query with JSON message field preserves serialized JSON", func(t *testing.T) {
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
								"payload": {"msg": "hello world", "code": 200},
								"level": "debug"
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
			LogMessageField:  "payload",
			LogLevelField:    "lvl",
		}
		result, _ := queryDataTestWithResponseCode(query, 200, response, configuredFields)
		frames := result.response.Responses["A"].Frames
		logsFrame := frames[0]
		logsFieldMap := make(map[string]*data.Field)
		for _, field := range logsFrame.Fields {
			logsFieldMap[field.Name] = field
		}

		// The "payload" field should exist as a string containing serialized JSON
		require.Contains(t, logsFieldMap, "payload")
		payloadField := logsFieldMap["payload"]
		require.Equal(t, data.FieldTypeNullableString, payloadField.Type())
		payloadValue := payloadField.At(0).(*string)
		require.NotNil(t, payloadValue)
		// The serialized JSON should contain both sub-fields
		require.Contains(t, *payloadValue, "hello world")
		require.Contains(t, *payloadValue, "200")
	})
```

**Step 2: Run the test to verify it fails**

Run: `go test -v -run "TestProcessLogsResponseWithDifferentTimeOutputFormat/Log_query_with_JSON_message_field" ./pkg/quickwit/`

Expected: FAIL — the `payload` field will not exist in `logsFieldMap` because `flatten()` expands it into `payload.msg` and `payload.code`.

---

### Task 2: Implement the fix in processLogsResponse

**Files:**
- Modify: `pkg/quickwit/response_parser.go:119` (after the `flatten()` call)

**Step 1: Add JSON field preservation logic**

In `response_parser.go`, replace line 119:

```go
			flattened = flatten(hit["_source"].(map[string]interface{}))
```

with:

```go
			source := hit["_source"].(map[string]interface{})
			flattened = flatten(source)

			// If configured log fields were JSON objects, flatten() expanded them
			// into dot-notated sub-keys, destroying the original key.
			// Re-inject the original value as a serialized JSON string.
			for _, fieldName := range []string{configuredFields.LogMessageField, configuredFields.LogLevelField} {
				if fieldName == "" {
					continue
				}
				if _, exists := flattened[fieldName]; !exists {
					if originalValue, ok := source[fieldName]; ok {
						if jsonBytes, err := json.Marshal(originalValue); err == nil {
							flattened[fieldName] = string(jsonBytes)
						}
					}
				}
			}
```

**Step 2: Run the test to verify it passes**

Run: `go test -v -run "TestProcessLogsResponseWithDifferentTimeOutputFormat/Log_query_with_JSON_message_field" ./pkg/quickwit/`

Expected: PASS

**Step 3: Run all response parser tests to verify no regressions**

Run: `go test -v ./pkg/quickwit/...`

Expected: All tests PASS

**Step 4: Commit**

```bash
git add pkg/quickwit/response_parser.go pkg/quickwit/response_parser_qw_test.go
git commit -m "fix: preserve JSON fields configured as log message/level in Explore view

When logMessageField or logLevelField points to a JSON-type field,
flatten() expands it into dot-notated sub-keys, destroying the original
key. The frontend then can't find the field and shows empty messages.

After flattening, re-inject the original JSON value (serialized as a
string) when the configured field key is missing from the flattened result."
```
