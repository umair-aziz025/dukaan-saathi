import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.set("trust proxy", 1);

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

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));
app.use("/api", router);
app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(error);
  const candidate = error as { status?: unknown; message?: unknown };
  const status = typeof candidate?.status === "number" && candidate.status >= 400 && candidate.status < 500
    ? candidate.status
    : 500;
  req.log.error({ errorName: error instanceof Error ? error.name : "unknown", status }, "API request failed");
  const message = status < 500 && typeof candidate?.message === "string"
    ? candidate.message
    : "Unexpected server error.";
  res.status(status).json({ error: message });
});

export default app;
