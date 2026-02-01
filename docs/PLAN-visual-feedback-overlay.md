# Visual Feedback Overlay Implementation Plan

## Overview

Add a "Visual Feedback Overlay" feature with screenshot capabilities to Frollie Recipe Master. Users can capture screenshots of UI elements, annotate them with feedback, add comments, and export ongoing feedback as a PRD document.

**Key Innovation:** First usage of Convex Storage (`v.id("_storage")`) in this codebase.

## Design Decisions

### Core Settings
- **Button Position:** Bottom-right floating button (common feedback widget pattern)
- **Availability:** All pages (global feature)
- **Access Control:** Anonymous with optional name input (no login required)

### Capture & Organization
- **Capture Scope:** Element-only capture (click on specific UI elements)
- **Organization:**
  - Status filter tabs: "All" | "Ongoing" | "Archived"
  - Priority levels: Low / Medium / High (button toggles, no dropdowns)
  - Tags: Bug / Enhancement / Question (button toggles, multi-select)
  - Page URL auto-filled from captured element location

### Detail View & State
- **Detail View:** Expand inline (card expands in place with comments)
- **Panel State:** Reset on navigation (closes when navigating, starts closed)
- **Completed Items:** Move to "Archived" tab, user can close/complete tickets

### Export
- **Export Method:** Copy to clipboard (markdown format)
- **Export Options:**
  - Option to export only new feedback from current session
  - Include element selector ID (no screenshots in export)
  - Full export of all ongoing items

### Notifications
- **No notifications** (single-user focused, no real-time alerts)

---

## Parallel Agent Execution Strategy

This implementation leverages specialized agents working in parallel, with dedicated audit and testing phases after each wave.

### Agent Types Used

| Agent Type | Role | Used For |
|------------|------|----------|
| **Convex Agent** | Backend database + API | Schema, mutations, queries, file storage |
| **general-purpose** | Utilities, hooks, integration | Export utils, React hooks, layout integration |
| **UI Designer** | Frontend components | All React components with shadcn/ui + Tailwind |
| **Audit** | Code review | Review each wave's output for quality/patterns |
| **Test Runner** | Unit testing | Run tests after each wave |

---

### Execution Waves

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ WAVE 1: Foundation (Sequential)                                             │
│ ─────────────────────────────────────────────────────────────────────────── │
│ CONVEX AGENT: Schema tables + npm install html2canvas + npx convex dev      │
│                                                                             │
│ ┌─────────────────┐  ┌─────────────────┐                                    │
│ │ AUDIT AGENT     │  │ TEST AGENT      │                                    │
│ │ Review schema   │  │ Verify types    │                                    │
│ └─────────────────┘  └─────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ WAVE 2: Backend + Core Utils (PARALLEL)                                     │
│ ─────────────────────────────────────────────────────────────────────────── │
│                                                                             │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐       │
│  │ CONVEX AGENT      │  │ GENERAL AGENT     │  │ GENERAL AGENT     │       │
│  │ (Backend Logic)   │  │ (Hooks + Context) │  │ (Export Utils)    │       │
│  │                   │  │                   │  │                   │       │
│  │ • mutations.ts    │  │ • useFeedback.ts  │  │ • feedbackExport  │       │
│  │ • queries.ts      │  │ • FeedbackContext │  │   .ts             │       │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘       │
│                                                                             │
│  POST-WAVE 2:                                                               │
│  ┌───────────────────┐  ┌───────────────────┐                               │
│  │ AUDIT AGENT       │  │ TEST AGENT        │                               │
│  │ Review backend +  │  │ Run unit tests    │                               │
│  │ hooks + utils     │  │ for Wave 2 code   │                               │
│  └───────────────────┘  └───────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ WAVE 3: UI Components (PARALLEL - UI DESIGNER AGENTS)                       │
│ ─────────────────────────────────────────────────────────────────────────── │
│                                                                             │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐       │
│  │ UI DESIGNER       │  │ UI DESIGNER       │  │ GENERAL AGENT     │       │
│  │ (Panel Components)│  │ (Capture Mode)    │  │ (Layout Integ)    │       │
│  │                   │  │                   │  │                   │       │
│  │ • FeedbackPanel   │  │ • FeedbackCapture │  │ • Layout.tsx mod  │       │
│  │ • FeedbackCard    │  │   Mode.tsx        │  │ • main.tsx mod    │       │
│  │ • CommentList     │  │ • Element hover   │  │ • Provider wrap   │       │
│  │ • FeedbackForm    │  │ • html2canvas     │  │                   │       │
│  │ • PanelToggle     │  │                   │  │                   │       │
│  │ • ExportPrdButton │  │                   │  │                   │       │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘       │
│                                                                             │
│  POST-WAVE 3:                                                               │
│  ┌───────────────────┐  ┌───────────────────┐                               │
│  │ AUDIT AGENT       │  │ TEST AGENT        │                               │
│  │ Review UI comps   │  │ Run component     │                               │
│  │ for patterns      │  │ unit tests        │                               │
│  └───────────────────┘  └───────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ WAVE 4: Final Integration & E2E (Sequential)                                │
│ ─────────────────────────────────────────────────────────────────────────── │
│ Main Agent: npm run type-check && npm run build                             │
│                                                                             │
│  ┌───────────────────┐  ┌───────────────────┐                               │
│  │ AUDIT AGENT       │  │ TEST AGENT        │                               │
│  │ Final code review │  │ E2E verification  │                               │
│  │ Full codebase     │  │ Manual checklist  │                               │
│  └───────────────────┘  └───────────────────┘                               │
│                                                                             │
│ Main Agent: Update CHANGELOG.md, git commit                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Agent Assignments

