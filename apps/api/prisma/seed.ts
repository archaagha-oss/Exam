// apps/api/prisma/seed.ts
// Run: npm run db:seed --workspace=apps/api

import { PrismaClient, Role, QuestionType, ExamStatus } from '@prisma/client';
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

  console.log('\n🎉 Seed complete!\n');
  console.log('Demo accounts:');
  console.log('  Super:   superadmin@demo.school.edu / superadmin123');
  console.log('  Admin:   admin@demo.school.edu   / admin123');
  console.log('  Teacher: teacher@demo.school.edu / teacher123');
  console.log('  Student: student1@demo.school.edu / student123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
