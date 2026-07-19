import { hashToken, getRandomValues } from '@librechat/data-schemas';

export const COURSE_INVITE_TOKEN_TYPE = 'course_invite';
export const COURSE_INVITE_EXPIRES_IN_SECONDS: number = 7 * 24 * 60 * 60;
export const COURSE_SHARE_TOKEN_TYPE = 'course_share';
export const COURSE_SHARE_EXPIRES_IN_SECONDS: number = 30 * 24 * 60 * 60;

export type CourseInviteTokenRecord = {
  userId: unknown;
  email?: string;
  type?: string;
  identifier?: string;
  token: string;
  expiresAt: Date | string;
};

export type CourseInviteTokenDeps = {
  createToken: (data: {
    userId: string;
    email?: string;
    type: string;
    identifier: string;
    token: string;
    expiresIn: number;
    metadata: { courseId: string };
  }) => Promise<unknown>;
  deleteTokens: (filter: {
    email?: string;
    type: string;
    identifier: string;
  }) => Promise<unknown>;
  findToken: (filter: {
    token: string;
    email?: string;
    type: string;
  }) => Promise<CourseInviteTokenRecord | null>;
};

export type CreatedCourseInviteToken = {
  token: string;
  expiresAt: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Creates a course-scoped, email-bound registration claim. Only the hash is
 * stored; the returned token is the one-time secret placed in the invite URL.
 */
export async function createCourseInviteToken(
  input: { email: string; courseId: string; invitedBy: string },
  deps: Pick<CourseInviteTokenDeps, 'createToken' | 'deleteTokens'>,
): Promise<CreatedCourseInviteToken> {
  const email = normalizeEmail(input.email);
  const courseId = input.courseId.trim();
  if (!email || !courseId || !input.invitedBy) {
    throw new Error('Email, course, and inviter are required');
  }

  const rawToken = await getRandomValues(32);
  const hashedToken = await hashToken(rawToken);
  await deps.deleteTokens({
    email,
    type: COURSE_INVITE_TOKEN_TYPE,
    identifier: courseId,
  });
  await deps.createToken({
    userId: input.invitedBy,
    email,
    type: COURSE_INVITE_TOKEN_TYPE,
    identifier: courseId,
    token: hashedToken,
    expiresIn: COURSE_INVITE_EXPIRES_IN_SECONDS,
    metadata: { courseId },
  });

  return {
    token: encodeURIComponent(rawToken),
    expiresAt: new Date(Date.now() + COURSE_INVITE_EXPIRES_IN_SECONDS * 1000).toISOString(),
  };
}

/**
 * Resolves an unexpired course invite for the exact email submitted during
 * registration. The record's identifier is the authoritative course id.
 */
export async function getCourseInviteToken(
  encodedToken: string,
  email: string,
  deps: Pick<CourseInviteTokenDeps, 'findToken'>,
): Promise<CourseInviteTokenRecord | null> {
  try {
    const rawToken = decodeURIComponent(encodedToken);
    const hashedToken = await hashToken(rawToken);
    const normalizedEmail = normalizeEmail(email);
    const invite = await deps.findToken({
      token: hashedToken,
      email: normalizedEmail,
      type: COURSE_INVITE_TOKEN_TYPE,
    });
    if (
      !invite ||
      invite.type !== COURSE_INVITE_TOKEN_TYPE ||
      !invite.identifier ||
      normalizeEmail(invite.email ?? '') !== normalizedEmail ||
      new Date(invite.expiresAt).getTime() <= Date.now()
    ) {
      return null;
    }
    return invite;
  } catch {
    return null;
  }
}

/**
 * Creates one reusable course-wide join link. Generating a replacement
 * invalidates the previous share link for that course.
 */
export async function createCourseShareToken(
  input: { courseId: string; invitedBy: string },
  deps: Pick<CourseInviteTokenDeps, 'createToken' | 'deleteTokens'>,
): Promise<CreatedCourseInviteToken> {
  const courseId = input.courseId.trim();
  if (!courseId || !input.invitedBy) {
    throw new Error('Course and inviter are required');
  }

  const rawToken = await getRandomValues(32);
  const hashedToken = await hashToken(rawToken);
  await deps.deleteTokens({
    type: COURSE_SHARE_TOKEN_TYPE,
    identifier: courseId,
  });
  await deps.createToken({
    userId: input.invitedBy,
    type: COURSE_SHARE_TOKEN_TYPE,
    identifier: courseId,
    token: hashedToken,
    expiresIn: COURSE_SHARE_EXPIRES_IN_SECONDS,
    metadata: { courseId },
  });

  return {
    token: encodeURIComponent(rawToken),
    expiresAt: new Date(Date.now() + COURSE_SHARE_EXPIRES_IN_SECONDS * 1000).toISOString(),
  };
}

/** Resolves an unexpired reusable course-wide join link. */
export async function getCourseShareToken(
  encodedToken: string,
  deps: Pick<CourseInviteTokenDeps, 'findToken'>,
): Promise<CourseInviteTokenRecord | null> {
  try {
    const rawToken = decodeURIComponent(encodedToken);
    const hashedToken = await hashToken(rawToken);
    const invite = await deps.findToken({
      token: hashedToken,
      type: COURSE_SHARE_TOKEN_TYPE,
    });
    if (
      !invite ||
      invite.type !== COURSE_SHARE_TOKEN_TYPE ||
      !invite.identifier ||
      new Date(invite.expiresAt).getTime() <= Date.now()
    ) {
      return null;
    }
    return invite;
  } catch {
    return null;
  }
}
