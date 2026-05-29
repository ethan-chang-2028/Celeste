/**
 * online-race.js
 *
 * WebSocket client for online 1v1 races.
 * Exposes window.OnlineRace — called by game.js.
 *
 * Protocol (messages are plain JSON):
 *
 *   Host flow:
 *     create  -> server creates a named room, responds with { type:'created', code }
 *     matched <- server sends shared seed + opponent name when guest joins
 *
 *   Guest flow:
 *     join (with code) -> server matches to named room
 *     join (no code)   -> random matchmaking queue
 *
 *   In-race:
 *     state   -> sent every frame with this player's position
 *     opponent<- server relays the other player's state
 *     opponentLeft <- server tells us the other player disconnected
 */

(function () {
    'use strict';

    const WS_URL = (() => {
        const loc = window.location;
        const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
        return proto + '//' + loc.host;
    })();

    const STATE = {
        IDLE:     'idle',
        WAITING:  'waiting',
        MATCHED:  'matched',
        FINISHED: 'finished',
    };

    const OnlineRace = {
        // ── Public state ──────────────────────────────────────────────────────
        status:       STATE.IDLE,
        seed:         null,
        opponentName: '',
        myName:       '',
        roomCode:     null,  // set when host creates a room

        // Last received opponent snapshot
        opponent: null,  // { x, y, vx, vy, state, dashes, cp, done, time }

        // Callbacks set by game.js
        onMatched:      null,  // (seed, opponentName) -> void
        onOpponentLeft: null,  // () -> void
        onRoomCreated:  null,  // (code) -> void  — called when host room is ready
        onError:        null,  // (message) -> void

        // ── Create a named room (host) ────────────────────────────────────────
        create(playerName) {
            this._connect(playerName, () => {
                this._send({ type: 'create', name: this.myName });
                this.status = STATE.WAITING;
                this._notifyUI('Creating room…', 'waiting');
            });
        },

        // ── Join by room code or random queue (guest / random) ────────────────
        join(playerName, roomCode) {
            this._connect(playerName, () => {
                if (roomCode) {
                    this._send({ type: 'join', name: this.myName, code: roomCode.toUpperCase().trim() });
                    this._notifyUI('Joining room ' + roomCode.toUpperCase() + '…', 'waiting');
                } else {
                    this._send({ type: 'join', name: this.myName });
                    this._notifyUI('Searching for opponent…', 'waiting');
                }
                this.status = STATE.WAITING;
            });
        },

        disconnect() {
            if (this._ws) {
                try { this._send({ type: 'leave' }); } catch (_) {}
                this._ws.close();
                this._ws = null;
            }
            this.status   = STATE.IDLE;
            this.opponent = null;
            this.roomCode = null;
        },

        // ── Called every game frame ───────────────────────────────────────────
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

        isConnected() { return this.status === STATE.MATCHED;  },
        isWaiting()   { return this.status === STATE.WAITING;  },

        // ── Internal ──────────────────────────────────────────────────────────
        _ws: null,

        _connect(playerName, onOpen) {
            if (this._ws) this.disconnect();
            this.myName   = (playerName || 'Player').trim() || 'Player';
            this.status   = STATE.IDLE;
            this.opponent = null;
            this.roomCode = null;

            try {
                this._ws = new WebSocket(WS_URL);
            } catch (e) {
                console.warn('[OnlineRace] WebSocket connect failed:', e);
                this._notifyUI('Connection failed — is the server running?', 'error');
                return;
            }

            const ws = this._ws;

            ws.onopen = () => { if (this._ws === ws) onOpen(); };

            ws.onmessage = (ev) => {
                if (this._ws !== ws) return;  // ignore messages from a replaced socket
                let msg;
                try { msg = JSON.parse(ev.data); } catch { return; }
                this._handle(msg);
            };

            ws.onclose = () => {
                // Ignore the close of an old socket we already replaced — otherwise
                // a quick reconnect (Create → Join, retries) would tear the new
                // connection down and the race would never start.
                if (this._ws !== ws) return;
                if (this.status === STATE.MATCHED) {
                    this._notifyUI('Connection lost.', 'error');
                    if (this.onOpponentLeft) this.onOpponentLeft();
                }
                this.status = STATE.IDLE;
                this._ws = null;
            };

            ws.onerror = () => {
                if (this._ws !== ws) return;
                this._notifyUI(`Cannot connect — run: node server.js  (tried ${WS_URL})`, 'error');
            };
        },

        _send(obj) {
            if (this._ws && this._ws.readyState === WebSocket.OPEN)
                this._ws.send(JSON.stringify(obj));
        },

        _handle(msg) {
            if (msg.type === 'created') {
                this.roomCode = msg.code;
                this._notifyUI('Room ready! Code: ' + msg.code, 'waiting');
                if (this.onRoomCreated) this.onRoomCreated(msg.code);

            } else if (msg.type === 'waiting') {
                this.status = STATE.WAITING;
                this._notifyUI('Waiting for opponent…', 'waiting');

            } else if (msg.type === 'matched') {
                this.status       = STATE.MATCHED;
                this.seed         = msg.seed;
                this.opponentName = msg.opponentName || 'Opponent';
                this._notifyUI('Matched vs ' + this.opponentName + '!', 'matched');
                if (this.onMatched) this.onMatched(this.seed, this.opponentName);

            } else if (msg.type === 'opponent') {
                this.opponent = {
                    x:      msg.x,
                    y:      msg.y,
                    vx:     msg.vx,
                    vy:     msg.vy,
                    state:  msg.state,
                    dashes: msg.dashes,
                    cp:     msg.cp  != null ? msg.cp  : 0,
                    done:   !!msg.done,
                    time:   msg.time != null ? msg.time : null,
                };

            } else if (msg.type === 'opponentLeft') {
                this._notifyUI(this.opponentName + ' disconnected.', 'error');
                if (this.onOpponentLeft) this.onOpponentLeft();
                this.status   = STATE.FINISHED;
                this.opponent = null;

            } else if (msg.type === 'error') {
                this._notifyUI(msg.message || 'Error.', 'error');
                if (this.onError) this.onError(msg.message);
            }
        },

        _notifyUI(text, cls) {
            const el = document.getElementById('online-status');
            if (!el) return;
            el.textContent = text;
            el.className   = 'online-status-' + (cls || 'info');
        },
    };

    window.OnlineRace = OnlineRace;
})();
