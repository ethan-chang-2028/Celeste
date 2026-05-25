(function () {
    /* ─── constants ─────────────────────────────────────── */
    const SCALE = 3, GW = 320, GH = 180, SNAP = 4;
    const FLOOR_Y = 168, FLOOR_H = 12;

    const canvas = document.getElementById('ed-canvas');
    const ctx    = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    canvas.width  = GW * SCALE;
    canvas.height = GH * SCALE;

    /* ─── state ─────────────────────────────────────────── */
    let tool    = 'platform';
    let entType = 'crystal';
    let roomIdx = 0;
    let lv      = createEmpty();

    let sel = null, selKind = '';
    let drag = null, bladeA = null;
    let ghostPos = null;             // {lx,ly} entity hover preview
    let undoStack = [], redoStack = [];
    let mmInfo = null;               // minimap layout for click hit-testing

    const cr = () => lv.rooms[roomIdx];

    /* ─── level v2 format ───────────────────────────────── */
    // Rooms are objects: { col, row, name, sky, spawn, platforms[], entities[] }
    // All platform/entity coords are LOCAL (0..GW, 0..GH).
    // Game world = col*GW + localX, row*GH + localY.

    // mkRoom uses lv only when called after lv is initialized (edAddRoomDir, edNew, etc.)
    function mkRoom(col, row) {
        return {
            col, row,
            name: `ROOM ${lv.rooms.length + 1}`,
            sky:  ['#1a2a4a', '#3a5a8a'],
            spawn: { x: 14, y: FLOOR_Y - 13 },
            platforms: [
                { x: 0, y: FLOOR_Y, w: GW, h: FLOOR_H, color: '#3a5a3a' },
            ],
            entities: [],
        };
    }

    function createEmpty() {
        // Build without touching global lv to avoid TDZ crash on first init
        const room = {
            col: 0, row: 0, name: 'ROOM 1',
            sky: ['#1a2a4a', '#3a5a8a'],
            spawn: { x: 14, y: FLOOR_Y - 13 },
            platforms: [
                { x: 0,      y: FLOOR_Y, w: GW, h: FLOOR_H, color: '#3a5a3a' },
                { x: 0,      y: 0,       w: 8,  h: GH,      color: '#4a5570' },
                { x: GW - 8, y: 0,       w: 8,  h: GH,      color: '#4a5570' },
            ],
            entities: [],
        };
        return { rooms: [room], goal: null, startRoom: 0 };
    }

    function findRoom(col, row) {
        return lv.rooms.find(r => r.col === col && r.row === row);
    }

    /* ─── fit canvas to available space ────────────────── */
    function fitCanvas() {
        const center = canvas.parentElement;
        if (!center) return;
        const aw = center.clientWidth  - 8;
        const ah = center.clientHeight - 8;
        if (aw <= 0 || ah <= 0) { requestAnimationFrame(fitCanvas); return; }
        const s  = Math.min(1, aw / (GW * SCALE), ah / (GH * SCALE));
        const dw = GW * SCALE * s;
        const dh = GH * SCALE * s;
        canvas.style.transform = `scale(${s})`;
        canvas.style.left = Math.max(0, (aw - dw) / 2) + 'px';
        canvas.style.top  = Math.max(0, (ah - dh) / 2) + 'px';
    }
    window.addEventListener('resize', fitCanvas);

    /* ─── coordinate helpers ────────────────────────────── */
    const snap = v => Math.round(v / SNAP) * SNAP;

    function toLocal(ex, ey) {
        const rect = canvas.getBoundingClientRect();
        // Use rect dimensions so coords are correct regardless of CSS scale
        return {
            lx: snap((ex - rect.left) * GW / rect.width),
            ly: snap((ey - rect.top)  * GH / rect.height),
        };
    }

    // Convert mouse event → raw canvas pixel coords (0..GW*SCALE, 0..GH*SCALE)
    function toCanvasPx(ev) {
        const rect = canvas.getBoundingClientRect();
        return {
            cx: (ev.clientX - rect.left) * (GW * SCALE) / rect.width,
            cy: (ev.clientY - rect.top)  * (GH * SCALE) / rect.height,
        };
    }

    function entLX(e) { return e.type === 'blade_h' ? e.ax : e.type === 'blade_c' ? e.cx : (e.x || 0); }
    function entLY(e) { return e.type === 'blade_h' ? e.ay : e.type === 'blade_c' ? e.cy : (e.y || 0); }

    /* snap entity y to the nearest platform surface above the cursor */
    function snapEntityY(lx, ly) {
        let best = ly, bestD = 16;
        for (const pl of cr().platforms) {
            const d = Math.abs(ly - pl.y);
            if (d < bestD && lx >= pl.x - 4 && lx <= pl.x + pl.w + 4) {
                best = pl.y; bestD = d;
            }
        }
        return best;
    }

    /* ─── undo / redo ───────────────────────────────────── */
    function pushUndo() {
        undoStack.push(JSON.stringify(lv));
        if (undoStack.length > 60) undoStack.shift();
        redoStack = [];
    }
    window.edUndo = function () {
        if (!undoStack.length) return;
        redoStack.push(JSON.stringify(lv));
        lv = JSON.parse(undoStack.pop());
        clampRoomIdx(); sel = null; selKind = '';
        updateRoomLabel(); updateProps(); autoSave(); render();
        setStatus('Undo', 800);
    };
    window.edRedo = function () {
        if (!redoStack.length) return;
        undoStack.push(JSON.stringify(lv));
        lv = JSON.parse(redoStack.pop());
        clampRoomIdx(); sel = null; selKind = '';
        updateRoomLabel(); updateProps(); autoSave(); render();
        setStatus('Redo', 800);
    };
    function clampRoomIdx() {
        if (roomIdx >= lv.rooms.length) roomIdx = lv.rooms.length - 1;
        if (roomIdx < 0) roomIdx = 0;
    }

    /* ─── rendering ─────────────────────────────────────── */
    const ECOL = {
        spring: '#38c038', bumper: '#d8c820', crystal: '#28ccd8',
        spike: '#c02828', blade_h: '#d028d0', blade_c: '#d028d0',
        strawberry: '#d84070', crumble: '#b89050', falling: '#c05830', golden: '#d4af37',
    };

    function render() {
        ctx.clearRect(0, 0, GW * SCALE, GH * SCALE);
        const room = cr();

        // Sky
        const sky = room.sky || ['#1a2a4a', '#3a5a8a'];
        const g = ctx.createLinearGradient(0, 0, 0, GH * SCALE);
        g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
        ctx.fillStyle = g; ctx.fillRect(0, 0, GW * SCALE, GH * SCALE);

        // Grid
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= GW; x += 8) {
            ctx.strokeStyle = x % 16 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)';
            ctx.beginPath(); ctx.moveTo(x * SCALE, 0); ctx.lineTo(x * SCALE, GH * SCALE); ctx.stroke();
        }
        for (let y = 0; y <= GH; y += 8) {
            ctx.strokeStyle = y % 16 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)';
            ctx.beginPath(); ctx.moveTo(0, y * SCALE); ctx.lineTo(GW * SCALE, y * SCALE); ctx.stroke();
        }

        // Platforms
        for (const pl of room.platforms) {
            ctx.fillStyle = pl === sel ? '#ffff66' : (pl.color || '#5a7a5a');
            ctx.fillRect(pl.x * SCALE, pl.y * SCALE, pl.w * SCALE, pl.h * SCALE);
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.fillRect(pl.x * SCALE, pl.y * SCALE, pl.w * SCALE, SCALE);
            if (pl === sel) {
                ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 2;
                ctx.strokeRect(pl.x * SCALE + 1, pl.y * SCALE + 1, pl.w * SCALE - 2, pl.h * SCALE - 2);
                [[pl.x, pl.y], [pl.x + pl.w, pl.y], [pl.x, pl.y + pl.h], [pl.x + pl.w, pl.y + pl.h]]
                    .forEach(([gx, gy]) => {
                        ctx.fillStyle = '#fff';
                        ctx.fillRect(gx * SCALE - 4, gy * SCALE - 4, 8, 8);
                    });
            }
        }

        // Entities
        for (const ent of room.entities) drawEnt(ent, ent === sel);

        // Goal
        if (lv.goal && lv.goal.col === room.col && lv.goal.row === room.row) {
            const gl = lv.goal;
            ctx.fillStyle = sel === lv.goal ? '#ffff66' : '#d4af37';
            ctx.fillRect(gl.x * SCALE, gl.y * SCALE, gl.w * SCALE, gl.h * SCALE);
            ctx.fillStyle = '#fff'; ctx.font = `${SCALE * 3}px monospace`;
            ctx.fillText('⚑', gl.x * SCALE + 1, gl.y * SCALE + SCALE * 3.5);
            if (sel === lv.goal) {
                ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2;
                ctx.strokeRect(gl.x * SCALE + 1, gl.y * SCALE + 1, gl.w * SCALE - 2, gl.h * SCALE - 2);
            }
        }

        // Spawn indicator
        const sp = room.spawn;
        if (sp) {
            ctx.fillStyle = 'rgba(100,180,255,0.55)';
            ctx.beginPath(); ctx.arc(sp.x * SCALE, sp.y * SCALE + 5, 6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#9df'; ctx.font = '9px monospace';
            ctx.fillText('SP', sp.x * SCALE - 8, sp.y * SCALE - 2);
        }

        // Ghost entity preview (hover)
        if (ghostPos && tool === 'entity' && entType !== 'blade_h') {
            ctx.globalAlpha = 0.4;
            drawEnt(makeEnt(entType, ghostPos.lx, ghostPos.ly), false);
            ctx.globalAlpha = 1;
        }

        // Platform draw preview
        if (drag && drag.mode === 'draw') {
            const dx = Math.min(drag.x0, drag.x1), dy = Math.min(drag.y0, drag.y1);
            const dw = Math.abs(drag.x1 - drag.x0), dh = Math.abs(drag.y1 - drag.y0);
            ctx.fillStyle = 'rgba(90,200,90,0.25)';
            ctx.fillRect(dx * SCALE, dy * SCALE, dw * SCALE, dh * SCALE);
            ctx.strokeStyle = '#5aca5a'; ctx.lineWidth = 1.5;
            ctx.strokeRect(dx * SCALE, dy * SCALE, dw * SCALE, dh * SCALE);
            ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '9px monospace';
            ctx.fillText(`${Math.round(dw)}×${Math.round(dh)}`, dx * SCALE + 4, dy * SCALE - 4);
        }

        // Blade-A pending indicator
        if (bladeA) {
            ctx.fillStyle = '#d028d0';
            ctx.fillRect(bladeA.lx * SCALE - 5, bladeA.ly * SCALE - 5, 10, 10);
        }

        // Neighbour door arrows
        drawNeighborArrows(room);

        // Room border
        ctx.strokeStyle = 'rgba(255,200,50,0.45)'; ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, GW * SCALE - 2, GH * SCALE - 2);

        // Minimap
        drawMinimap();
    }

    function drawNeighborArrows(room) {
        const dirs = [
            { dc: 0,  dr: -1, x: GW/2*SCALE,       y: 14,              ax: 'center', label: '▲ UP' },
            { dc: 0,  dr:  1, x: GW/2*SCALE,       y: GH*SCALE - 5,    ax: 'center', label: '▼ DOWN' },
            { dc: -1, dr:  0, x: 8,                 y: GH/2*SCALE,      ax: 'left',   label: '◀ LEFT' },
            { dc:  1, dr:  0, x: GW*SCALE - 8,     y: GH/2*SCALE,      ax: 'right',  label: 'RIGHT ▶' },
        ];
        for (const d of dirs) {
            const neighbor = findRoom(room.col + d.dc, room.row + d.dr);
            ctx.textAlign = d.ax;
            if (neighbor) {
                // Green label with neighbour's name
                ctx.fillStyle = 'rgba(60,200,60,0.85)';
                ctx.font = `bold ${SCALE * 3}px monospace`;
                ctx.fillText(d.label, d.x, d.y);
                ctx.font = `${SCALE * 2.2}px monospace`;
                ctx.fillStyle = 'rgba(60,200,60,0.6)';
                ctx.fillText(neighbor.name, d.x, d.y + SCALE * 3.5);
            } else {
                // Dim "add" hint
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.font = `${SCALE * 2.5}px monospace`;
                ctx.fillText(d.label, d.x, d.y);
            }
        }
        ctx.textAlign = 'left';
    }

    function drawMinimap() {
        // Always show minimap (even 1 room so user sees where they are)
        const CW = 52, CH = 30, GAP = 3, PAD = 6, TITLE = 14;
        const cols = lv.rooms.map(r => r.col);
        const rows = lv.rooms.map(r => r.row);
        const minC = Math.min(...cols), maxC = Math.max(...cols);
        const minR = Math.min(...rows), maxR = Math.max(...rows);
        // Expand grid by 1 in each direction so user can see where to add rooms
        const gMinC = minC - 1, gMaxC = maxC + 1;
        const gMinR = minR - 1, gMaxR = maxR + 1;
        const gCols = gMaxC - gMinC + 1, gRows = gMaxR - gMinR + 1;
        const W = gCols * (CW + GAP) - GAP + PAD * 2;
        const H = gRows * (CH + GAP) - GAP + PAD * 2 + TITLE;
        const ox = GW * SCALE - W - 6;
        const oy = 6;

        // Panel bg
        ctx.fillStyle = 'rgba(4,5,16,0.92)';
        ctx.fillRect(ox, oy, W, H);
        ctx.strokeStyle = '#2a3050'; ctx.lineWidth = 1;
        ctx.strokeRect(ox + 0.5, oy + 0.5, W - 1, H - 1);

        // Title
        ctx.fillStyle = '#7aa2ff'; ctx.font = `bold 8px monospace`;
        ctx.fillText('MAP  (click to go · + to add room)', ox + PAD, oy + 10);

        mmInfo = { ox, oy: oy + TITLE, gMinC, gMinR, CW, CH, GAP, PAD };

        for (let r = gMinR; r <= gMaxR; r++) {
            for (let c = gMinC; c <= gMaxC; c++) {
                const cellX = ox + PAD + (c - gMinC) * (CW + GAP);
                const cellY = oy + TITLE + PAD + (r - gMinR) * (CH + GAP);
                const existing = findRoom(c, r);
                const isCur = existing && existing === cr();

                if (existing) {
                    // Filled room cell
                    ctx.fillStyle = isCur ? '#2a2000' : '#0f1a28';
                    ctx.fillRect(cellX, cellY, CW, CH);
                    ctx.strokeStyle = isCur ? '#e8c87a' : '#2a4a6a';
                    ctx.lineWidth = isCur ? 2 : 1;
                    ctx.strokeRect(cellX + 0.5, cellY + 0.5, CW - 1, CH - 1);
                    // Coords
                    ctx.fillStyle = isCur ? '#e8c87a' : '#5a8aaa';
                    ctx.font = '7px monospace';
                    ctx.fillText(`[${c},${r}]`, cellX + 3, cellY + 9);
                    // Name
                    ctx.fillStyle = isCur ? '#fff' : '#8a9aaa';
                    ctx.font = '6px monospace';
                    const label = (existing.name || '').substring(0, 7);
                    ctx.fillText(label, cellX + 3, cellY + 20);
                    if (isCur) {
                        ctx.fillStyle = '#e8c87a';
                        ctx.font = 'bold 6px monospace';
                        ctx.fillText('◉ HERE', cellX + 3, cellY + 28);
                    }
                } else {
                    // Check if adjacent to any real room — show as addable
                    const adjExists = findRoom(c-1,r) || findRoom(c+1,r) || findRoom(c,r-1) || findRoom(c,r+1);
                    if (adjExists) {
                        ctx.fillStyle = 'rgba(20,50,20,0.5)';
                        ctx.fillRect(cellX, cellY, CW, CH);
                        ctx.strokeStyle = 'rgba(50,120,50,0.4)'; ctx.lineWidth = 1;
                        ctx.setLineDash([3, 2]);
                        ctx.strokeRect(cellX + 0.5, cellY + 0.5, CW - 1, CH - 1);
                        ctx.setLineDash([]);
                        ctx.fillStyle = 'rgba(80,200,80,0.5)';
                        ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
                        ctx.fillText('+', cellX + CW/2, cellY + CH/2 + 5);
                        ctx.textAlign = 'left';
                        ctx.fillStyle = 'rgba(80,160,80,0.5)';
                        ctx.font = '6px monospace';
                        ctx.fillText(`[${c},${r}]`, cellX + 3, cellY + CH - 4);
                    }
                }
            }
        }
    }

    function drawEnt(ent, selected) {
        const col = ECOL[ent.type] || '#aaa';
        ctx.fillStyle = selected ? '#ffff66' : col;
        const S = SCALE;

        if (ent.type === 'blade_h') {
            const ax = ent.ax * S, ay = ent.ay * S, bx = ent.bx * S, by = ent.by * S;
            ctx.setLineDash([4, 3]); ctx.strokeStyle = selected ? '#ff0' : col; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillRect(ax - 5, ay - 5, 10, 10); ctx.fillRect(bx - 5, by - 5, 10, 10);
        } else if (ent.type === 'blade_c') {
            const cx = ent.cx * S, cy = ent.cy * S, r = ent.radius * S;
            ctx.setLineDash([3, 2]); ctx.strokeStyle = selected ? '#ff0' : col; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
        } else if (ent.type === 'bumper') {
            ctx.beginPath(); ctx.arc(ent.x * S, ent.y * S, 12 * S / 3, 0, Math.PI * 2); ctx.fill();
        } else if (ent.type === 'spring') {
            ctx.fillRect(ent.x * S - 8 * S / 3, ent.y * S - 6 * S / 3, 16 * S / 3, 6 * S / 3);
        } else if (ent.type === 'crumble' || ent.type === 'falling') {
            ctx.fillRect(ent.x * S, ent.y * S, ent.w * S, 8 * S / 3);
        } else if (ent.type === 'spike') {
            const ex = ent.x * S, ey = ent.y * S, sz = (ent.size || 8) * S;
            ctx.beginPath();
            if (ent.dir === 'up')        { ctx.moveTo(ex, ey); ctx.lineTo(ex + sz * .5, ey - 4 * S / 3); ctx.lineTo(ex + sz, ey); }
            else if (ent.dir === 'down') { ctx.moveTo(ex, ey); ctx.lineTo(ex + sz * .5, ey + 4 * S / 3); ctx.lineTo(ex + sz, ey); }
            else                          { ctx.moveTo(ex, ey); ctx.lineTo(ex + 4 * S / 3, ey + sz * .5); ctx.lineTo(ex, ey + sz); }
            ctx.fill();
        } else {
            ctx.beginPath(); ctx.arc(ent.x * S, ent.y * S, 6 * S / 3, 0, Math.PI * 2); ctx.fill();
        }

        ctx.fillStyle = selected ? '#ff0' : 'rgba(255,255,255,0.6)';
        ctx.font = `${SCALE * 2.2}px monospace`;
        ctx.fillText(ent.type, entLX(ent) * S + 8, entLY(ent) * S - 5);
    }

    /* ─── hit testing ───────────────────────────────────── */
    function hitTest(lx, ly) {
        const room = cr();
        if (lv.goal && lv.goal.col === room.col && lv.goal.row === room.row) {
            const gl = lv.goal;
            if (lx >= gl.x - 4 && lx <= gl.x + gl.w + 4 && ly >= gl.y - 4 && ly <= gl.y + gl.h + 4)
                return { item: lv.goal, kind: 'goal' };
        }
        for (let i = room.entities.length - 1; i >= 0; i--) {
            const e = room.entities[i];
            if (hitEnt(e, lx, ly)) return { item: e, kind: 'entity' };
        }
        let best = null, bestA = Infinity;
        for (const pl of room.platforms) {
            if (lx >= pl.x - 2 && lx <= pl.x + pl.w + 2 && ly >= pl.y - 2 && ly <= pl.y + pl.h + 2) {
                const a = pl.w * pl.h;
                if (a < bestA) { best = pl; bestA = a; }
            }
        }
        return best ? { item: best, kind: 'platform' } : null;
    }

    function hitEnt(e, lx, ly) {
        const R = 8;
        if (e.type === 'blade_h') return ptSegDist(lx, ly, e.ax, e.ay, e.bx, e.by) < R;
        if (e.type === 'blade_c') return Math.hypot(lx - e.cx, ly - e.cy) < R + 4;
        if (e.type === 'crumble' || e.type === 'falling')
            return lx >= e.x - 2 && lx <= e.x + e.w + 2 && ly >= e.y - 2 && ly <= e.y + 9;
        return Math.hypot(lx - entLX(e), ly - entLY(e)) < R + 4;
    }

    function ptSegDist(px, py, ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        if (!l2) return Math.hypot(px - ax, py - ay);
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
        return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }

    /* ─── mouse events ──────────────────────────────────── */
    canvas.addEventListener('mousedown', ev => {
        if (ev.button !== 0) return;

        // ── Minimap click: navigate or add room ──────────────
        if (mmInfo) {
            const { cx, cy } = toCanvasPx(ev);
            const { ox, oy, gMinC, gMinR, CW, CH, GAP, PAD } = mmInfo;
            const relX = cx - ox - PAD, relY = cy - oy - PAD;
            if (relX >= 0 && relY >= 0) {
                const col = gMinC + Math.floor(relX / (CW + GAP));
                const row = gMinR + Math.floor(relY / (CH + GAP));
                // Only act if click is inside a cell (not in the gap)
                const cellOffX = relX % (CW + GAP), cellOffY = relY % (CH + GAP);
                if (cellOffX <= CW && cellOffY <= CH) {
                    const existing = findRoom(col, row);
                    if (existing) {
                        roomIdx = lv.rooms.indexOf(existing);
                        sel = null; selKind = '';
                        updateRoomLabel(); updateProps(); render();
                        return;
                    }
                    const adjExists = findRoom(col-1,row) || findRoom(col+1,row) || findRoom(col,row-1) || findRoom(col,row+1);
                    if (adjExists) {
                        pushUndo();
                        const r = mkRoom(col, row);
                        // Add walls for vertical-only connections
                        const hasH = findRoom(col-1,row) || findRoom(col+1,row);
                        if (!hasH) {
                            r.platforms.push({ x: 0,      y: 0, w: 8, h: GH, color: '#4a5570' });
                            r.platforms.push({ x: GW - 8, y: 0, w: 8, h: GH, color: '#4a5570' });
                        }
                        lv.rooms.push(r);
                        roomIdx = lv.rooms.length - 1;
                        sel = null; selKind = '';
                        updateRoomLabel(); updateProps(); autoSave(); render();
                        return;
                    }
                }
            }
        }

        const { lx, ly } = toLocal(ev.clientX, ev.clientY);

        if (tool === 'select' || (tool === 'platform' && ev.altKey)) {
            const hit = hitTest(lx, ly);
            if (hit) {
                sel = hit.item; selKind = hit.kind;
                if (hit.kind === 'platform')
                    drag = { mode: 'move', dx: lx - hit.item.x, dy: ly - hit.item.y };
                else if (hit.kind === 'entity')
                    drag = { mode: 'move_ent', dx: lx - entLX(hit.item), dy: ly - entLY(hit.item) };
                else if (hit.kind === 'goal')
                    drag = { mode: 'move_goal', dx: lx - hit.item.x, dy: ly - hit.item.y };
            } else { sel = null; selKind = ''; drag = null; }
            updateProps(); render();

        } else if (tool === 'platform') {
            sel = null; selKind = '';
            drag = { mode: 'draw', x0: lx, y0: ly, x1: lx, y1: ly };
            updateProps(); render();

        } else if (tool === 'entity') {
            if (entType === 'blade_h') {
                if (!bladeA) {
                    bladeA = { lx, ly };
                } else {
                    pushUndo();
                    const e = { type: 'blade_h', ax: bladeA.lx, ay: bladeA.ly, bx: lx, by: ly, speed: 60 };
                    cr().entities.push(e); sel = e; selKind = 'entity'; bladeA = null;
                    updateProps(); autoSave();
                }
            } else {
                pushUndo();
                const sy = (entType === 'blade_c') ? ly : snapEntityY(lx, ly);
                const e = makeEnt(entType, lx, sy);
                cr().entities.push(e); sel = e; selKind = 'entity';
                updateProps(); autoSave();
            }
            render();

        } else if (tool === 'erase') {
            const hit = hitTest(lx, ly);
            if (hit) {
                pushUndo();
                if (hit.kind === 'platform') cr().platforms.splice(cr().platforms.indexOf(hit.item), 1);
                else if (hit.kind === 'entity') cr().entities.splice(cr().entities.indexOf(hit.item), 1);
                else if (hit.kind === 'goal') lv.goal = null;
                if (sel === hit.item) { sel = null; selKind = ''; }
                updateProps(); autoSave();
            }
            render();

        } else if (tool === 'goal') {
            pushUndo();
            lv.goal = { col: cr().col, row: cr().row, x: lx, y: ly, w: 12, h: 12, color: '#d4af37' };
            sel = lv.goal; selKind = 'goal';
            updateProps(); autoSave(); render();
        }
    });

    canvas.addEventListener('mousemove', ev => {
        const { lx, ly } = toLocal(ev.clientX, ev.clientY);
        const statusEl = document.getElementById('ed-cursor');
        if (statusEl) statusEl.textContent = `x=${lx}  y=${ly}  [${cr().col},${cr().row}]`;

        // Ghost preview for entity tool
        if (tool === 'entity' && entType !== 'blade_h') {
            const sy = (entType === 'blade_c') ? ly : snapEntityY(lx, ly);
            ghostPos = { lx, ly: sy };
        } else {
            ghostPos = null;
        }

        // Blade preview line while placing second point
        if (bladeA && tool === 'entity' && entType === 'blade_h') {
            render();
            ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(208,40,208,0.7)'; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(bladeA.lx * SCALE, bladeA.ly * SCALE);
            ctx.lineTo(lx * SCALE, ly * SCALE);
            ctx.stroke(); ctx.setLineDash([]);
            return;
        }

        if (!ev.buttons || !drag) { render(); return; }

        if (drag.mode === 'draw') {
            drag.x1 = lx; drag.y1 = ly;
        } else if (drag.mode === 'move' && sel) {
            sel.x = snap(lx - drag.dx); sel.y = snap(ly - drag.dy);
            updateProps();
        } else if (drag.mode === 'move_ent' && sel) {
            const nx = snap(lx - drag.dx), ny = snap(ly - drag.dy);
            if (sel.type === 'blade_h') {
                const ddx = nx - sel.ax, ddy = ny - sel.ay;
                sel.ax += ddx; sel.ay += ddy; sel.bx += ddx; sel.by += ddy;
            } else if (sel.type === 'blade_c') {
                sel.cx = nx; sel.cy = ny;
            } else {
                sel.x = nx; sel.y = ny;
            }
            updateProps();
        } else if (drag.mode === 'move_goal' && sel) {
            sel.x = snap(lx - drag.dx); sel.y = snap(ly - drag.dy);
            updateProps();
        }
        render();
    });

    canvas.addEventListener('mouseup', ev => {
        if (drag && drag.mode === 'draw') {
            const x = snap(Math.min(drag.x0, drag.x1));
            const y = snap(Math.min(drag.y0, drag.y1));
            const w = snap(Math.max(8, Math.abs(drag.x1 - drag.x0)));
            const h = snap(Math.max(4, Math.abs(drag.y1 - drag.y0)));
            if (w >= 8) {
                pushUndo();
                const pl = { x, y, w, h, color: '#5a7a5a' };
                cr().platforms.push(pl); sel = pl; selKind = 'platform';
                updateProps(); autoSave();
            }
            drag = null; render();
        } else if (drag) {
            pushUndo();
            drag = null; autoSave(); render();
        }
    });

    // Right-click = instant delete (no tool change needed)
    canvas.addEventListener('contextmenu', ev => {
        ev.preventDefault();
        const { lx, ly } = toLocal(ev.clientX, ev.clientY);
        const hit = hitTest(lx, ly);
        if (hit) {
            pushUndo();
            if (hit.kind === 'platform') cr().platforms.splice(cr().platforms.indexOf(hit.item), 1);
            else if (hit.kind === 'entity') cr().entities.splice(cr().entities.indexOf(hit.item), 1);
            else if (hit.kind === 'goal') lv.goal = null;
            if (sel === hit.item) { sel = null; selKind = ''; }
            updateProps(); autoSave(); render();
        }
    });

    /* ─── entity factory ────────────────────────────────── */
    function makeEnt(type, lx, ly) {
        const m = {
            spring:     { type: 'spring',     x: lx, y: ly, orientation: 'floor' },
            bumper:     { type: 'bumper',     x: lx, y: ly },
            crystal:    { type: 'crystal',    x: lx, y: ly },
            spike_up:   { type: 'spike',      x: lx, y: ly, size: 8, dir: 'up' },
            spike_down: { type: 'spike',      x: lx, y: ly, size: 8, dir: 'down' },
            spike_left: { type: 'spike',      x: lx, y: ly, size: 8, dir: 'left' },
            spike_right:{ type: 'spike',      x: lx, y: ly, size: 8, dir: 'right' },
            blade_c:    { type: 'blade_c',    cx: lx, cy: ly, radius: 18, startAngle: 0, speed: 1.5 },
            strawberry: { type: 'strawberry', x: lx, y: ly },
            crumble:    { type: 'crumble',    x: lx, y: ly, w: 48 },
            falling:    { type: 'falling',    x: lx, y: ly, w: 48, h: 8 },
            golden:     { type: 'golden',     x: lx, y: ly },
        };
        return m[type] || { type: 'crystal', x: lx, y: ly };
    }

    /* ─── properties panel ──────────────────────────────── */
    function updateProps() {
        const panel = document.getElementById('ed-props');
        if (!panel) return;
        if (!sel) { panel.innerHTML = '<span class="dim">Nothing selected</span>'; return; }

        let html = '';
        if (selKind === 'platform') {
            html = numField('x', sel.x) + numField('y', sel.y) + numField('w', sel.w) + numField('h', sel.h)
                 + `<label>Color <input type="color" class="prop" data-k="color" value="${sel.color || '#5a7a5a'}"></label>`;
        } else if (selKind === 'entity') {
            html = `<div class="prop-type">${sel.type}</div>`;
            if (sel.type === 'blade_h')
                html += numField('ax', sel.ax) + numField('ay', sel.ay) + numField('bx', sel.bx) + numField('by', sel.by) + numField('speed', sel.speed || 60);
            else if (sel.type === 'blade_c')
                html += numField('cx', sel.cx) + numField('cy', sel.cy) + numField('radius', sel.radius || 18) + numField('speed', sel.speed || 1.5, '0.1');
            else if (sel.type === 'crumble' || sel.type === 'falling')
                html += numField('x', sel.x) + numField('y', sel.y) + numField('w', sel.w || 48);
            else if (sel.type === 'spike')
                html += numField('x', sel.x) + numField('y', sel.y) + numField('size', sel.size || 8)
                     + `<label>Dir <select class="prop" data-k="dir">`
                     + ['up','down','left','right'].map(d => `<option${sel.dir === d ? ' selected' : ''}>${d}</option>`).join('')
                     + `</select></label>`;
            else
                html += numField('x', sel.x) + numField('y', sel.y);
        } else if (selKind === 'goal') {
            html = `<div class="prop-type">GOAL</div>` + numField('x', sel.x) + numField('y', sel.y);
        }
        html += `<button class="del-btn" onclick="window.edDeleteSel()">🗑 Delete</button>`;
        panel.innerHTML = html;

        panel.querySelectorAll('.prop').forEach(inp => {
            inp.addEventListener('change', () => {
                const k = inp.dataset.k;
                sel[k] = inp.type === 'number' ? parseFloat(inp.value) : inp.value;
                autoSave(); render();
            });
        });
    }

    function numField(k, v, step) {
        return `<label>${k} <input type="number" class="prop" data-k="${k}" value="${v}" step="${step || 4}"></label>`;
    }

    window.edDeleteSel = function () {
        if (!sel) return;
        pushUndo();
        if (selKind === 'platform') cr().platforms.splice(cr().platforms.indexOf(sel), 1);
        else if (selKind === 'entity') cr().entities.splice(cr().entities.indexOf(sel), 1);
        else if (selKind === 'goal') lv.goal = null;
        sel = null; selKind = ''; updateProps(); autoSave(); render();
    };

    /* ─── keyboard ──────────────────────────────────────── */
    document.addEventListener('keydown', ev => {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(ev.target.tagName)) return;
        if (ev.key === 'Delete' || ev.key === 'Backspace') { window.edDeleteSel(); return; }
        if (ev.key === 'Escape') { sel = null; selKind = ''; bladeA = null; ghostPos = null; updateProps(); render(); return; }
        if (ev.ctrlKey || ev.metaKey) {
            if (ev.key === 'z') { window.edUndo(); ev.preventDefault(); return; }
            if (ev.key === 'y') { window.edRedo(); ev.preventDefault(); return; }
        }
        const keys = { s: 'select', p: 'platform', e: 'entity', x: 'erase', g: 'goal' };
        if (keys[ev.key.toLowerCase()]) window.edSetTool(keys[ev.key.toLowerCase()]);
        if (ev.key === 'ArrowLeft')  { window.edNavRoom(-1,  0); ev.preventDefault(); }
        if (ev.key === 'ArrowRight') { window.edNavRoom( 1,  0); ev.preventDefault(); }
        if (ev.key === 'ArrowUp')    { window.edNavRoom( 0, -1); ev.preventDefault(); }
        if (ev.key === 'ArrowDown')  { window.edNavRoom( 0,  1); ev.preventDefault(); }
    });

    /* ─── tool / entity switching ───────────────────────── */
    window.edSetTool = function (t) {
        tool = t; bladeA = null; ghostPos = null;
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
        canvas.style.cursor = t === 'erase' ? 'not-allowed' : t === 'platform' ? 'crosshair' : 'default';
        render();
    };

    window.edSetEnt = function (t) {
        entType = t; bladeA = null;
        document.querySelectorAll('.ent-btn').forEach(b => b.classList.toggle('active', b.dataset.ent === t));
    };

    /* ─── room management ───────────────────────────────── */
    window.edNavRoom = function (dc, dr) {
        const next = findRoom(cr().col + dc, cr().row + dr);
        if (next) {
            roomIdx = lv.rooms.indexOf(next);
            sel = null; selKind = '';
            updateRoomLabel(); updateProps(); render();
        }
    };

    window.edAddRoomDir = function (dc, dr) {
        const nc = cr().col + dc, nr = cr().row + dr;
        if (findRoom(nc, nr)) { setStatus('Room already exists there', 2000); return; }
        pushUndo();
        const r = mkRoom(nc, nr);
        if (dc === 0) {
            // vertical room: add left/right walls
            r.platforms.push({ x: 0,      y: 0, w: 8,  h: GH, color: '#4a5570' });
            r.platforms.push({ x: GW - 8, y: 0, w: 8,  h: GH, color: '#4a5570' });
        }
        lv.rooms.push(r);
        roomIdx = lv.rooms.length - 1;
        sel = null; selKind = '';
        updateRoomLabel(); updateProps(); autoSave(); render();
    };

    window.edRemoveRoom = function () {
        if (lv.rooms.length <= 1) return;
        if (!confirm('Remove current room?')) return;
        pushUndo();
        lv.rooms.splice(roomIdx, 1);
        clampRoomIdx();
        sel = null; selKind = '';
        updateRoomLabel(); updateProps(); autoSave(); render();
    };

    function updateRoomLabel() {
        const room = cr();
        const el = document.getElementById('ed-room-label');
        if (el) el.textContent = `[${room.col},${room.row}]  ${lv.rooms.length} rooms`;
    }

    /* ─── v1 → v2 migration ─────────────────────────────── */
    function migrateV1(old) {
        if (old.rooms) return old; // already v2
        const n = old.numRooms || (old.spawns ? old.spawns.length : 1);
        const rooms = [];
        for (let i = 0; i < n; i++) {
            const ox = i * GW;
            const r = {
                col: i, row: 0,
                name: (old.names && old.names[i]) || `ROOM ${i + 1}`,
                sky:  (old.skies && old.skies[i]) || ['#1a2a4a', '#3a5a8a'],
                spawn: (old.spawns && old.spawns[i])
                    ? { x: old.spawns[i].x - ox, y: old.spawns[i].y }
                    : { x: 14, y: FLOOR_Y - 13 },
                platforms: (old.platforms || [])
                    .filter(p => p.x < ox + GW * 1.5 && p.x + p.w > ox - GW * .5)
                    .map(p => ({ ...p, x: p.x - ox })),
                entities: (old.entities || [])
                    .filter(e => {
                        const ex = e.type==='blade_h' ? e.ax : e.type==='blade_c' ? e.cx : (e.x||0);
                        return ex >= ox - GW * .5 && ex < ox + GW * 1.5;
                    })
                    .map(e => {
                        const ne = { ...e };
                        if (ne.type==='blade_h') { ne.ax -= ox; ne.bx -= ox; }
                        else if (ne.type==='blade_c') ne.cx -= ox;
                        else if (ne.x !== undefined) ne.x -= ox;
                        return ne;
                    }),
            };
            rooms.push(r);
        }
        const goal = old.goal ? {
            col: Math.floor((old.goal.x || 0) / GW), row: 0,
            x: (old.goal.x || 0) - Math.floor((old.goal.x || 0) / GW) * GW,
            y: old.goal.y || 0, w: old.goal.w || 12, h: old.goal.h || 12, color: old.goal.color || '#d4af37',
        } : null;
        return { rooms, goal, startRoom: 0 };
    }

    /* ─── save / load / play ────────────────────────────── */
    function autoSave() {
        try { localStorage.setItem('celeste_custom_level', JSON.stringify(lv)); } catch (e) {}
    }

    function setStatus(msg, ms) {
        const el = document.getElementById('ed-status');
        if (el) { el.textContent = msg; if (ms) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, ms); }
    }

    window.edNew = function () {
        if (!confirm('New blank level? Current work will be lost.')) return;
        lv = createEmpty(); roomIdx = 0; sel = null; selKind = '';
        undoStack = []; redoStack = [];
        updateRoomLabel(); updateProps(); render();
    };
    window.edSave = function () { autoSave(); setStatus('Saved ✓', 2000); };
    window.edExport = function () {
        const blob = new Blob([JSON.stringify(lv, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'celeste_level.json'; a.click();
    };
    window.edImport = function () { document.getElementById('ed-file-input').click(); };
    window.edPlay   = function () { autoSave(); window.location.href = '/game.html?mode=custom'; };

    document.addEventListener('DOMContentLoaded', () => {
        const fi = document.getElementById('ed-file-input');
        if (fi) fi.addEventListener('change', ev => {
            const file = ev.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = e2 => {
                try {
                    lv = migrateV1(JSON.parse(e2.target.result));
                    if (!lv.rooms || !lv.rooms.length) lv = createEmpty();
                    roomIdx = 0; sel = null; selKind = '';
                    undoStack = []; redoStack = [];
                    updateRoomLabel(); updateProps(); autoSave(); render();
                    setStatus('Imported ✓', 2000);
                } catch (err) { alert('Invalid JSON: ' + err.message); }
            };
            reader.readAsText(file); ev.target.value = '';
        });
    });

    /* ─── boot ──────────────────────────────────────────── */
    (function boot() {
        const stored = localStorage.getItem('celeste_custom_level');
        if (stored) {
            try {
                lv = migrateV1(JSON.parse(stored));
                if (!lv.rooms || !lv.rooms.length) lv = createEmpty();
            } catch (e) { lv = createEmpty(); }
        }
        window.edSetTool('platform');
        window.edSetEnt('crystal');
        updateRoomLabel();
        updateProps();
        render();
        requestAnimationFrame(fitCanvas);
    })();
})();