### WAVE 1: Foundation (CONVEX AGENT - Sequential)

**Convex Agent Prompt:**
```
Add schema tables for visual feedback feature to convex/schema.ts.

Add two new tables following existing patterns (see orders, recipes tables):

1. feedback table:
   - screenshotStorageId: v.id("_storage") - Convex file storage reference (NEW pattern for this codebase)
   - elementSelector: v.optional(v.string()) - CSS selector of captured element
   - pageUrl: v.string() - URL where feedback was captured
   - pageTitle: v.string() - Document title for context
   - description: v.string() - User's feedback description
   - status: v.string() - "ongoing" | "archived"
   - priority: v.string() - "low" | "medium" | "high"
   - tags: v.array(v.string()) - ["bug", "enhancement", "question"]
   - createdBy: v.optional(v.string()) - Optional user name
   - createdAt: v.number() - Timestamp via Date.now()
   - sessionId: v.string() - Browser session ID for "export new only" feature

   Indexes:
   - .index("by_status", ["status"])
   - .index("by_priority", ["priority"])
   - .index("by_session", ["sessionId"])
   - .index("by_created_at", ["createdAt"])

2. feedbackComments table:
   - feedbackId: v.id("feedback")
   - content: v.string()
   - createdBy: v.string()
   - createdAt: v.number()

   Indexes:
   - .index("by_feedback", ["feedbackId"])

After schema update, run: npm install html2canvas
Then run: npx convex dev to regenerate types
```

**Files Modified:**
- `convex/schema.ts`
- `package.json`
- `package-lock.json`

**Post-Wave 1 Audit Agent:**
```
Review the schema changes in convex/schema.ts:
- Verify feedback and feedbackComments tables follow existing patterns
- Check index definitions are correct (by_status, by_feedback)
- Ensure v.id("_storage") is used correctly for file storage
- Validate field types match requirements
```

**Post-Wave 1 Test Agent:**
```
Run: npx convex dev
Verify: Types regenerate without errors
Run: npm run type-check
Verify: No TypeScript errors from schema changes
```

---

### WAVE 2: Backend + Core Utils (3 Parallel Agents)

#### Agent 2A: Convex Backend (CONVEX AGENT)

