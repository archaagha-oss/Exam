// apps/api/src/modules/auth/auth.service.ts
import bcrypt from 'bcrypt';
import prisma from '../../lib/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt';
import { issueFamily, rotate, revoke } from '../../lib/refreshTokens';

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { school: { select: { id: true, name: true } } },
  });

  if (!user) throw new Error('Invalid email or password');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error('Invalid email or password');

  // Track last login time (non-critical)
  await prisma.user
    .update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })
    .catch(() => {});

  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role as any,
    schoolId: user.schoolId,
    name: user.name,
  };

  const familyId = await issueFamily(user.id);
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(user.id, familyId);

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
  const { sub: userId, fid } = verifyRefreshToken(token);

  // Rotate: validate old family, revoke it, issue a new one.
  // Tokens with no fid (issued before rollout) are accepted once and upgraded.
  let newFamilyId: string;
  if (fid) {
    const rotated = await rotate(userId, fid);
    if (!rotated) throw new Error('Refresh token revoked');
    newFamilyId = rotated;
  } else {
    newFamilyId = await issueFamily(userId);
  }

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
    refreshToken: signRefreshToken(user.id, newFamilyId),
  };
}

export async function logout(token?: string) {
  if (!token) return;
  try {
    const { sub: userId, fid } = verifyRefreshToken(token);
    if (fid) await revoke(userId, fid);
  } catch {
    // Already invalid token — nothing to revoke
  }
}
