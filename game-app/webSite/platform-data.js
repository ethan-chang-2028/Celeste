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

    // ── Built-in levels (mirrors levels.json schema, Section 8.4) ─────────────
    const LEVELS = [
        { id: 'level-1', name: 'Forsaken City',  difficulty: 'easy' },
        { id: 'level-2', name: 'Old Site',       difficulty: 'medium' },
        { id: 'level-3', name: 'Crystal Caverns', difficulty: 'hard' },
        { id: 'level-4', name: 'Golden Ridge',   difficulty: 'expert' },
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
        { runId: 'r-0001', playerId: 'u-nova003',  levelId: 'level-1', completionTime: 28.41, deathCount: 1,  completedAt: days(0),  raceType: 'solo' },
        { runId: 'r-0002', playerId: 'u-4f2a9c',   levelId: 'level-1', completionTime: 31.07, deathCount: 3,  completedAt: days(1),  raceType: 'solo' },
        { runId: 'r-0003', playerId: 'u-blink04',  levelId: 'level-1', completionTime: 34.88, deathCount: 6,  completedAt: days(9),  raceType: 'pvai' },
        { runId: 'r-0004', playerId: 'u-4f2a9c',   levelId: 'level-2', completionTime: 52.19, deathCount: 4,  completedAt: days(2),  raceType: 'solo' },
        { runId: 'r-0005', playerId: 'u-megan002', levelId: 'level-2', completionTime: 49.63, deathCount: 2,  completedAt: days(0),  raceType: 'pvp'  },
        { runId: 'r-0006', playerId: 'u-nova003',  levelId: 'level-2', completionTime: 58.02, deathCount: 9,  completedAt: days(12), raceType: 'solo' },
        { runId: 'r-0007', playerId: 'u-blink04',  levelId: 'level-3', completionTime: 77.45, deathCount: 14, completedAt: days(3),  raceType: 'solo' },
        { runId: 'r-0008', playerId: 'u-megan002', levelId: 'level-3', completionTime: 71.90, deathCount: 8,  completedAt: days(0),  raceType: 'pvai' },
        { runId: 'r-0009', playerId: 'u-ethan001', levelId: 'level-3', completionTime: 84.12, deathCount: 18, completedAt: days(20), raceType: 'solo' },
        { runId: 'r-0010', playerId: 'u-nova003',  levelId: 'level-4', completionTime: 119.7, deathCount: 25, completedAt: days(5),  raceType: 'pvp'  },
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

    // Fetch run records: server first, then merge seed so the page is never empty.
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
        } catch (_) { /* offline / file:// — use seed only */ }

        // Normalise + de-duplicate by runId (server records win).
        const byId = new Map();
        for (const r of SEED_RUNS) byId.set(r.runId, r);
        for (const r of server) {
            const id = r.runId || `srv-${byId.size}`;
            byId.set(id, normaliseRun({ runId: id, ...r }));
        }
        return [...byId.values()].filter(r => typeof r.completionTime === 'number');
    }

    function normaliseRun(r) {
        return {
            runId: r.runId,
            playerId: r.playerId || r.userId || r.player || 'unknown',
            levelId: r.levelId || r.level || 'level-1',
            completionTime: Number(r.completionTime ?? r.time ?? r.timeMs / 1000),
            deathCount: Number(r.deathCount ?? r.deaths ?? 0),
            completedAt: r.completedAt || r.savedAt || new Date().toISOString(),
            raceType: r.raceType || 'solo',
        };
    }

    function levelName(id) {
        const l = LEVELS.find(x => x.id === id);
        return l ? l.name : id;
    }

    global.ApexData = {
        LEVELS, ACHIEVEMENTS,
        allUsers, resolveUser, avatarEmoji, currentUser,
        fetchRuns, levelName,
    };
})(window);
