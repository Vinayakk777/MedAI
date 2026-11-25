import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  createRateLimiter,
  isOriginAllowed,
  parseAllowedOrigins,
  securityHeaders,
} from "./middlewares/httpSecurity";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, "..", "..", "medical-ai", "dist", "public");

const app: Express = express();
app.disable("x-powered-by");

const allowedOrigins = parseAllowedOrigins();

app.use(securityHeaders);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    // Do not throw: disallowed origins simply receive no CORS headers.
    callback(null, isOriginAllowed(origin, allowedOrigins));
  },
}));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "2mb" }));
app.use(express.urlencoded({
  extended: true,
  limit: process.env.FORM_BODY_LIMIT || "1mb",
  parameterLimit: 1000,
}));

app.use(clerkMiddleware());

app.use("/api", createRateLimiter({ windowMs: 60_000, max: 300 }));
app.use("/api", router);

// ─── Global Error Handler ───
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err, message: err.message }, "Unhandled error");

  const status =
    typeof err?.status === "number" && err.status >= 400 && err.status < 500
      ? err.status
      : 500;
  const message =
    status === 413
      ? "Payload too large"
      : status === 400
        ? "Bad request"
        : status === 429
          ? "Too many requests"
          : status >= 500
            ? "Internal server error"
            : "Request could not be processed";

  res.status(status).json({ error: message });
});

app.use(express.static(frontendDist));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

export default app;