**Prompt:**
```
Create Convex backend for feedback feature with file storage.

Schema already exists with tables:
- feedback (screenshotStorageId, elementSelector, pageUrl, pageTitle, description, status, createdBy, createdAt)
- feedbackComments (feedbackId, content, createdBy, createdAt)

Create convex/feedback/mutations.ts:
- generateUploadUrl(): Returns ctx.storage.generateUploadUrl()
- create(): Insert feedback with storageId, validate description not empty
- addComment(): Add comment to feedback, validate feedbackId exists
- toggleStatus(): Switch ongoing <-> completed
- remove(): Delete feedback + comments + storage file (cascade delete)

Create convex/feedback/queries.ts:
- list(status?): All feedback with screenshotUrl via ctx.storage.getUrl(), include commentCount
- get(id): Single feedback with comments array joined
- getExportData(): Only ongoing feedback for PRD export

Follow patterns from convex/orders/mutations.ts and convex/orders/queries.ts.
Use proper error handling with throw new Error().
```

**Files Created:**
- `convex/feedback/mutations.ts`
- `convex/feedback/queries.ts`

---

#### Agent 2B: Frontend Hooks + Context (general-purpose)

**Prompt:**
```
Create React hooks and context for feedback feature.

Create src/hooks/convex/useFeedback.ts following src/hooks/convex/useOrders.ts pattern:

Query hooks (return { data, isLoading }):
- useConvexFeedbackList(status?: string)
- useConvexFeedback(id: Id<"feedback"> | undefined)
- useConvexFeedbackExport()

Mutation hooks (return { mutateAsync }):
- useConvexGenerateUploadUrl()
- useConvexCreateFeedback()
- useConvexAddFeedbackComment()
- useConvexToggleFeedbackStatus()
- useConvexDeleteFeedback()

Use toast from sonner for success/error notifications.
Handle undefined check for loading states.

Create src/contexts/FeedbackContext.tsx:
- isPanelOpen: boolean, openPanel(), closePanel(), togglePanel()
- isCaptureMode: boolean, startCapture(), cancelCapture()
- capturedBlob: Blob | null, setCapturedBlob()
- capturedElement: string | null (CSS selector)
- sessionId: string (from sessionStorage, generated on first load)
- resetCapture() to clear blob and element
- useEffect to close panel on route change (react-router useLocation)

Update src/hooks/convex/index.ts to export all new hooks.
```

**Files Created:**
- `src/hooks/convex/useFeedback.ts`
- `src/contexts/FeedbackContext.tsx`

**Files Modified:**
- `src/hooks/convex/index.ts`

---

#### Agent 2C: Export Utilities (general-purpose)

**Prompt:**
```
Create PRD markdown export utility for feedback feature.

Create src/lib/feedbackExport.ts:

Types:
- FeedbackExportItem (matches query return type)

Functions:
1. generatePrdMarkdown(feedbackItems: FeedbackExportItem[], sessionOnly?: string): string
   - Title: "# Product Requirements Document"
   - Generation timestamp
   - Summary count of items
   - If sessionOnly provided, filter by sessionId first
   - Group feedback by pageUrl
   - For each page section:
     - Page title as ### heading
     - Page URL
     - For each feedback item:
       - Description
       - Element selector ID
       - Priority level
       - Tags list
       - Comments with timestamps
       - (NO screenshot URLs - text only for clipboard)
   - Format as clean, readable markdown

2. copyToClipboard(content: string): Promise<void>
   - Use navigator.clipboard.writeText()
   - Return promise for success/error handling

3. formatTimestamp(timestamp: number): string
   - Format as "Jan 15, 2025 at 3:45 PM"

4. generateSessionId(): string
   - Create unique session ID for browser session
   - Store in sessionStorage
   - Used for "export new only" feature

Include proper TypeScript types for all functions.
```

**Files Created:**
- `src/lib/feedbackExport.ts`

---

#### Post-Wave 2: Audit Agent

