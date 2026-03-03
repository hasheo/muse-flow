import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const DEFAULT_TTL_SECONDS = 60 * 30;

const sessionPayloadSchema = z
  .object({
    uid: z.string().min(1),
    pid: z.string().min(1),
    tracksHash: z.string().min(1),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().nonnegative(),
    nonce: z.string().min(1),
  })
  .strict();

export type QuizSessionPayload = z.infer<typeof sessionPayloadSchema>;

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getQuizSessionSecret() {
  const secret = process.env.QUIZ_SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("Missing QUIZ_SESSION_SECRET or NEXTAUTH_SECRET.");
  }
  return secret;
}

function sign(data: string, secret: string) {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function buildTracksHash(trackIds: string[]) {
  const sorted = [...trackIds].sort();
  return createHmac("sha256", "quiz-session-tracks").update(sorted.join("|")).digest("base64url");
}

export function createQuizSessionToken(input: {
  userId: string;
  playlistId: string;
  trackIds: string[];
  ttlSeconds?: number;
}) {
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload: QuizSessionPayload = {
    uid: input.userId,
    pid: input.playlistId,
    tracksHash: buildTracksHash(input.trackIds),
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    nonce: randomUUID(),
  };

  const header = { alg: "HS256", typ: "QST" } as const;
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(signingInput, getQuizSessionSecret());
  return `${signingInput}.${signature}`;
}

export function verifyQuizSessionToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false as const, reason: "Malformed token" };
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = sign(signingInput, getQuizSessionSecret());

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

  const parsedPayload = sessionPayloadSchema.safeParse(payloadRaw);
  if (!parsedPayload.success) {
    return { valid: false as const, reason: "Invalid payload shape" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (parsedPayload.data.exp < nowSeconds) {
    return { valid: false as const, reason: "Token expired" };
  }

  return { valid: true as const, payload: parsedPayload.data };
}

export function getQuizTracksHash(trackIds: string[]) {
  return buildTracksHash(trackIds);
}
