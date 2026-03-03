import { apiError } from "@/lib/api-response";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const playlistWriteRateLimit = {
  windowMs: 60_000,
  maxRequests: 40,
};

export async function enforcePlaylistWriteRateLimit(
  request: Request,
  userId: string,
  action: string,
): Promise<Response | null> {
  const ip = getClientIp(request.headers);
  const rateLimit = await checkRateLimit(`playlist-write:${action}:${userId}:${ip}`, playlistWriteRateLimit);

  if (rateLimit.allowed) {
    return null;
  }

  return apiError({
    status: 429,
    code: "RATE_LIMITED",
    message: "Too many write requests. Please try again shortly.",
    details: { action, retryAfterMs: rateLimit.retryAfterMs },
    headers: {
      "Retry-After": Math.ceil(rateLimit.retryAfterMs / 1000).toString(),
    },
  });
}
