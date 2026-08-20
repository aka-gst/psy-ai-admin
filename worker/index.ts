/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { sources } from "../app/content.js";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/live") {
      const topic = url.searchParams.get("topic") ?? "";
      const configured = sources[topic as keyof typeof sources];
      const source = configured?.dynamic ? configured.url : null;
      if (!source) return Response.json({ error: "Unknown public topic" }, { status: 400 });
      try {
        const upstream = await fetch(source, {
          headers: { "User-Agent": "PsyAIAdminDemo/0.2 (+public-demo)" },
          signal: AbortSignal.timeout(8000),
        });
        if (!upstream.ok) throw new Error("upstream unavailable");
        await upstream.body?.cancel();
        return Response.json({
          topic,
          url: source,
          checkedAt: new Date().toISOString(),
          available: true,
        }, { headers: { "Cache-Control": "no-store" } });
      } catch { return Response.json({ error: "Public page unavailable" }, { status: 502 }); }
    }

    if (url.pathname === "/api/health") {
      const entries = Object.entries(sources);
      const results = await Promise.all(entries.map(async ([key, source]) => {
        try {
          const upstream = await fetch(source.url, {
            headers: { "User-Agent": "PsyAIAdminDemo/0.3 (+link-check)" },
            signal: AbortSignal.timeout(8000),
          });
          const status = upstream.status;
          await upstream.body?.cancel();
          return { key, label: source.label, url: source.url, available: upstream.ok, status };
        } catch {
          return { key, label: source.label, url: source.url, available: false, status: null };
        }
      }));
      return Response.json({
        checkedAt: new Date().toISOString(),
        available: results.filter((item) => item.available).length,
        total: results.length,
        results,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
