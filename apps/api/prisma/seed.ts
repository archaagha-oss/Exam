// apps/api/prisma/seed.ts
// Run: npm run db:seed --workspace=apps/api
//
// Cycle 2.1d update: in addition to the original 1 school + 1 teacher + 5
// students + 1 exam, the seed now also lays down enough data for the
// docs/05-manual-testing.md walkthrough to be exercise-ready out of the
// box:
//   - a second school ("Other School") so cross-tenant chaos cases have a
//     real B-side
//   - a SCHOOL_ADMIN account on the demo school
//   - the per-school AI feature flag enabled (so AI authoring routes don't
//     all 403 when a teacher tries them)
//   - one sample PLATFORM_ADMIN impersonation row in audit_logs so the
//     compliance ledger query has something to return
//
// Defaults stay off where the product brief says they should — only
// `ai-authoring` is opted-in for the demo school as a convenience for
// reviewers; live-proctoring and seb-tier-3 stay off.

import { PrismaClient, Role, QuestionType, ExamStatus, AuditAction } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── School ──
  const school = await prisma.school.upsert({
    where: { domain: 'demo.school.edu' },
    update: {},
    create: {
      name: 'Demo School',
      domain: 'demo.school.edu',
    },
  });
  console.log('✅ School:', school.name);

  // ── Super Admin (no school — platform-wide) ──
  const superAdminPassword = await bcrypt.hash('superadmin123', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@demo.school.edu' },
    update: {},
    create: {
      email: 'superadmin@demo.school.edu',
      passwordHash: superAdminPassword,
      name: 'Platform Owner',
      role: Role.PLATFORM_ADMIN,
      schoolId: null,
    },
  });
  console.log('✅ Super Admin:', superAdmin.email);

  // ── Admin ──
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.school.edu' },
    update: {},
    create: {
      email: 'admin@demo.school.edu',
      passwordHash: adminPassword,
      name: 'School Admin',
      role: Role.SCHOOL_ADMIN,
      schoolId: school.id,
    },
  });
  console.log('✅ Admin:', admin.email);

  // ── Teacher ──
  const teacherPassword = await bcrypt.hash('teacher123', 12);
  const teacher = await prisma.user.upsert({
    where: { email: 'teacher@demo.school.edu' },
    update: {},
    create: {
      email: 'teacher@demo.school.edu',
      passwordHash: teacherPassword,
      name: 'Jane Smith',
      role: Role.TEACHER,
      schoolId: school.id,
    },
  });
  console.log('✅ Teacher:', teacher.email);

  // ── Students ──
  const studentPassword = await bcrypt.hash('student123', 12);
  const students = await Promise.all(
    ['Alice Johnson', 'Bob Williams', 'Carol Brown', 'David Lee', 'Emma Davis'].map(
      (name, i) =>
        prisma.user.upsert({
          where: { email: `student${i + 1}@demo.school.edu` },
          update: {},
          create: {
            email: `student${i + 1}@demo.school.edu`,
            passwordHash: studentPassword,
            name,
            role: Role.STUDENT,
            schoolId: school.id,
          },
        })
    )
  );
  console.log(`✅ Students: ${students.length} created`);

  // ── Class ──
  const cls = await prisma.class.upsert({
    where: { id: 'class-demo-1' },
    update: {},
    create: {
      id: 'class-demo-1',
      name: 'Grade 10 — Mathematics',
      schoolId: school.id,
    },
  });

  // Assign teacher and students to class
  await prisma.classTeacher.upsert({
    where: { classId_teacherId: { classId: cls.id, teacherId: teacher.id } },
    update: {},
    create: { classId: cls.id, teacherId: teacher.id },
  });

  for (const student of students) {
    await prisma.classStudent.upsert({
      where: { classId_studentId: { classId: cls.id, studentId: student.id } },
      update: {},
      create: { classId: cls.id, studentId: student.id },
    });
  }
  console.log('✅ Class:', cls.name);

  // ── Questions ──
  const questions = await Promise.all([
    prisma.question.create({
      data: {
        createdBy: teacher.id,
        schoolId: school.id,
        type: QuestionType.MCQ,
        body: 'If 3x + 7 = 22, what is the value of x?',
        options: [
          { id: 'a', text: 'x = 3' },
          { id: 'b', text: 'x = 5' },
          { id: 'c', text: 'x = 7' },
          { id: 'd', text: 'x = 9' },
        ],
        correctIds: ['b'],
        points: 2,
        difficulty: 1,
        tags: ['algebra', 'linear-equations'],
      },
    }),
    prisma.question.create({
      data: {
        createdBy: teacher.id,
        schoolId: school.id,
        type: QuestionType.MCQ,
        body: 'A rectangle has a perimeter of 48 cm. If the length is 14 cm, what is the width?',
        options: [
          { id: 'a', text: '10 cm' },
          { id: 'b', text: '20 cm' },
          { id: 'c', text: '7 cm' },
          { id: 'd', text: '34 cm' },
        ],
        correctIds: ['a'],
        points: 2,
        difficulty: 2,
        tags: ['geometry', 'perimeter'],
      },
    }),
    prisma.question.create({
      data: {
        createdBy: teacher.id,
        schoolId: school.id,
        type: QuestionType.MCQ,
        body: 'What is the value of 2³ × 5?',
        options: [
          { id: 'a', text: '30' },
          { id: 'b', text: '40' },
          { id: 'c', text: '25' },
          { id: 'd', text: '80' },
        ],
        correctIds: ['b'],
        points: 1,
        difficulty: 1,
        tags: ['exponents', 'arithmetic'],
      },
    }),
    prisma.question.create({
      data: {
        createdBy: teacher.id,
        schoolId: school.id,
        type: QuestionType.TRUE_FALSE,
        body: 'The sum of angles in any triangle is always 180 degrees.',
        options: [
          { id: 'true', text: 'True' },
          { id: 'false', text: 'False' },
        ],
        correctIds: ['true'],
        points: 1,
        difficulty: 1,
        tags: ['geometry', 'triangles'],
      },
    }),
    prisma.question.create({
      data: {
        createdBy: teacher.id,
        schoolId: school.id,
        type: QuestionType.MCQ,
        body: 'If the ratio of boys to girls in a class is 3:4 and there are 28 students total, how many boys are there?',
        options: [
          { id: 'a', text: '16' },
          { id: 'b', text: '12' },
          { id: 'c', text: '14' },
          { id: 'd', text: '18' },
        ],
        correctIds: ['b'],
        points: 3,
        difficulty: 2,
        tags: ['ratios', 'problem-solving'],
      },
    }),
  ]);
  console.log(`✅ Questions: ${questions.length} created`);

  // ── Exam ──
  const exam = await prisma.exam.create({
    data: {
      title: 'Mathematics — Unit 3 Assessment',
      description: 'Algebra and Problem Solving end-of-chapter test',
      schoolId: school.id,
      teacherId: teacher.id,
      status: ExamStatus.PUBLISHED,
      durationMinutes: 30,
      maxViolations: 3,
      shuffleQuestions: false,
      shuffleOptions: false,
      showResultsAfter: true,
      passingScore: 60,
      instructions: 'Answer all questions. No calculators allowed. You have 30 minutes.',
      items: {
        create: questions.map((q, i) => ({
          questionId: q.id,
          order: i + 1,
        })),
      },
      assignments: {
        create: [{ classId: cls.id }],
      },
    },
  });
  console.log('✅ Exam:', exam.title);

  // ── Second school for cross-tenant chaos walkthrough ──
  const otherSchool = await prisma.school.upsert({
    where: { domain: 'other.school.edu' },
    update: {},
    create: { name: 'Other School', domain: 'other.school.edu' },
  });
  await prisma.user.upsert({
    where: { email: 'teacher@other.school.edu' },
    update: {},
    create: {
      email: 'teacher@other.school.edu',
      passwordHash: teacherPassword,
      name: 'Other Teacher',
      role: Role.TEACHER,
      schoolId: otherSchool.id,
    },
  });
  console.log('✅ Other school + teacher (for cross-tenant test cases)');

  // ── Feature catalogue + per-school toggles (cycle 2.0e / D4) ──
  // The catalogue is also seeded by the migration; upsert here is idempotent
  // and makes the seed self-contained for a fresh DB without `migrate dev`.
  await prisma.feature.upsert({
    where: { key: 'ai-authoring' },
    update: {},
    create: {
      key: 'ai-authoring',
      name: 'AI question authoring',
      description: 'Lets teachers generate questions and grading feedback with Claude. Off by default; opt-in per school.',
      category: 'ai',
      defaultEnabled: false,
    },
  });
  await prisma.feature.upsert({
    where: { key: 'live-proctoring' },
    update: {},
    create: {
      key: 'live-proctoring',
      name: 'Live video proctoring',
      description: 'Reserved placeholder for a future cycle.',
      category: 'proctoring',
      defaultEnabled: false,
    },
  });
  await prisma.feature.upsert({
    where: { key: 'seb-tier-3' },
    update: {},
    create: {
      key: 'seb-tier-3',
      name: 'Safe Exam Browser (Tier 3)',
      description: 'Reserved for Stage 5. SEB handoff for Tier-3 sit-down exams on Windows.',
      category: 'proctoring',
      defaultEnabled: false,
    },
  });

  // Demo convenience: turn AI authoring ON for the demo school so reviewers
  // can hit /api/v1/ai/* without first having to toggle the flag. The
  // feature stays OFF for the second school so cross-school behaviour is
  // visible in the manual test walkthrough.
  await prisma.schoolFeature.upsert({
    where: { schoolId_featureKey: { schoolId: school.id, featureKey: 'ai-authoring' } },
    update: { enabled: true, enabledAt: new Date(), enabledById: admin.id, disabledAt: null },
    create: {
      schoolId: school.id,
      featureKey: 'ai-authoring',
      enabled: true,
      enabledAt: new Date(),
      enabledById: admin.id,
    },
  });
  console.log('✅ Feature flags seeded (ai-authoring ON for demo school)');

  // ── Sample PLATFORM_ADMIN impersonation audit row (cycle 2.0f) ──
  // Gives docs/05-manual-testing.md's "compliance ledger" check something
  // to return without needing to actually exercise the platform admin UI.
  await prisma.auditLog.create({
    data: {
      actorId: superAdmin.id,
      action: AuditAction.SCHOOL_PROVISIONED,
      targetType: 'School',
      targetId: school.id,
      meta: { name: school.name, seeded: true } as object,
      actorRole: 'PLATFORM_ADMIN',
      actorSchoolId: null,
      targetSchoolId: school.id,
      impersonation: true,
    },
  });
  console.log('✅ Sample impersonation audit row written');

  console.log('\n🎉 Seed complete!\n');
  console.log('Demo accounts (passwords are bcrypt cost 12, all in plain text below for dev convenience):');
  console.log('  PLATFORM_ADMIN:  superadmin@demo.school.edu / superadmin123  (vendor-side, cross-tenant)');
  console.log('  SCHOOL_ADMIN:    admin@demo.school.edu      / admin123       (demo school IT lead)');
  console.log('  TEACHER (demo):  teacher@demo.school.edu    / teacher123');
  console.log('  TEACHER (other): teacher@other.school.edu   / teacher123     (B-side school)');
  console.log('  STUDENT 1..5:    student[1-5]@demo.school.edu / student123');
  console.log('\nFeature flags:');
  console.log('  demo.school.edu  → ai-authoring ON, live-proctoring + seb-tier-3 OFF');
  console.log('  other.school.edu → all flags OFF (default)');
  console.log('\nNext: see docs/05-manual-testing.md for end-to-end flows.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
