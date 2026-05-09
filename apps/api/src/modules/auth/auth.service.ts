// apps/api/src/modules/auth/auth.service.ts
import bcrypt from 'bcrypt';
import prisma from '../../lib/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt';

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { school: { select: { id: true, name: true } } },
  });

  if (!user) throw new Error('Invalid email or password');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error('Invalid email or password');

  // Track last login time
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  }).catch(() => {}); // non-critical, don't block login

  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role as any,
    schoolId: user.schoolId,
    name: user.name,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      schoolId: user.schoolId,
      school: user.school,
    },
  };
}


  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role as any,
    schoolId: user.schoolId,
    name: user.name,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      schoolId: user.schoolId,
      school: user.school,
    },
  };
}

export async function refresh(token: string) {
  const { sub: userId } = verifyRefreshToken(token);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role as any,
    schoolId: user.schoolId,
    name: user.name,
  };

  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(user.id),
  };
}
