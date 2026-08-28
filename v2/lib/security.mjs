import { createHash, createHmac, timingSafeEqual } from "node:crypto";

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

// Сравнение секретов постоянным временем. Хэширование уравнивает длину, иначе
// timingSafeEqual падает на строках разного размера и разница длин утекает.
export function safeEqual(left, right) {
  const digest = (value) => createHash("sha256").update(String(value ?? "")).digest();
  return timingSafeEqual(digest(left), digest(right));
}

// TLS обычно снимает обратный прокси, поэтому проверяется и его заголовок.
export function isSecureRequest(request) {
  return Boolean(request.socket?.encrypted) || request.headers["x-forwarded-proto"] === "https";
}

// Ключ ограничения попыток. Заголовку X-Forwarded-For доверяем только по явной
// настройке: иначе перебор обходится подстановкой любого адреса.
export function clientKey(request, trustProxy = false) {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    if (forwarded) return forwarded.split(",")[0].trim();
  }
  return request.socket?.remoteAddress ?? "unknown";
}

// Ограничение попыток входа. Пароль один и общий, значит перебор — не
// теоретический риск, а самый дешёвый способ попасть в панель.
export function createLoginGuard(options = {}) {
  const { maxAttempts = 5, windowMs = 15 * 60_000, blockMs = 15 * 60_000, now = () => Date.now(), maxKeys = 10_000 } = options;
  const attempts = new Map();

  const prune = (moment) => {
    for (const [key, entry] of attempts) {
      if (entry.blockedUntil <= moment && entry.firstAt + windowMs <= moment) attempts.delete(key);
    }
    if (attempts.size > maxKeys) attempts.clear();
  };

  return {
    blockedFor(key) {
      const entry = attempts.get(key);
      if (!entry) return 0;
      return Math.max(0, entry.blockedUntil - now());
    },
    fail(key) {
      const moment = now();
      prune(moment);
      const entry = attempts.get(key);
      if (!entry || entry.firstAt + windowMs <= moment) {
        attempts.set(key, { count: 1, firstAt: moment, blockedUntil: 0 });
        return;
      }
      entry.count += 1;
      if (entry.count >= maxAttempts) {
        entry.blockedUntil = moment + blockMs;
        entry.count = 0;
        entry.firstAt = moment;
      }
    },
    reset(key) {
      attempts.delete(key);
    },
  };
}

export function readCookie(request, name) {
  const cookies = request.headers.cookie?.split(";") ?? [];
  for (const item of cookies) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return "";
}

// Строгая проверка: отсутствие заголовка Origin больше не считается «свой».
// Браузер его присылает всегда, а не-браузерный клиент раньше обходил проверку,
// просто не отправив заголовок. Referer принимается как запасной вариант для
// старых клиентов.
export function sameOrigin(request) {
  const host = request.headers.host;
  if (!host) return false;
  const allowed = [`http://${host}`, `https://${host}`];
  const origin = request.headers.origin;
  if (origin) return allowed.includes(origin);
  const referer = request.headers.referer;
  if (referer) return allowed.some((value) => referer.startsWith(`${value}/`));
  return false;
}
