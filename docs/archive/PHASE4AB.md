# SecureExam — Phase 4 Tracks A & B

## Track A: Richer question types

### What's new

**Essay and short-text answers (student side)**

- Students see a textarea instead of radio buttons for `SHORT_TEXT` and `ESSAY` questions
- Answers auto-save with the same 500ms debounce as MCQ answers
- Character count shown below the textarea
- Essay answers are streamed via WebSocket just like MCQ answers

**Manual grading UI (teacher side)**

- New route: `/exams/:id/grade` → `GradingPage`
- Results page shows an "✏ Grade Essays" button with pending count badge
- Sidebar lists all sessions with ungraded answers + grading progress bar
- Per-question grading panel:
  - Shows question body (with LaTeX), rubric, and student's answer
  - Points input (0 → max, 0.5 step) + optional feedback field
  - Save grade button — updates session total score live
  - Auto-graded questions (MCQ) shown with correct/incorrect styling for reference
- "Finalize" button zeros any remaining ungraded answers and locks the session

**LaTeX / math rendering**

- KaTeX loaded via CDN in both student and teacher portals
- `RichText` component parses `$...$` (inline) and `$$...$$` (display) math
- Also supports `**bold**` in question bodies
- Teacher gets a live "Preview" toggle in the question editor
- Student sees rendered math in question body, option text, and rubric

**Image and audio in questions**

- `MediaUpload` component in teacher question editor
- API: `POST /api/v1/media/questions/:questionId` (multipart, 10MB max)
- Supports: JPG, PNG, GIF, WebP, SVG (images), MP3, WAV, OGG, WebM (audio)
- Student sees images with max-height: 256px; audio with native `<audio>` controls
- Storage: S3 in production, `/tmp/secureexam/` in dev (no S3 config needed)

**Grading rubric**

- Essay and short-text questions now have a `rubric` field
- Shown to teacher in green box during grading
- Supports LaTeX

### New API endpoints

| Method | Path                                            | Description                             |
| ------ | ----------------------------------------------- | --------------------------------------- |
| GET    | `/api/v1/grading/exams/:id/pending`             | Sessions with ungraded manual answers   |
| GET    | `/api/v1/grading/exams/:id/sessions/:sessionId` | Full grading view for one student       |
| POST   | `/api/v1/grading/answers/:answerId`             | Grade an answer `{ points, feedback? }` |
| POST   | `/api/v1/grading/sessions/:sessionId/finalize`  | Finalize grading (zeros ungraded)       |
| POST   | `/api/v1/media/questions/:questionId`           | Upload image/audio (multipart)          |
| DELETE | `/api/v1/media/questions/:questionId`           | Remove media attachment                 |

---

## Track B: AI Question Generator

### What's new

**AI generator page** (`/questions/ai`)

- Paste any curriculum text (20–8000 words)
- Choose: question count (1–20), type (MCQ / Multi-Select / True-False), difficulty (Easy / Medium / Hard), subject
- Three sample texts (Biology, History, Physics) for quick demo
- Claude generates questions with correct answers, explanations, and tags
- All questions editable inline before saving: body, options, correct answer, tags
- Select/deselect individual questions → save only the ones you want
- Saved questions go directly to your question bank, ready for exams

**Question Bank page** updates

- "✨ AI Generate" button in the top bar
- Empty state shows both "Create manually" and "Generate with AI" options
- All 5 question types now fully supported (including essay + short text)
- Media attachment shown with 🖼/🎵 icon in question list

### New API endpoints

| Method | Path                                 | Description                      |
| ------ | ------------------------------------ | -------------------------------- |
| POST   | `/api/v1/ai/generate-questions`      | Generate questions from text     |
| POST   | `/api/v1/ai/generate-questions/save` | Save generated questions to bank |

### Setup

Add to `apps/api/.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
```

Get your key at https://console.anthropic.com

Rate limit: 10 AI requests per minute per IP (configurable in `app.ts`).

The AI endpoint uses `claude-opus-4-6` by default. You can change this in
`apps/api/src/modules/ai/ai.router.ts` to `claude-sonnet-4-6` for faster/cheaper generation.

---

## New files (Phase 4 A+B)

### Backend

- `src/lib/storage.ts` — S3/local media upload utility
- `src/modules/media/media.router.ts` — multipart upload endpoint
- `src/modules/grading/grading.router.ts` — manual grading endpoints
- `src/modules/ai/ai.router.ts` — AI question generation

### Teacher portal

- `src/components/RichText.tsx` — LaTeX + Markdown renderer (shared)
- `src/components/MediaUpload.tsx` — drag-and-drop media uploader
- `src/pages/GradingPage.tsx` — full manual grading interface
- `src/pages/AIGeneratorPage.tsx` — AI question generator

### Student portal

- `src/components/RichText.tsx` — same LaTeX renderer

### Changed files

- `apps/api/src/app.ts` — registers grading, AI, media routers
- `apps/api/package.json` — adds Anthropic SDK, AWS S3, multer
- `apps/teacher/src/App.tsx` — adds grading and AI generator routes
- `apps/teacher/src/components/Layout.tsx` — adds AI Generator nav item
- `apps/teacher/src/pages/QuestionBankPage.tsx` — full rewrite with LaTeX, media, essay types
- `apps/teacher/src/pages/ResultsPage.tsx` — adds Grade Essays button + CSV export
- `apps/student/src/pages/ExamSessionPage.tsx` — LaTeX rendering, media, essay textarea
- `apps/teacher/index.html` — loads KaTeX
- `apps/student/index.html` — loads KaTeX

---

## Upgrading from Phase 3

No database migration needed — Phase 4 A+B adds no new tables.

```bash
# 1. Install new dependencies
npm install   # picks up @anthropic-ai/sdk, @aws-sdk/*, multer

# 2. Add ANTHROPIC_API_KEY to apps/api/.env
echo "ANTHROPIC_API_KEY=sk-ant-..." >> apps/api/.env

# 3. Restart
npm run dev
```

For media uploads in production, also configure S3:

```bash
S3_BUCKET=secureexam-media
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

In development (no S3 configured), uploaded files go to `/tmp/secureexam/`
and the URL returned is `/dev-media/...` — these won't persist across restarts,
but they work fine for testing.