**Prompt:**
```
Review Wave 2 code for quality and pattern consistency.

Files to review:
- convex/feedback/mutations.ts
- convex/feedback/queries.ts
- src/hooks/convex/useFeedback.ts
- src/contexts/FeedbackContext.tsx
- src/lib/feedbackExport.ts

Check against patterns in:
- convex/orders/mutations.ts
- convex/orders/queries.ts
- src/hooks/convex/useOrders.ts

Verify:
1. Mutations have proper input validation
2. Queries handle undefined/null correctly
3. Hooks return { data, isLoading } for queries
4. Hooks use toast notifications
5. Context provides complete state management
6. Export utility handles edge cases (empty list, missing fields)
7. TypeScript types are properly defined
8. No console.log or debugging code left in

Report any issues found.
```

---

#### Post-Wave 2: Test Agent

**Prompt:**
```
Run unit tests for Wave 2 code.

1. Run type check:
   npm run type-check

2. Verify Convex functions compile:
   npx convex dev

3. Test backend mutations manually via Convex Dashboard:
   - generateUploadUrl returns a URL
   - create inserts a record (use mock storageId for testing)
   - list returns array with screenshotUrl

4. Verify hooks compile by checking imports work

Report any errors or failures.
```

---

### WAVE 3: UI Components (3 Parallel Agents - 2 UI Designer + 1 General)

#### Agent 3A: Panel Components (UI Designer)

**Prompt:**
```
Create feedback panel UI components using shadcn/ui and Tailwind CSS.
Follow patterns from src/components/orders/ for structure.

Create src/components/feedback/FeedbackPanelToggle.tsx:
- Fixed position: bottom-4 right-4, z-40
- Circular button with MessageSquare icon (lucide-react)
- Badge overlay showing ongoing feedback count (if > 0)
- onClick calls togglePanel() from useFeedbackContext()
- Hover effect, shadow

Create src/components/feedback/FeedbackPanel.tsx:
- Fixed position: right-0, top-14 (below header), h-[calc(100vh-3.5rem)], w-96
- z-30 (below toggle button)
- Slide animation: translate-x-0 when open, translate-x-full when closed
- transition-transform duration-300
- Border-l, bg-background, shadow-lg
- Header: Title "Feedback", ExportPrdButton (copy to clipboard), Close button (X icon)
- Tabs component: "All" | "Ongoing" | "Archived"
- ScrollArea containing FeedbackCard list (expandable inline)
- Footer: "New Capture" button to startCapture()
- Uses useConvexFeedbackList() with status filter from tab
- Panel resets (closes) on route navigation

Create src/components/feedback/FeedbackCard.tsx:
- Card component wrapper (expandable inline on click)
- Screenshot thumbnail: aspect-video, object-cover, rounded
- Description: text-sm, line-clamp-2 (full text when expanded)
- Priority indicator: colored dot (green=low, yellow=medium, red=high)
- Tags display: small badges for bug/enhancement/question
- Comment count with MessageSquare icon
- Timestamp: text-xs text-muted-foreground
- Expanded view shows:
  - Full screenshot
  - Element selector ID
  - Page URL link
  - CommentList component
  - Actions: Archive/Restore button, Delete button (with confirmation)

Create src/components/feedback/CommentList.tsx:
- Props: feedbackId, comments array
- List of comments with:
  - Content text
  - Timestamp (formatTimestamp from feedbackExport)
  - Created by (if available)
- Add comment form at bottom:
  - Textarea input
  - Submit button
  - Uses useConvexAddFeedbackComment()

Create src/components/feedback/FeedbackForm.tsx:
- Props: capturedBlob, elementSelector, onSubmit, onCancel
- Preview of captured screenshot (URL.createObjectURL)
- Textarea for description (required)
- Page URL display (readonly, auto-filled from window.location)
- Element selector display (readonly, auto-filled)
- Priority buttons: Low | Medium | High (toggle group, default Medium)
- Tag buttons: Bug | Enhancement | Question (multi-select toggle)
- Optional name input field (placeholder: "Your name (optional)")
- Submit button: calls upload flow then createFeedback
- Cancel button: calls onCancel and resetCapture()
- Loading state during upload

Create src/components/feedback/ExportPrdButton.tsx:
- Button with Copy icon (copies to clipboard, not download)
- Uses useConvexFeedbackExport()
- Disabled if no ongoing feedback
- Dropdown menu with options:
  - "Copy All Ongoing" - all ongoing feedback
  - "Copy New This Session" - only feedback from current sessionId
- onClick: generatePrdMarkdown() then navigator.clipboard.writeText()
- Toast confirmation: "Copied to clipboard!"
- Markdown format includes:
  - Description
  - Element selector ID
  - Page URL
  - Priority and tags
  - Comments (no screenshot URLs)

Use shadcn/ui: Card, Button, Badge, ScrollArea, Tabs, TabsList, TabsTrigger, TabsContent, Textarea, Separator
Use lucide-react: MessageSquare, X, Download, Camera, Check, Trash2, Plus
```

