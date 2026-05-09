// apps/api/src/modules/users/users.service.ts
import bcrypt from 'bcrypt';
import prisma from '../../lib/prisma';
import type { Role } from '@secureexam/shared-types';

export async function listUsers(schoolId: string, role?: Role) {
  return prisma.user.findMany({
    where: { schoolId, ...(role ? { role: role as any } : {}) },
    select: { id: true, email: true, name: true, role: true, schoolId: true, createdAt: true },
    orderBy: { name: 'asc' },
  });
}

export async function getUser(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, schoolId: true, createdAt: true },
  });
}

export async function createUser(data: {
  email: string;
  password: string;
  name: string;
  role: Role;
  schoolId: string;
}) {
  const passwordHash = await bcrypt.hash(data.password, 12);
  return prisma.user.create({
    data: {
      email: data.email.toLowerCase().trim(),
      passwordHash,
      name: data.name,
      role: data.role as any,
      schoolId: data.schoolId,
    },
    select: { id: true, email: true, name: true, role: true, schoolId: true, createdAt: true },
  });
}

export async function updateUser(id: string, data: { name?: string; email?: string }) {
  return prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, schoolId: true },
  });
}

export async function deleteUser(id: string) {
  return prisma.user.delete({ where: { id } });
}
