import { Router, type IRouter, type Request, type Response } from "express";
import { promises as fs } from "fs";
import path from "path";

/*
 * game-data.ts — JSON-file-backed data endpoints for the api-server.
 *
 * The api-server serves the static game site but previously had NO data
 * endpoints, so POST /register, /login and the leaderboard silently 404'd
 * (and GET /leaderboard fell through to the catch-all, returning index.html
 * instead of JSON). That is the root cause of "registration data isn't saved"
 * whenever the api-server — rather than the root server.js — is the live
 * runtime.
 *
 * These routes mirror server.js exactly and persist to the same JSON files in
 * game-app/Data, keeping the project's "no external database" design (per the
 * PRD) while making data durable across requests within an instance.
 */

const DATA_DIR = path.resolve(__dirname, "../../../game-app/Data");
const PLAYERS_PATH = path.join(DATA_DIR, "players.json");
const LEADERBOARD_PATH = path.join(DATA_DIR, "leaderboard.json");
const AI_MODEL_PATH = path.join(DATA_DIR, "ai-model.json");
const AI_RECORDING_PATH = path.join(DATA_DIR, "ai-recordings.json");

async function readArray(file: string): Promise<any[]> {
  try {
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

const router: IRouter = Router();

// ── Auth ────────────────────────────────────────────────────────────────────
router.post("/register", async (req: Request, res: Response) => {
  const { username, email, password, country = "", avatar = "Madeline" } =
    req.body ?? {};

  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ message: "Username, email, and password are required." });
  }

  const players = await readArray(PLAYERS_PATH);
  if (players.find((p) => p.username === username)) {
    return res.status(400).json({ message: "Username is already taken!" });
  }
  if (players.find((p) => p.email === email)) {
    return res
      .status(400)
      .json({ message: "An account with that email already exists." });
  }

  const newUser = {
    id: "u-" + Math.random().toString(36).slice(2, 8),
    username,
    email,
    password,
    country,
    avatar,
    role: "player",
    bio: "",
    deathCount: 0,
    bestTimes: {},
    levelsCompleted: 0,
    achievements: [],
    rank: null,
    registeredAt: new Date().toISOString(),
    lastLogin: null,
  };
  players.push(newUser);
  await writeJson(PLAYERS_PATH, players);
  return res.status(201).json({ message: "Account created successfully!" });
});

router.post("/login", async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  const players = await readArray(PLAYERS_PATH);
  const validUser = players.find(
    (p) => (p.username === username || p.email === username) && p.password === password,
  );

  if (!validUser) {
    return res.status(401).json({ message: "Invalid username or password." });
  }

  validUser.lastLogin = new Date().toISOString();
  await writeJson(PLAYERS_PATH, players);
  const { password: _pw, ...safeUser } = validUser;
  return res.json({ message: "Login successful!", user: safeUser });
});

// ── Leaderboard ───────────────────────────────────────────────────────────────
router.get("/leaderboard", async (_req: Request, res: Response) => {
  res.json(await readArray(LEADERBOARD_PATH));
});

router.post("/leaderboard", async (req: Request, res: Response) => {
  const entry = req.body ?? {};
  const records = await readArray(LEADERBOARD_PATH);
  records.push({ ...entry, savedAt: new Date().toISOString() });
  await writeJson(LEADERBOARD_PATH, records);
  return res.status(201).json({ message: "Run saved." });
});

// ── AI model / recordings (parity with server.js; keeps the game quiet) ───────
router.get("/ai-model", async (_req: Request, res: Response) => {
  try {
    const raw = await fs.readFile(AI_MODEL_PATH, "utf-8");
    res.type("application/json").send(raw);
  } catch {
    res.status(404).json({ weights: null });
  }
});

router.post("/ai-model", async (req: Request, res: Response) => {
  const data = req.body ?? {};
  if (Array.isArray(data.weights) && data.weights.length > 0) {
    let currentBestFit = -Infinity;
    try {
      const parsed = JSON.parse(await fs.readFile(AI_MODEL_PATH, "utf-8"));
      if (typeof parsed.bestFit === "number") currentBestFit = parsed.bestFit;
    } catch {
      /* no existing model */
    }
    const incomingFit = typeof data.bestFit === "number" ? data.bestFit : 0;
    if (incomingFit > currentBestFit) {
      await writeJson(AI_MODEL_PATH, data);
      return res.json({ message: "AI model saved.", accepted: true });
    }
  }
  return res.json({
    message: "Existing model is better, not overwritten.",
    accepted: false,
  });
});

router.get("/ai-recording", async (_req: Request, res: Response) => {
  res.json(await readArray(AI_RECORDING_PATH));
});

router.post("/ai-recording", async (req: Request, res: Response) => {
  const session = req.body ?? {};
  if (!Array.isArray(session.frames) || session.frames.length === 0) {
    return res.status(400).json({ message: "No frames in recording." });
  }
  const recordings = await readArray(AI_RECORDING_PATH);
  recordings.push({
    seed: session.seed || 0,
    recordedAt: new Date().toISOString(),
    frames: session.frames,
  });
  await writeJson(AI_RECORDING_PATH, recordings);
  return res.status(201).json({
    message: "Recording saved.",
    frames: session.frames.length,
  });
});

export default router;
