/*
 * platform-data.js — shared client-side data layer for the Apex Platformer
 * web platform pages (home, leaderboard, achievements).
 *
 * The site is a static front-end backed by an optional Node server
 * (server.js). Pages try the server first and fall back to seed data +
 * localStorage, mirroring the pattern already used by app.js / register.js.
 */
(function (global) {
    'use strict';

    // ── Ranked levels — the two hand-crafted levels (mirrors levels.json) ─────
    // These ids match the keys the game submits (game.js `levelKey`).
    const LEVELS = [
        { id: 'maze',     name: 'Mirror Temple',         difficulty: 'hard' },
        { id: 'mountain', name: 'Heart of the Mountain', difficulty: 'expert' },
    ];

    // ── Seed users (matches users.json, Section 8.2) ──────────────────────────
    const SEED_USERS = [
        { id: 'u-4f2a9c',   username: 'SkyDasher99', country: 'Australia', avatar: 'Madeline', role: 'player' },
        { id: 'u-ethan001', username: 'ethan',       country: 'USA',       avatar: 'Madeline', role: 'player' },
        { id: 'u-megan002', username: 'MeganM',      country: 'Canada',    avatar: 'Badeline', role: 'admin'  },
        { id: 'u-nova003',  username: 'NovaLeap',    country: 'Japan',     avatar: 'Theo',     role: 'player' },
        { id: 'u-blink04',  username: 'BlinkWall',   country: 'Germany',   avatar: 'Granny',   role: 'player' },
    ];

    // ── Seed run records (matches leaderboard.json, Section 8.3) ──────────────
    // At least one field (playerId) links to a user id; levelId links to a level.
    const now = Date.now();
    const days = (n) => new Date(now - n * 86400000).toISOString();
    const SEED_RUNS = [
        // Leaderboard starts empty — real runs are added as players submit them.
    ];

    // ── Achievement definitions (Section 5.2 / Checkpoint 11) ─────────────────
    // `stat`  → key inside celeste_stats_<id> or the user object
    // `goal`  → threshold to unlock; progress bar = current / goal
    // `flag`  → unlocked purely by presence in user.achievements
    const ACHIEVEMENTS = [
        { id: 'first-clear',     name: 'First Clear',     icon: '🏁', desc: 'Complete your first level.',          stat: 'levelsCompleted', goal: 1 },
        { id: 'five-levels',     name: 'Getting Started', icon: '🗺️', desc: 'Complete 5 levels.',                   stat: 'levelsCompleted', goal: 5 },
        { id: 'ten-levels',      name: 'Explorer',        icon: '🧭', desc: 'Complete 10 levels.',                  stat: 'levelsCompleted', goal: 10 },
        { id: 'death-100',       name: 'Persistent',      icon: '💀', desc: 'Die 100 times. It happens.',           stat: 'deathCount',      goal: 100 },
        { id: 'death-1000',      name: 'Unbreakable',     icon: '⚰️', desc: 'Die 1,000 times and keep going.',      stat: 'deathCount',      goal: 1000 },
        { id: 'dash-master',     name: 'Dash Master',     icon: '⚡', desc: 'Perform 500 dashes.',                  stat: 'dashCount',       goal: 500 },
        { id: 'berry-collector', name: 'Berry Collector', icon: '🍓', desc: 'Collect 10 strawberries.',            stat: 'berriesCollected', goal: 10 },
        { id: 'golden-berry',    name: 'Golden Touch',    icon: '🌟', desc: 'Collect a golden strawberry.',        stat: 'goldenBerriesCollected', goal: 1 },
        { id: 'speedrun-bronze', name: 'Speedrun Bronze', icon: '🥉', desc: 'Finish any level under 60 seconds.',   stat: 'bestTimeSec',     goal: 60, lowerIsBetter: true },
        { id: 'speedrun-silver', name: 'Speedrun Silver', icon: '🥈', desc: 'Finish any level under 45 seconds.',   stat: 'bestTimeSec',     goal: 45, lowerIsBetter: true },
        { id: 'speedrun-gold',   name: 'Speedrun Gold',   icon: '🥇', desc: 'Finish any level under 30 seconds.',   stat: 'bestTimeSec',     goal: 30, lowerIsBetter: true },
        { id: 'beat-ghost',      name: 'Ghostbuster',     icon: '👻', desc: 'Beat the AI ghost in a PvAI race.',    flag: true },
        { id: 'pvp-victor',      name: 'Duelist',         icon: '⚔️', desc: 'Win a PvP race against another player.', flag: true },
    ];

    const AVATAR_EMOJI = { Madeline: '🧗', Badeline: '🌑', Granny: '👵', Theo: '📷' };

    // ── Helpers ───────────────────────────────────────────────────────────────
    function getRegisteredUsers() {
        try { return JSON.parse(localStorage.getItem('registeredUsers') || '[]'); }
        catch { return []; }
    }

    function allUsers() {
        const reg = getRegisteredUsers().map(u => ({
            id: u.id, username: u.username, country: u.country || '',
            avatar: u.avatar || 'Madeline', role: u.role || 'player',
        }));
        const seen = new Set(reg.map(u => u.id));
        return [...reg, ...SEED_USERS.filter(u => !seen.has(u.id))];
    }

    function resolveUser(id) {
        return allUsers().find(u => u.id === id)
            || { id, username: id, country: '', avatar: 'Madeline', role: 'player' };
    }

    function avatarEmoji(avatar) { return AVATAR_EMOJI[avatar] || '🎮'; }

    function currentUser() {
        try { return JSON.parse(sessionStorage.getItem('loggedInUser') || 'null'); }
        catch { return null; }
    }

    // Fetch run records: seed + locally-saved runs + server, merged so the page
    // is never empty and player-submitted runs always appear.
    async function fetchRuns() {
        let server = [];
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 3000);
            const res = await fetch('/leaderboard', { signal: controller.signal });
            clearTimeout(timer);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) server = data;
            }
        } catch (_) { /* offline / file:// — use seed + local only */ }

        let local = [];
        try { local = JSON.parse(localStorage.getItem('apex_runs') || '[]'); }
        catch (_) { local = []; }

        // De-duplicate by runId; later sources win (local + server over seed).
        const byId = new Map();
        for (const r of SEED_RUNS) byId.set(r.runId, normaliseRun(r));
        for (const r of [...local, ...server]) {
            const id = r.runId || `auto-${byId.size}`;
            byId.set(id, normaliseRun({ runId: id, ...r }));
        }
        return [...byId.values()]
            .filter(r => typeof r.completionTime === 'number' && !isNaN(r.completionTime));
    }

    function normaliseRun(r) {
        return {
            runId: r.runId,
            playerId: r.playerId || r.userId || r.player || 'unknown',
            playerName: r.playerName || null,
            country: r.country || null,
            levelId: r.levelId || r.level || 'maze',
            completionTime: Number(r.completionTime ?? r.time ?? (r.timeMs != null ? r.timeMs / 1000 : NaN)),
            deathCount: Number(r.deathCount ?? r.deaths ?? 0),
            completedAt: r.completedAt || r.savedAt || new Date().toISOString(),
            raceType: r.raceType || 'solo',
            won: r.won === true,   // race outcome — drives the AI / PvP win-rate boards
        };
    }

    // Resolve a run's display identity: prefer a known user (registered/seed),
    // then fall back to the name/country embedded in the run itself.
    function runIdentity(run) {
        const u = resolveUser(run.playerId);
        const known = u.username !== run.playerId;
        return {
            username: known ? u.username : (run.playerName || run.playerId),
            country:  (known && u.country) ? u.country : (run.country || '—'),
            avatar:   u.avatar,
        };
    }

    function levelName(id) {
        const l = LEVELS.find(x => x.id === id);
        return l ? l.name : id;
    }

    global.ApexData = {
        LEVELS, ACHIEVEMENTS,
        allUsers, resolveUser, runIdentity, avatarEmoji, currentUser,
        fetchRuns, levelName,
    };
})(window);