**Files Created:**
- `src/components/feedback/FeedbackPanelToggle.tsx`
- `src/components/feedback/FeedbackPanel.tsx`
- `src/components/feedback/FeedbackCard.tsx`
- `src/components/feedback/CommentList.tsx`
- `src/components/feedback/FeedbackForm.tsx`
- `src/components/feedback/ExportPrdButton.tsx`

---

#### Agent 3B: Capture Mode (UI Designer)

**Prompt:**
```
Create screenshot capture overlay using html2canvas.
This is a full-screen overlay for capturing UI elements.

Create src/components/feedback/FeedbackCaptureMode.tsx:

Structure:
- Only render when isCaptureMode is true (from useFeedbackContext)
- Full-screen overlay: fixed inset-0, z-50, cursor-crosshair

Visual overlay:
- Semi-transparent background: bg-black/10
- Pointer-events-none on background, pointer-events-auto on elements

Element hover highlighting:
- Track mouse position with onMouseMove
- Use document.elementFromPoint(x, y) to find hovered element
- Store hovered element ref in state
- Apply visual highlight to hovered element:
  - Blue outline (outline: 2px solid #3b82f6)
  - Light blue background (bg-blue-500/10)
- Show tooltip near cursor with element info:
  - Tag name (e.g., "DIV", "BUTTON")
  - Class name preview (first 30 chars)
  - Position: fixed, follows mouse with offset

Click to capture:
- onClick handler on overlay
- Prevent default, stop propagation
- Use html2canvas(hoveredElement) to capture
- Options: { useCORS: true, logging: false, scale: 2 }
- Convert canvas to blob: canvas.toBlob()
- Get CSS selector for element (simple: tagName + id/class)
- Call setCapturedBlob(blob) and set element selector
- Call cancelCapture() to exit capture mode
- Call openPanel() to show form

Cancel handling:
- Escape key listener (useEffect with keydown)
- Call cancelCapture() from context
- Also provide a cancel button in corner

Instructions overlay:
- Fixed top-center position
- Card with instructions:
  - "Click an element to capture"
  - "Press Escape to cancel"
- Semi-transparent background

Import html2canvas from 'html2canvas'.
Handle edge cases: iframe content, canvas elements, SVG.
```

**Files Created:**
- `src/components/feedback/FeedbackCaptureMode.tsx`

---

#### Agent 3C: Layout Integration (general-purpose)

**Prompt:**
```
Integrate feedback feature into app layout.

Modify src/main.tsx:
- Import FeedbackProvider from '@/contexts/FeedbackContext'
- Wrap the App component with <FeedbackProvider>
- Maintain existing ConvexProvider wrapping

Modify src/components/layout/Layout.tsx:
- Import feedback components:
  - FeedbackPanelToggle from '@/components/feedback/FeedbackPanelToggle'
  - FeedbackPanel from '@/components/feedback/FeedbackPanel'
  - FeedbackCaptureMode from '@/components/feedback/FeedbackCaptureMode'
- Add components after the main content area (after <Outlet />):
  <FeedbackPanelToggle />
  <FeedbackPanel />
  <FeedbackCaptureMode />

Ensure:
- Components are siblings to main content, not nested inside
- Z-index layering is correct (content < panel < toggle < capture mode)
- No interference with existing header or navigation

Create src/components/feedback/index.ts barrel export:
- Export all feedback components for clean imports

Follow existing Layout.tsx structure and patterns.
```

