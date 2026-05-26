/**
 * online-race.js
 *
 * Handles the WebSocket connection for online 1v1 races.
 * Exposes window.OnlineRace — called by game.js.
 *
 * Protocol (messages are plain JSON):
 *   join    → server queues or matches this client
 *   matched ← server sends shared seed + opponent name
 *   state   → sent every frame with this player's position
 *   opponent← server relays the other player's state each frame
 *   opponentLeft ← server tells us the other player disconnected
 */

(function () {
    'use strict';

    const WS_URL = (() => {
        const loc = window.location;
        const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${loc.host}`;
    })();

    const STATE = {
        IDLE:     'idle',
        WAITING:  'waiting',
        MATCHED:  'matched',
        FINISHED: 'finished',
    };

    const OnlineRace = {
        // ── Public state ──────────────────────────────────────────────────────
        status:       STATE.IDLE,  // idle | waiting | matched | finished
        seed:         null,
        opponentName: '',
        myName:       '',

        // Last received opponent snapshot (updated each frame by server relay)
        opponent: null,   // { x, y, vx, vy, state, dashes, cp, done, time }

        // Callbacks set by game.js
        onMatched:      null,  // (seed, opponentName) → void
        onOpponentLeft: null,  // () → void

        // ── Private ───────────────────────────────────────────────────────────
        _ws:   null,
        _tick: null,   // setInterval handle for heartbeat

        // ── Connect & join matchmaking queue ─────────────────────────────────
        join(playerName) {
            if (this._ws) this.disconnect();
            this.myName = (playerName || 'Player').trim() || 'Player';
            this.status = STATE.IDLE;
            this.opponent = null;

            try {
                this._ws = new WebSocket(WS_URL);
            } catch (e) {
                console.warn('[OnlineRace] WebSocket connect failed:', e);
                this._notifyUI('Connection failed — is the server running?', 'error');
                return;
            }

            const ws = this._ws;

            ws.onopen = () => {
                this._send({ type: 'join', name: this.myName });
                this.status = STATE.WAITING;
                this._notifyUI('Searching for opponent…', 'waiting');
            };

            ws.onmessage = (ev) => {
                let msg;
                try { msg = JSON.parse(ev.data); } catch { return; }
                this._handle(msg);
            };

            ws.onclose = () => {
                if (this.status === STATE.MATCHED) {
                    this._notifyUI('Connection lost.', 'error');
                    if (this.onOpponentLeft) this.onOpponentLeft();
                }
                this.status = STATE.IDLE;
                this._ws = null;
            };

            ws.onerror = () => {
                this._notifyUI('WebSocket error — server may be offline.', 'error');
            };
        },

        disconnect() {
            if (this._ws) {
                try { this._send({ type: 'leave' }); } catch (_) {}
                this._ws.close();
                this._ws = null;
            }
            this.status   = STATE.IDLE;
            this.opponent = null;
        },

        // ── Called every game frame with this player's current state ──────────
        sendState(player, cp, done, time) {
            if (this.status !== STATE.MATCHED) return;
            this._send({
                type:   'state',
                x:      player.x,
                y:      player.y,
                vx:     player.Speed ? player.Speed.X : 0,
                vy:     player.Speed ? player.Speed.Y : 0,
                state:  player.state || '',
                dashes: player.Dashes || 0,
                cp,
                done:   !!done,
                time:   time || null,
            });
        },

        isConnected() { return this.status === STATE.MATCHED; },
        isWaiting()   { return this.status === STATE.WAITING;  },

        // ── Internal ──────────────────────────────────────────────────────────
        _send(obj) {
            if (this._ws && this._ws.readyState === WebSocket.OPEN)
                this._ws.send(JSON.stringify(obj));
        },

        _handle(msg) {
            if (msg.type === 'waiting') {
                this.status = STATE.WAITING;
                this._notifyUI('Waiting for opponent…', 'waiting');

            } else if (msg.type === 'matched') {
                this.status       = STATE.MATCHED;
                this.seed         = msg.seed;
                this.opponentName = msg.opponentName || 'Opponent';
                this._notifyUI(`Matched vs ${this.opponentName}!`, 'matched');
                if (this.onMatched) this.onMatched(this.seed, this.opponentName);

            } else if (msg.type === 'opponent') {
                // Smooth: just store latest — game.js reads it each render frame
                this.opponent = {
                    x:      msg.x,
                    y:      msg.y,
                    vx:     msg.vx,
                    vy:     msg.vy,
                    state:  msg.state,
                    dashes: msg.dashes,
                    cp:     msg.cp     != null ? msg.cp   : 0,
                    done:   !!msg.done,
                    time:   msg.time   != null ? msg.time : null,
                };

            } else if (msg.type === 'opponentLeft') {
                this._notifyUI(`${this.opponentName} disconnected.`, 'error');
                if (this.onOpponentLeft) this.onOpponentLeft();
                this.status   = STATE.FINISHED;
                this.opponent = null;
            }
        },

        // Push a status string to the lobby UI element (if present)
        _notifyUI(text, cls) {
            const el = document.getElementById('online-status');
            if (!el) return;
            el.textContent  = text;
            el.className    = 'online-status-' + (cls || 'info');
        },
    };

    window.OnlineRace = OnlineRace;
})();
