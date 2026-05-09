// packages/shared-types/src/index.ts
// Shared types used across API, student, and teacher apps

// ── ROLES ──────────────────────────────────────────────────

export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN' | 'SUPER_ADMIN';

// ── QUESTION TYPES ─────────────────────────────────────────

export type QuestionType = 'MCQ' | 'MCQ_MULTI' | 'TRUE_FALSE' | 'SHORT_TEXT' | 'ESSAY';

export interface QuestionOption {
  id: string;
  text: string;
  mediaUrl?: string;
}

export interface Question {
  id: string;
  createdBy: string;
  schoolId: string;
  type: QuestionType;
  body: string;
  mediaUrl?: string;
  options?: QuestionOption[];
  correctIds?: string[]; // never sent to students
  rubric?: string;
  points: number;
  difficulty: 1 | 2 | 3;
  tags: string[];
  createdAt: string;
}

// Student-facing question (no correct answers)
export interface QuestionForStudent {
  id: string;
  type: QuestionType;
  body: string;
  mediaUrl?: string;
  options?: QuestionOption[];
  points: number;
  order: number;
}

// ── EXAMS ──────────────────────────────────────────────────

export type ExamStatus = 'DRAFT' | 'PUBLISHED' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';

export interface Exam {
  id: string;
  title: string;
  description?: string;
  schoolId: string;
  teacherId: string;
  status: ExamStatus;
  durationMinutes: number;
  maxViolations: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResultsAfter: boolean;
  passingScore?: number;
  instructions?: string;
  startsAt?: string;
  endsAt?: string;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
  totalPoints?: number;
}

export interface ExamItem {
  id: string;
  examId: string;
  questionId: string;
  question: Question;
  order: number;
  points?: number;
}

// ── SESSIONS ───────────────────────────────────────────────

export type SessionStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'LOCKED'
  | 'SUBMITTED'
  | 'AUTO_SUBMITTED';

export interface ExamSession {
  id: string;
  examId: string;
  studentId: string;
  status: SessionStatus;
  startedAt?: string;
  submittedAt?: string;
  score?: number;
  totalPoints?: number;
  violationCount: number;
  createdAt: string;
}

export interface StudentAnswer {
  questionId: string;
  selectedIds?: string[];
  textAnswer?: string;
  answeredAt: string;
}

export interface SessionState {
  session: ExamSession;
  exam: Pick<Exam, 'id' | 'title' | 'durationMinutes' | 'maxViolations' | 'instructions'>;
  questions: QuestionForStudent[];
  answers: Record<string, StudentAnswer>;
  secondsRemaining: number;
}

// ── VIOLATIONS ─────────────────────────────────────────────

export type ViolationType =
  | 'TAB_SWITCH'
  | 'FULLSCREEN_EXIT'
  | 'RIGHT_CLICK'
  | 'KEYBOARD_SHORTCUT'
  | 'COPY_PASTE'
  | 'FOCUS_LOST'
  | 'MANUAL_FLAG';

export interface Violation {
  id: string;
  sessionId: string;
  type: ViolationType;
  description?: string;
  occurredAt: string;
}

// ── WEBSOCKET EVENTS ───────────────────────────────────────

export interface WSMessage<T = unknown> {
  type: string;
  payload: T;
  sessionId?: string;
  timestamp: string;
}

export type WSEventType =
  | 'session:heartbeat'
  | 'session:answer'
  | 'session:violation'
  | 'session:locked'
  | 'session:unlocked'
  | 'session:force_submit'
  | 'proctor:update'
  | 'proctor:violation';

// ── AUTH ───────────────────────────────────────────────────

export interface JWTPayload {
  sub: string;
  email: string;
  role: Role;
  schoolId: string | null;
  name: string;
  iat: number;
  exp: number;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    schoolId: string | null;
  };
}

// ── API RESPONSE WRAPPERS ──────────────────────────────────

export interface ApiSuccess<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ── REPORTS ────────────────────────────────────────────────

export interface ExamResultSummary {
  examId: string;
  totalStudents: number;
  submitted: number;
  averageScore: number;
  passRate: number;
  averageTimeTaken: number; // seconds
  questionBreakdown: {
    questionId: string;
    body: string;
    correctCount: number;
    totalAnswered: number;
    percentCorrect: number;
  }[];
}

export interface StudentResult {
  sessionId: string;
  student: { id: string; name: string; email: string };
  status: SessionStatus;
  score?: number;
  totalPoints?: number;
  percentage?: number;
  passed?: boolean;
  violationCount: number;
  startedAt?: string;
  submittedAt?: string;
  timeTaken?: number; // seconds
}