**Files Created:**
- `src/components/feedback/index.ts`

**Files Modified:**
- `src/main.tsx`
- `src/components/layout/Layout.tsx`

---

#### Post-Wave 3: Audit Agent

**Prompt:**
```
Review Wave 3 UI components for quality and consistency.

Files to review:
- src/components/feedback/FeedbackPanelToggle.tsx
- src/components/feedback/FeedbackPanel.tsx
- src/components/feedback/FeedbackCard.tsx
- src/components/feedback/FeedbackCaptureMode.tsx
- src/components/feedback/CommentList.tsx
- src/components/feedback/FeedbackForm.tsx
- src/components/feedback/ExportPrdButton.tsx
- src/components/feedback/index.ts
- src/main.tsx (modifications)
- src/components/layout/Layout.tsx (modifications)

Check against patterns in:
- src/components/orders/OrderWhatsAppPanel.tsx
- src/components/shared/ConfirmDialog.tsx
- src/components/layout/Layout.tsx (original)

Verify:
1. All components have proper TypeScript prop interfaces
2. Hooks are called at top level (not conditionally)
3. Loading states are handled (undefined checks)
4. Event handlers are properly typed
5. Tailwind classes follow project conventions
6. shadcn/ui components used correctly
7. Accessibility: proper button types, aria labels where needed
8. No hardcoded strings that should be configurable
9. Error boundaries or try/catch where appropriate
10. Memory leaks: cleanup in useEffect, URL.revokeObjectURL

Report any issues found.
```

---

#### Post-Wave 3: Test Agent

**Prompt:**
```
Run tests for Wave 3 UI components.

1. Run type check:
   npm run type-check

2. Run build to verify compilation:
   npm run build

3. Start dev server and visually verify:
   npm run dev

   Check:
   - Floating button appears bottom-right
   - Panel slides in/out on toggle
   - Capture mode overlay appears
   - Element highlighting works on hover
   - Screenshot captures successfully
   - Form submission works
   - Export button downloads file

4. Test edge cases:
   - Empty feedback list
   - Very long descriptions
   - Rapid clicking
   - Escape key cancellation

Report any errors or failures.
```

---

### WAVE 4: Final Integration & E2E (Sequential)

**Main Agent Actions:**
1. Run `npm run type-check` - Fix any TypeScript errors
2. Run `npm run build` - Verify production build
3. Run `npx convex dev` - Verify backend deploys

---

#### Post-Wave 4: Final Audit Agent

**Prompt:**
```
Final comprehensive code review of entire feedback feature.

Review all new files:
- convex/feedback/mutations.ts
- convex/feedback/queries.ts
- src/hooks/convex/useFeedback.ts
- src/contexts/FeedbackContext.tsx
- src/lib/feedbackExport.ts
- src/components/feedback/*.tsx

Review modified files:
- convex/schema.ts
- src/main.tsx
- src/components/layout/Layout.tsx
- src/hooks/convex/index.ts

Final checklist:
1. Code follows project patterns from CLAUDE.md
2. Git workflow guidelines followed
3. No security vulnerabilities (XSS in user content, etc.)
4. No performance issues (unnecessary re-renders, memory leaks)
5. Error handling is comprehensive
6. TypeScript types are correct and complete
7. No TODO comments or incomplete implementations
8. No console.log or debugging code
9. Documentation comments where logic is complex

Prepare summary for CHANGELOG.md entry.
```

---

#### Post-Wave 4: E2E Test Agent

