-- CreateIndex
CREATE INDEX "classes_schoolId_idx" ON "classes"("schoolId");

-- CreateIndex
CREATE INDEX "exam_sessions_studentId_idx" ON "exam_sessions"("studentId");

-- CreateIndex
CREATE INDEX "exam_sessions_examId_status_idx" ON "exam_sessions"("examId", "status");

-- CreateIndex
CREATE INDEX "exams_schoolId_idx" ON "exams"("schoolId");

-- CreateIndex
CREATE INDEX "exams_schoolId_status_idx" ON "exams"("schoolId", "status");

-- CreateIndex
CREATE INDEX "exams_teacherId_idx" ON "exams"("teacherId");

-- CreateIndex
CREATE INDEX "questions_schoolId_idx" ON "questions"("schoolId");

-- CreateIndex
CREATE INDEX "questions_schoolId_type_idx" ON "questions"("schoolId", "type");

-- CreateIndex
CREATE INDEX "questions_createdBy_idx" ON "questions"("createdBy");

-- CreateIndex
CREATE INDEX "users_schoolId_idx" ON "users"("schoolId");

-- CreateIndex
CREATE INDEX "users_role_schoolId_idx" ON "users"("role", "schoolId");

-- CreateIndex
CREATE INDEX "violations_sessionId_idx" ON "violations"("sessionId");

-- CreateIndex
CREATE INDEX "violations_occurredAt_idx" ON "violations"("occurredAt");

-- ── CHECK constraints (Prisma can't express these natively) ──────────
-- Score / percentage ranges
ALTER TABLE "exams"
  ADD CONSTRAINT "exams_passingScore_range" CHECK ("passingScore" IS NULL OR ("passingScore" >= 0 AND "passingScore" <= 100));

ALTER TABLE "exams"
  ADD CONSTRAINT "exams_durationMinutes_positive" CHECK ("durationMinutes" > 0);

ALTER TABLE "exams"
  ADD CONSTRAINT "exams_maxViolations_nonneg" CHECK ("maxViolations" >= 0);

ALTER TABLE "exams"
  ADD CONSTRAINT "exams_securityLevel_range" CHECK ("securityLevel" >= 1 AND "securityLevel" <= 3);

-- StudentAccessArrangement (extra time, rest break minutes)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_access_arrangements') THEN
    EXECUTE 'ALTER TABLE "student_access_arrangements"
      ADD CONSTRAINT "student_access_extraTime_range" CHECK ("extraTimePercent" >= 0 AND "extraTimePercent" <= 200)';
    EXECUTE 'ALTER TABLE "student_access_arrangements"
      ADD CONSTRAINT "student_access_restBreakMinutes_nonneg" CHECK ("restBreakMinutes" IS NULL OR "restBreakMinutes" >= 0)';
  END IF;
END $$;

-- ExamSession score range
ALTER TABLE "exam_sessions"
  ADD CONSTRAINT "exam_sessions_score_nonneg" CHECK ("score" IS NULL OR "score" >= 0);

ALTER TABLE "exam_sessions"
  ADD CONSTRAINT "exam_sessions_violationCount_nonneg" CHECK ("violationCount" >= 0);

-- Question difficulty/points
ALTER TABLE "questions"
  ADD CONSTRAINT "questions_points_positive" CHECK ("points" > 0);

ALTER TABLE "questions"
  ADD CONSTRAINT "questions_difficulty_range" CHECK ("difficulty" >= 1 AND "difficulty" <= 5);
