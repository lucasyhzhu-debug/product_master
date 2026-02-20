---
phase: quick-9
plan: 9
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/salesAnalytics/GoBizTokenDialog.tsx
autonomous: true
requirements: [QUICK-9]
must_haves:
  truths:
    - "User can paste the full GoBiz JSON blob (access_token, refresh_token, dbl_enabled) into a single textarea"
    - "access_token and refresh_token are parsed from the JSON and saved correctly"
    - "Graceful error shown if JSON is malformed or access_token is missing"
    - "Existing token status badge still displays correctly"
  artifacts:
    - path: "src/components/salesAnalytics/GoBizTokenDialog.tsx"
      provides: "Single JSON textarea replacing separate access/refresh token fields"
      min_lines: 150
  key_links:
    - from: "GoBizTokenDialog.tsx handleSaveAndSync"
      to: "api.platformCredentials.mutations.saveDirectToken"
      via: "bearerToken + refreshToken extracted from parsed JSON"
      pattern: "JSON.parse.*access_token"
---

<objective>
Replace the two separate Access Token / Refresh Token textarea fields in GoBizTokenDialog with a single JSON paste field. When the user pastes the GoBiz auth JSON blob and clicks save, the component parses `access_token` and `refresh_token` from it and passes them to the existing `saveDirectToken` mutation unchanged.

Purpose: GoBiz now returns a JSON object from DevTools rather than two separate cookie values, so a single paste field matches the new workflow.
Output: Updated GoBizTokenDialog.tsx with JSON-mode input.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/salesAnalytics/GoBizTokenDialog.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace dual-textarea with single JSON paste textarea in GoBizTokenDialog</name>
  <files>src/components/salesAnalytics/GoBizTokenDialog.tsx</files>
  <action>
    Rewrite GoBizTokenDialog.tsx to accept a single JSON paste field instead of two separate fields.

    State changes:
    - Remove `bearerToken` (string) and `refreshToken` (string) state
    - Add `jsonInput` (string) state initialized to ""
    - Keep `saving`, `error` state as-is

    UI changes:
    - Replace the two `<div className="space-y-2">` blocks (Access Token + Refresh Token textareas) with ONE textarea block:
      ```
      <div className="space-y-2">
        <Label htmlFor="gobiz-json">Auth JSON</Label>
        <Textarea
          id="gobiz-json"
          placeholder={'{\n  "access_token": "...",\n  "refresh_token": "...",\n  "dbl_enabled": true\n}'}
          value={jsonInput}
          onChange={(e) => { setJsonInput(e.target.value); setError(null); }}
          disabled={saving}
          rows={6}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Open https://portal.gofoodmerchant.co.id → DevTools (F12) → Network tab →
          find any API request → copy the Authorization JSON from the request payload or
          cookie storage. Paste the full JSON object here.
        </p>
      </div>
      ```

    handleSaveAndSync logic changes:
    - Replace the `bearerToken.trim()` validation with JSON parsing:
      ```typescript
      const handleSaveAndSync = async () => {
        const raw = jsonInput.trim();
        if (!raw) {
          setError("Paste the GoBiz auth JSON to continue");
          return;
        }

        let parsed: { access_token?: string; refresh_token?: string };
        try {
          parsed = JSON.parse(raw);
        } catch {
          setError("Invalid JSON — paste the full JSON object from GoBiz");
          return;
        }

        const accessToken = parsed.access_token?.trim();
        const refreshToken = parsed.refresh_token?.trim();

        if (!accessToken) {
          setError("JSON does not contain access_token");
          return;
        }

        setSaving(true);
        setError(null);

        try {
          await saveDirectToken({
            platformId: "gobiz",
            bearerToken: accessToken,
            ...(refreshToken ? { refreshToken } : {}),
          });
          // ... rest of sync logic unchanged (syncGoBiz call, toast, close) ...
          // On success: setJsonInput("") then onOpenChange(false)
        } catch (err) {
          // unchanged error handling
        } finally {
          setSaving(false);
        }
      };
      ```

    Button disabled condition changes:
    - Change `disabled={saving || !bearerToken.trim()}` to `disabled={saving || !jsonInput.trim()}`

    Reset on success:
    - Change `setBearerToken(""); setRefreshToken("");` to `setJsonInput("");`

    Keep all existing imports, status badges, and the rest of the dialog structure unchanged. The description text in DialogDescription can be updated to: "Paste the full auth JSON object from your GoBiz session. It should contain access_token, refresh_token, and dbl_enabled fields."
  </action>
  <verify>npm run type-check</verify>
  <done>
    - Single JSON textarea visible in dialog (no separate access/refresh fields)
    - Malformed JSON shows inline error "Invalid JSON..."
    - Missing access_token shows inline error "JSON does not contain access_token"
    - Valid JSON with access_token+refresh_token calls saveDirectToken with both values extracted
    - npm run type-check passes with no errors
  </done>
</task>

</tasks>

<verification>
Run `npm run type-check` — must pass clean.
Manually open the GoBiz token dialog in the UI and confirm:
1. Single textarea is present with JSON placeholder format
2. Pasting `{"access_token": "abc", "refresh_token": "xyz", "dbl_enabled": true}` and clicking Save calls the mutation correctly (check Convex dashboard logs)
3. Pasting invalid text shows "Invalid JSON" error
4. Pasting `{"dbl_enabled": true}` (no access_token) shows "JSON does not contain access_token" error
</verification>

<success_criteria>
- [ ] `npm run type-check` passes
- [ ] Single JSON textarea replaces the two separate token fields
- [ ] JSON parsing extracts access_token (required) and refresh_token (optional)
- [ ] Inline validation errors shown for bad JSON and missing access_token
- [ ] Backend call signature to saveDirectToken is unchanged
</success_criteria>

<output>
After completion, create `.planning/quick/9-update-gojek-api-input-to-accept-access-/9-SUMMARY.md`
</output>
