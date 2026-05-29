import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import gameDataRouter from "./game-data";
import { logger } from "./lib/logger";

const app: Express = express();

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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// JSON-file-backed game data endpoints (register / login / leaderboard / ai).
// Mounted before the static + catch-all handlers so e.g. GET /leaderboard
// returns JSON instead of falling through to index.html.
app.use(gameDataRouter);

const webSitePath = path.resolve(__dirname, "../../../game-app/webSite");
const profilePath = path.resolve(__dirname, "../../../game-app/profile");
app.use(express.static(webSitePath));
app.use(express.static(profilePath));

app.get(["/profile", "/profile.html"], (_req, res) => {
  res.sendFile(path.join(profilePath, "profile.html"));
});
app.get("/profile.js", (_req, res) => {
  res.sendFile(path.join(profilePath, "profile.js"));
});

app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(webSitePath, "index.html"));
});

export default app;
