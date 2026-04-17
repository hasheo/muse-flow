import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import type { QuizAnswerMode } from "@/lib/quiz-answer-mode";
import type { QuizDifficulty } from "@/lib/quiz-difficulty";

const DEFAULT_TTL_SECONDS = 60 * 60;
const MAX_SEEN_IDS = 200;

const survivalPayloadSchema = z
  .object({
    uid: z.string().min(1),
    diff: z.string().min(1),
    mode: z.string().min(1),
    score: z.number().int().nonnegative(),
    strikes: z.number().int().nonnegative(),
    strikesAllowed: z.number().int().positive(),
    seen: z.array(z.string().min(1)),
    pending: z.string().min(1),
    pendingStart: z.number().int().nonnegative(),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().nonnegative(),
    nonce: z.string().min(1),
  })
  .strict();

export type SurvivalSessionPayload = z.infer<typeof survivalPayloadSchema>;

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSecret() {
  const secret = process.env.QUIZ_SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("Missing QUIZ_SESSION_SECRET or NEXTAUTH_SECRET.");
  }
  return secret;
}

function sign(data: string, secret: string) {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createSurvivalSessionToken(input: {
  userId: string;
  difficulty: QuizDifficulty;
  answerMode: QuizAnswerMode;
  score: number;
  strikes: number;
  strikesAllowed: number;
  seen: string[];
  pendingId: string;
  pendingStart: number;
  ttlSeconds?: number;
}) {
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const seen = input.seen.slice(-MAX_SEEN_IDS);
  const payload: SurvivalSessionPayload = {
    uid: input.userId,
    diff: input.difficulty,
    mode: input.answerMode,
    score: input.score,
    strikes: input.strikes,
    strikesAllowed: input.strikesAllowed,
    seen,
    pending: input.pendingId,
    pendingStart: input.pendingStart,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    nonce: randomUUID(),
  };

  const header = { alg: "HS256", typ: "SST" } as const;
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(signingInput, getSecret());
  return `${signingInput}.${signature}`;
}

export function verifySurvivalSessionToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false as const, reason: "Malformed token" };
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = sign(signingInput, getSecret());

  const actualBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  if (actualBuffer.length !== expectedBuffer.length) {
    return { valid: false as const, reason: "Invalid signature" };
  }
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) {
    return { valid: false as const, reason: "Invalid signature" };
  }

  let payloadRaw: unknown;
  try {
    payloadRaw = JSON.parse(fromBase64Url(encodedPayload));
  } catch {
    return { valid: false as const, reason: "Invalid payload" };
  }

  const parsed = survivalPayloadSchema.safeParse(payloadRaw);
  if (!parsed.success) {
    return { valid: false as const, reason: "Invalid payload shape" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (parsed.data.exp < nowSeconds) {
    return { valid: false as const, reason: "Token expired" };
  }

  return { valid: true as const, payload: parsed.data };
}
