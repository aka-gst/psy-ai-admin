import { createHmac, timingSafeEqual } from "node:crypto";

const encode = (value) => Buffer.from(value).toString("base64url");

export function createSession(secret, ttlSeconds = 8 * 60 * 60) {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = encode(JSON.stringify({ role: "manager", expires }));
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySession(token, secret) {
  if (!token || !secret) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.role === "manager" && data.expires > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function readCookie(request, name) {
  const cookies = request.headers.cookie?.split(";") ?? [];
  for (const item of cookies) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return "";
}

export function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  return origin === `http://${request.headers.host}` || origin === `https://${request.headers.host}`;
}