**Prompt:**
```
Complete end-to-end verification of feedback feature.

Manual E2E Testing Checklist:

Setup:
- [ ] npm run dev starts without errors
- [ ] npx convex dev connects successfully

Floating Button:
- [ ] Button visible on Dashboard
- [ ] Button visible on RecipeEditor
- [ ] Button visible on OrderManager
- [ ] Badge shows count when feedback exists

Panel:
- [ ] Panel opens on button click
- [ ] Panel closes on X button
- [ ] Panel closes on button toggle
- [ ] Tabs filter feedback correctly
- [ ] ScrollArea scrolls with many items

Capture Mode:
- [ ] "New Capture" button activates capture mode
- [ ] Panel closes during capture
- [ ] Element highlighting works on hover
- [ ] Tooltip shows element info
- [ ] Click captures element screenshot
- [ ] Escape cancels capture mode
- [ ] Form appears after capture

Feedback Creation:
- [ ] Screenshot preview displays
- [ ] Description textarea works
- [ ] Submit creates feedback
- [ ] Toast shows success
- [ ] New feedback appears in list

Comments:
- [ ] Can view comments on feedback
- [ ] Can add new comment
- [ ] Comment appears immediately

Status Toggle:
- [ ] Can mark as completed
- [ ] Can mark as ongoing
- [ ] Badge color changes

Export:
- [ ] Export button downloads file
- [ ] Markdown is properly formatted
- [ ] Only ongoing items included

Delete:
- [ ] Delete button shows confirmation
- [ ] Confirm deletes feedback
- [ ] Feedback removed from list

Report all test results.
```

---

**Main Agent Final Actions:**
1. Update `docs/CHANGELOG.md` with feature entry
2. Git commit with proper message format

---

## File Structure Summary

### New Files (14 total)
```
convex/feedback/
├── queries.ts                    # Agent 2A (Convex Agent)
└── mutations.ts                  # Agent 2A (Convex Agent)

src/
├── components/feedback/
│   ├── index.ts                  # Agent 3C
│   ├── FeedbackPanel.tsx         # Agent 3A (UI Designer)
│   ├── FeedbackPanelToggle.tsx   # Agent 3A (UI Designer)
│   ├── FeedbackCard.tsx          # Agent 3A (UI Designer)
│   ├── FeedbackCaptureMode.tsx   # Agent 3B (UI Designer)
│   ├── FeedbackForm.tsx          # Agent 3A (UI Designer)
│   ├── CommentList.tsx           # Agent 3A (UI Designer)
│   └── ExportPrdButton.tsx       # Agent 3A (UI Designer)
├── hooks/convex/
│   └── useFeedback.ts            # Agent 2B
├── contexts/
│   └── FeedbackContext.tsx       # Agent 2B
└── lib/
    └── feedbackExport.ts         # Agent 2C
```

### Modified Files (5 total)
```
convex/schema.ts                  # Wave 1 (Convex Agent)
package.json                      # Wave 1 (Main)
src/hooks/convex/index.ts         # Agent 2B
src/main.tsx                      # Agent 3C
src/components/layout/Layout.tsx  # Agent 3C
```

---

## Agent Execution Summary

| Wave | Parallel Agents | Audit | Tests |
|------|-----------------|-------|-------|
| **Wave 1** | 1 (Convex) | Schema review | Type check |
| **Wave 2** | 3 (Convex + General x2) | Backend + hooks review | Convex + type check |
| **Wave 3** | 3 (UI Designer x2 + General) | UI components review | Build + visual |
| **Wave 4** | 1 (Main) | Full codebase review | E2E checklist |

**Agent Type Distribution:**
- **Convex Agents:** 2 (Schema in Wave 1, Backend in Wave 2)
- **General-purpose Agents:** 3 (Hooks, Export Utils, Layout Integration)
- **UI Designer Agents:** 2 (Panel Components, Capture Mode)
- **Audit Agents:** 4 (one per wave)
- **Test Agents:** 4 (one per wave)

**Total Agents Used:** 8 work agents + 4 audit + 4 test = 16 agent tasks

---

## Git Workflow

```bash
git switch main && git pull
git switch -c feature/visual-feedback-overlay

# Commits after each wave passes audit + tests:
# Wave 1: feat: add feedback schema and html2canvas dependency
# Wave 2: feat: implement feedback backend, hooks, and export utils
# Wave 3: feat: implement feedback UI components with capture mode
# Wave 4: docs: update CHANGELOG for visual feedback overlay

npm run build && npm run type-check
git push origin feature/visual-feedback-overlay
```

---

## Dependencies

```json
{
  "html2canvas": "^1.4.1"
}
```
