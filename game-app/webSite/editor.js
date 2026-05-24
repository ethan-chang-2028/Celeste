(function () {
    const SCALE  = 3;
    const GW = 320, GH = 180;
    const SNAP   = 4;
    const FLOOR_Y = 168, FLOOR_H = 12;

    const canvas = document.getElementById('ed-canvas');
    const ctx    = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    canvas.width  = GW * SCALE;
    canvas.height = GH * SCALE;

    // ── State ──────────────────────────────────────────────────────────────
    let tool    = 'platform';
    let entType = 'crystal';
    let room    = 0;
    let lv      = createEmpty(3);

    let sel = null, selKind = '';   // selected item + type
    let drag = null;                // active drag operation
    let bladeA = null;              // pending first click for blade_h

    // ── Level skeleton ─────────────────────────────────────────────────────
    function createEmpty(n) {
        const o = { numRooms: n, platforms: [], entities: [], spawns: [], goal: null,
                    names: [], skies: [] };
        for (let i = 0; i < n; i++) {
            const ox = i * GW;
            if (i === 0)   o.platforms.push({ x: ox,          y: 0,      w: 8,  h: GH,      color: '#4a5570' });
            if (i === n-1) o.platforms.push({ x: ox + GW - 8, y: 0,      w: 8,  h: GH,      color: '#4a5570' });
            o.platforms.push(                { x: ox,          y: FLOOR_Y, w: GW, h: FLOOR_H, color: '#3a5a3a' });
            o.spawns.push({ x: ox + 14, y: FLOOR_Y - 13 });
            o.names.push(`ROOM ${i + 1}`);
            o.skies.push(['#1a2a4a', '#3a5a8a']);
        }
        return o;
    }

    // ── Coordinate helpers ──────────────────────────────────────────────────
    const snap  = v => Math.round(v / SNAP) * SNAP;
    function toGame(ex, ey) {
        const r  = canvas.getBoundingClientRect();
        return { gx: snap((ex - r.left) / SCALE) + room * GW,
                 gy: snap((ey - r.top)  / SCALE) };
    }
    function toScreen(gx, gy) {
        return { sx: (gx - room * GW) * SCALE, sy: gy * SCALE };
    }
    function entX(e) { return e.type === 'blade_h' ? e.ax : e.type === 'blade_c' ? e.cx : (e.x || 0); }
    function entY(e) { return e.type === 'blade_h' ? e.ay : e.type === 'blade_c' ? e.cy : (e.y || 0); }

    // ── Rendering ───────────────────────────────────────────────────────────
    const ECOL = { spring:'#38c038', bumper:'#d8c820', crystal:'#28ccd8',
                   spike:'#c02828', blade_h:'#d028d0', blade_c:'#d028d0',
                   strawberry:'#d84070', crumble:'#b89050', falling:'#c05830', golden:'#d4af37' };

    function render() {
        ctx.clearRect(0, 0, GW*SCALE, GH*SCALE);

        // Sky gradient
        const sky = lv.skies[room] || ['#1a2a4a','#3a5a8a'];
        const g = ctx.createLinearGradient(0, 0, 0, GH*SCALE);
        g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, GW*SCALE, GH*SCALE);

        // Grid
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= GW; x += 8) {
            ctx.strokeStyle = x % 16 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)';
            ctx.beginPath(); ctx.moveTo(x*SCALE, 0); ctx.lineTo(x*SCALE, GH*SCALE); ctx.stroke();
        }
        for (let y = 0; y <= GH; y += 8) {
            ctx.strokeStyle = y % 16 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)';
            ctx.beginPath(); ctx.moveTo(0, y*SCALE); ctx.lineTo(GW*SCALE, y*SCALE); ctx.stroke();
        }

        const rx = room * GW;

        // Platforms
        for (const pl of lv.platforms) {
            if (pl.x + pl.w <= rx || pl.x >= rx + GW) continue;
            const cx = Math.max(pl.x, rx);
            const ex = Math.min(pl.x + pl.w, rx + GW);
            const sx = (cx - rx) * SCALE, sy = pl.y * SCALE;
            const sw = (ex - cx) * SCALE, sh = pl.h * SCALE;
            ctx.fillStyle = pl === sel ? '#ffff66' : (pl.color || '#5a7a5a');
            ctx.fillRect(sx, sy, sw, sh);
            if (pl === sel) {
                ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 2;
                ctx.strokeRect(sx+1, sy+1, sw-2, sh-2);
                [pl.x, pl.x+pl.w].forEach(gx => [pl.y, pl.y+pl.h].forEach(gy => drawHandle(gx-rx, gy)));
            }
        }

        // Entities
        for (const ent of lv.entities) {
            const ex = entX(ent);
            if (ex < rx - 16 || ex >= rx + GW + 16) continue;
            drawEnt(ent, rx, ent === sel);
        }

        // Goal
        if (lv.goal) {
            const g2 = lv.goal;
            if (g2.x >= rx && g2.x < rx + GW) {
                const { sx, sy } = toScreen(g2.x, g2.y);
                ctx.fillStyle = sel === lv.goal ? '#ffff66' : '#d4af37';
                ctx.fillRect(sx, sy, g2.w*SCALE, g2.h*SCALE);
                ctx.fillStyle = '#fff'; ctx.font = `${SCALE*3}px monospace`;
                ctx.fillText('⚑', sx+1, sy + SCALE*3.5);
                if (sel === lv.goal) { ctx.strokeStyle='#ff0'; ctx.lineWidth=2; ctx.strokeRect(sx+1,sy+1,g2.w*SCALE-2,g2.h*SCALE-2); }
            }
        }

        // Spawn indicator
        if (lv.spawns[room]) {
            const sp = lv.spawns[room];
            const { sx, sy } = toScreen(sp.x, sp.y);
            ctx.fillStyle = 'rgba(100,180,255,0.55)';
            ctx.beginPath(); ctx.arc(sx, sy+5, 6, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#9df'; ctx.font = '9px monospace';
            ctx.fillText('SP', sx-8, sy-2);
        }

        // Draw-rect preview
        if (drag && drag.mode === 'draw') {
            const sx = Math.min(drag.x0, drag.x1)*SCALE;
            const sy = Math.min(drag.y0, drag.y1)*SCALE;
            const sw = Math.abs(drag.x1-drag.x0)*SCALE;
            const sh = Math.abs(drag.y1-drag.y0)*SCALE;
            ctx.fillStyle = 'rgba(90,200,90,0.25)';
            ctx.fillRect(sx, sy, sw, sh);
            ctx.strokeStyle = '#5aca5a'; ctx.lineWidth = 1.5;
            ctx.strokeRect(sx, sy, sw, sh);
            ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.font='9px monospace';
            ctx.fillText(`${Math.round(Math.abs(drag.x1-drag.x0))}×${Math.round(Math.abs(drag.y1-drag.y0))}`, sx+4, sy-4);
        }

        // Blade-A pending indicator + preview line
        if (bladeA) {
            const { sx, sy } = toScreen(bladeA.gx, bladeA.gy);
            ctx.fillStyle = '#d028d0'; ctx.fillRect(sx-5, sy-5, 10, 10);
        }

        // Room border
        ctx.strokeStyle = 'rgba(255,200,50,0.45)'; ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, GW*SCALE-2, GH*SCALE-2);
    }

    function drawHandle(gx, gy) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(gx*SCALE-4, gy*SCALE-4, 8, 8);
    }

    function drawEnt(ent, rx, selected) {
        const col = ECOL[ent.type] || '#aaa';
        ctx.fillStyle = selected ? '#ffff66' : col;
        const S = SCALE;

        if (ent.type === 'blade_h') {
            const ax=(ent.ax-rx)*S, ay=ent.ay*S, bx=(ent.bx-rx)*S, by=ent.by*S;
            ctx.setLineDash([4,3]); ctx.strokeStyle=selected?'#ff0':col; ctx.lineWidth=1.5;
            ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillRect(ax-5,ay-5,10,10); ctx.fillRect(bx-5,by-5,10,10);
        } else if (ent.type === 'blade_c') {
            const cx=(ent.cx-rx)*S, cy=ent.cy*S, r=ent.radius*S;
            ctx.setLineDash([3,2]); ctx.strokeStyle=selected?'#ff0':col; ctx.lineWidth=1;
            ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(cx,cy,6,0,Math.PI*2); ctx.fill();
        } else if (ent.type === 'bumper') {
            const cx=(ent.x-rx)*S, cy=ent.y*S;
            ctx.beginPath(); ctx.arc(cx,cy,12*S/3,0,Math.PI*2); ctx.fill();
        } else if (ent.type === 'spring') {
            ctx.fillRect((ent.x-rx)*S-8*S/3, ent.y*S-6*S/3, 16*S/3, 6*S/3);
        } else if (ent.type === 'crumble' || ent.type === 'falling') {
            ctx.fillRect((ent.x-rx)*S, ent.y*S, ent.w*S, 8*S/3);
        } else if (ent.type === 'spike') {
            const ex=(ent.x-rx)*S, ey=ent.y*S, sz=(ent.size||8)*S;
            ctx.beginPath();
            if (ent.dir==='up')    { ctx.moveTo(ex,ey); ctx.lineTo(ex+sz*.5,ey-4*S/3); ctx.lineTo(ex+sz,ey); }
            else if (ent.dir==='down') { ctx.moveTo(ex,ey); ctx.lineTo(ex+sz*.5,ey+4*S/3); ctx.lineTo(ex+sz,ey); }
            else { ctx.moveTo(ex,ey); ctx.lineTo(ex+4*S/3,ey+sz*.5); ctx.lineTo(ex,ey+sz); }
            ctx.fill();
        } else {
            ctx.beginPath(); ctx.arc((ent.x-rx)*S, ent.y*S, 6*S/3, 0, Math.PI*2); ctx.fill();
        }

        if (selected) { ctx.strokeStyle='#ff0'; ctx.lineWidth=1.5; }

        // Label
        ctx.fillStyle = selected ? '#ff0' : 'rgba(255,255,255,0.6)';
        ctx.font = `${SCALE*2.2}px monospace`;
        ctx.fillText(ent.type, entX(ent)*S - rx*S + 8, entY(ent)*S - 5);
    }

    // ── Hit testing ──────────────────────────────────────────────────────────
    function hitTest(gx, gy) {
        const rx = room * GW;
        if (lv.goal) {
            const g = lv.goal;
            if (gx>=g.x-4 && gx<=g.x+g.w+4 && gy>=g.y-4 && gy<=g.y+g.h+4)
                return { item: lv.goal, kind: 'goal' };
        }
        for (let i = lv.entities.length - 1; i >= 0; i--) {
            const e = lv.entities[i];
            if (entX(e) < rx-16 || entX(e) >= rx+GW+16) continue;
            if (hitEnt(e, gx, gy)) return { item: e, kind: 'entity' };
        }
        let best = null, bestA = Infinity;
        for (const pl of lv.platforms) {
            if (pl.x+pl.w <= rx || pl.x >= rx+GW) continue;
            if (gx>=pl.x-2 && gx<=pl.x+pl.w+2 && gy>=pl.y-2 && gy<=pl.y+pl.h+2) {
                const a = pl.w * pl.h;
                if (a < bestA) { best = pl; bestA = a; }
            }
        }
        return best ? { item: best, kind: 'platform' } : null;
    }

    function hitEnt(e, gx, gy) {
        const R = 8;
        if (e.type==='blade_h') return ptSegDist(gx,gy,e.ax,e.ay,e.bx,e.by) < R;
        if (e.type==='blade_c') return Math.hypot(gx-e.cx,gy-e.cy) < R+4;
        if (e.type==='crumble'||e.type==='falling') return gx>=e.x-2&&gx<=e.x+e.w+2&&gy>=e.y-2&&gy<=e.y+9;
        return Math.hypot(gx-e.x, gy-e.y) < R+4;
    }

    function ptSegDist(px,py,ax,ay,bx,by) {
        const dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy;
        if (!l2) return Math.hypot(px-ax,py-ay);
        const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/l2));
        return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
    }

    // ── Mouse events ─────────────────────────────────────────────────────────
    canvas.addEventListener('mousedown', ev => {
        if (ev.button !== 0) return;
        const { gx, gy } = toGame(ev.clientX, ev.clientY);

        if (tool === 'select' || (tool === 'platform' && ev.altKey)) {
            const hit = hitTest(gx, gy);
            if (hit) {
                sel = hit.item; selKind = hit.kind;
                if (hit.kind === 'platform')
                    drag = { mode:'move', dx: gx-hit.item.x, dy: gy-hit.item.y };
                else if (hit.kind === 'entity') {
                    drag = { mode:'move_ent', dx: gx-entX(hit.item), dy: gy-entY(hit.item) };
                } else if (hit.kind === 'goal')
                    drag = { mode:'move_goal', dx: gx-hit.item.x, dy: gy-hit.item.y };
            } else { sel=null; selKind=''; drag=null; }
            updateProps(); render();

        } else if (tool === 'platform') {
            sel=null; selKind='';
            drag = { mode:'draw', x0:gx-room*GW, y0:gy, x1:gx-room*GW, y1:gy };
            updateProps(); render();

        } else if (tool === 'entity') {
            if (entType === 'blade_h') {
                if (!bladeA) { bladeA = { gx, gy }; }
                else {
                    const e = { type:'blade_h', ax:bladeA.gx, ay:bladeA.gy, bx:gx, by:gy, speed:60 };
                    lv.entities.push(e); sel=e; selKind='entity'; bladeA=null;
                    updateProps(); autoSave();
                }
            } else {
                const e = makeEnt(entType, gx, gy);
                lv.entities.push(e); sel=e; selKind='entity';
                updateProps(); autoSave();
            }
            render();

        } else if (tool === 'erase') {
            const hit = hitTest(gx, gy);
            if (hit) {
                if (hit.kind==='platform') lv.platforms.splice(lv.platforms.indexOf(hit.item),1);
                else if (hit.kind==='entity') lv.entities.splice(lv.entities.indexOf(hit.item),1);
                else if (hit.kind==='goal') lv.goal=null;
                if (sel===hit.item) { sel=null; selKind=''; }
                updateProps(); autoSave();
            }
            render();

        } else if (tool === 'goal') {
            lv.goal = { x:gx, y:gy, w:12, h:12, color:'#d4af37' };
            sel=lv.goal; selKind='goal';
            updateProps(); autoSave(); render();
        }
    });

    canvas.addEventListener('mousemove', ev => {
        const { gx, gy } = toGame(ev.clientX, ev.clientY);
        const status = document.getElementById('ed-cursor');
        if (status) status.textContent = `x=${gx - room*GW}  y=${gy}`;

        if (bladeA && tool==='entity' && entType==='blade_h') {
            render();
            const { sx:ax, sy:ay } = toScreen(bladeA.gx, bladeA.gy);
            const { sx:bx, sy:by } = toScreen(gx, gy);
            ctx.setLineDash([4,3]); ctx.strokeStyle='rgba(208,40,208,0.7)'; ctx.lineWidth=2;
            ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
            ctx.setLineDash([]);
        }

        if (!ev.buttons || !drag) return;

        if (drag.mode==='draw') {
            drag.x1 = gx - room*GW; drag.y1 = gy; render();
        } else if (drag.mode==='move' && sel) {
            sel.x = snap(gx-drag.dx); sel.y = snap(gy-drag.dy);
            updateProps(); render();
        } else if (drag.mode==='move_ent' && sel) {
            const nx=snap(gx-drag.dx), ny=snap(gy-drag.dy);
            if (sel.type==='blade_h') { const dxe=nx-sel.ax,dye=ny-sel.ay; sel.ax+=dxe;sel.ay+=dye;sel.bx+=dxe;sel.by+=dye; }
            else if (sel.type==='blade_c') { sel.cx=nx; sel.cy=ny; }
            else { sel.x=nx; sel.y=ny; }
            updateProps(); render();
        } else if (drag.mode==='move_goal' && sel) {
            sel.x=snap(gx-drag.dx); sel.y=snap(gy-drag.dy);
            updateProps(); render();
        }
    });

    canvas.addEventListener('mouseup', ev => {
        if (drag && drag.mode==='draw') {
            const x = snap(Math.min(drag.x0,drag.x1)) + room*GW;
            const y = snap(Math.min(drag.y0,drag.y1));
            const w = snap(Math.max(8, Math.abs(drag.x1-drag.x0)));
            const h = snap(Math.max(4, Math.abs(drag.y1-drag.y0)));
            if (w>=8) {
                const pl = {x,y,w,h,color:'#5a7a5a'};
                lv.platforms.push(pl); sel=pl; selKind='platform';
                updateProps(); autoSave();
            }
            drag=null; render();
        } else if (drag) { drag=null; autoSave(); render(); }
    });

    // ── Entity factory ────────────────────────────────────────────────────────
    function makeEnt(type, gx, gy) {
        const m = { spring:{type:'spring',x:gx,y:gy,orientation:'floor'},
                    bumper:{type:'bumper',x:gx,y:gy},
                    crystal:{type:'crystal',x:gx,y:gy},
                    spike_up:{type:'spike',x:gx,y:gy,size:8,dir:'up'},
                    spike_down:{type:'spike',x:gx,y:gy,size:8,dir:'down'},
                    spike_left:{type:'spike',x:gx,y:gy,size:8,dir:'left'},
                    spike_right:{type:'spike',x:gx,y:gy,size:8,dir:'right'},
                    blade_c:{type:'blade_c',cx:gx,cy:gy,radius:18,startAngle:0,speed:1.5},
                    strawberry:{type:'strawberry',x:gx,y:gy},
                    crumble:{type:'crumble',x:gx,y:gy,w:48},
                    falling:{type:'falling',x:gx,y:gy,w:48,h:8},
                    golden:{type:'golden',x:gx,y:gy} };
        return m[type] || {type:'crystal',x:gx,y:gy};
    }

    // ── Properties panel ─────────────────────────────────────────────────────
    function updateProps() {
        const panel = document.getElementById('ed-props');
        if (!panel) return;
        if (!sel) { panel.innerHTML = '<span class="dim">Nothing selected</span>'; return; }

        let html = '';
        if (selKind === 'platform') {
            html = numField('x',sel.x)+numField('y',sel.y)+numField('w',sel.w)+numField('h',sel.h)
                 + `<label>Color <input type="color" class="prop" data-k="color" value="${sel.color||'#5a7a5a'}"></label>`;
        } else if (selKind === 'entity') {
            html = `<div class="prop-type">${sel.type}</div>`;
            if (sel.type==='blade_h') {
                html += numField('ax',sel.ax)+numField('ay',sel.ay)+numField('bx',sel.bx)+numField('by',sel.by)+numField('speed',sel.speed||60);
            } else if (sel.type==='blade_c') {
                html += numField('cx',sel.cx)+numField('cy',sel.cy)+numField('radius',sel.radius||18)+numField('speed',sel.speed||1.5,'0.1');
            } else if (sel.type==='crumble'||sel.type==='falling') {
                html += numField('x',sel.x)+numField('y',sel.y)+numField('w',sel.w||48);
            } else if (sel.type==='spike') {
                html += numField('x',sel.x)+numField('y',sel.y)+numField('size',sel.size||8)
                     + `<label>Dir <select class="prop" data-k="dir">`
                     + ['up','down','left','right'].map(d=>`<option${sel.dir===d?' selected':''}>${d}</option>`).join('')
                     + `</select></label>`;
            } else {
                html += numField('x',sel.x)+numField('y',sel.y);
            }
        } else if (selKind === 'goal') {
            html = `<div class="prop-type">GOAL</div>` + numField('x',sel.x)+numField('y',sel.y);
        }
        html += `<button class="del-btn" onclick="window.edDeleteSel()">🗑 Delete</button>`;
        panel.innerHTML = html;

        panel.querySelectorAll('.prop').forEach(inp => {
            inp.addEventListener('change', () => {
                const k = inp.dataset.k;
                sel[k] = inp.type==='number' ? parseFloat(inp.value) : inp.value;
                autoSave(); render();
            });
        });
    }

    function numField(k, v, step) {
        return `<label>${k} <input type="number" class="prop" data-k="${k}" value="${v}" step="${step||4}"></label>`;
    }

    window.edDeleteSel = function () {
        if (!sel) return;
        if (selKind==='platform') lv.platforms.splice(lv.platforms.indexOf(sel),1);
        else if (selKind==='entity') lv.entities.splice(lv.entities.indexOf(sel),1);
        else if (selKind==='goal') lv.goal=null;
        sel=null; selKind=''; updateProps(); autoSave(); render();
    };

    // ── Keyboard ─────────────────────────────────────────────────────────────
    document.addEventListener('keydown', ev => {
        if (['INPUT','SELECT','TEXTAREA'].includes(ev.target.tagName)) return;
        if (ev.key==='Delete'||ev.key==='Backspace') { window.edDeleteSel(); return; }
        if (ev.key==='Escape') { sel=null;selKind='';bladeA=null; updateProps(); render(); return; }
        const keys = {s:'select',p:'platform',e:'entity',x:'erase',g:'goal'};
        if (keys[ev.key.toLowerCase()]) window.edSetTool(keys[ev.key.toLowerCase()]);
        if (ev.key==='ArrowLeft')  { window.edPrevRoom(); ev.preventDefault(); }
        if (ev.key==='ArrowRight') { window.edNextRoom(); ev.preventDefault(); }
    });

    // ── Tool / entity type switching ──────────────────────────────────────────
    window.edSetTool = function (t) {
        tool = t; bladeA = null;
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool===t));
        canvas.style.cursor = t==='erase' ? 'not-allowed' : t==='platform' ? 'crosshair' : 'default';
        render();
    };

    window.edSetEnt = function (t) {
        entType = t; bladeA = null;
        document.querySelectorAll('.ent-btn').forEach(b => b.classList.toggle('active', b.dataset.ent===t));
    };

    // ── Room management ───────────────────────────────────────────────────────
    window.edPrevRoom = function () {
        if (room > 0) { room--; sel=null; selKind=''; updateRoomLabel(); updateProps(); render(); }
    };
    window.edNextRoom = function () {
        if (room < lv.numRooms-1) { room++; sel=null; selKind=''; updateRoomLabel(); updateProps(); render(); }
    };
    window.edAddRoom = function () {
        const ox = lv.numRooms * GW;
        // Move right wall of old last room to new position
        const rw = lv.platforms.find(p => p.x===(lv.numRooms-1)*GW+GW-8 && p.h===GH);
        if (rw) rw.x = ox + GW - 8;
        else lv.platforms.push({x:ox+GW-8, y:0, w:8, h:GH, color:'#4a5570'});
        lv.platforms.push({x:ox, y:FLOOR_Y, w:GW, h:FLOOR_H, color:'#3a5a3a'});
        lv.spawns.push({x:ox+14, y:FLOOR_Y-13});
        lv.names.push(`ROOM ${lv.numRooms+1}`);
        lv.skies.push([...lv.skies[lv.numRooms-1]]);
        lv.numRooms++;
        room = lv.numRooms - 1;
        updateRoomLabel(); autoSave(); render();
    };
    window.edRemoveRoom = function () {
        if (lv.numRooms <= 1) return;
        const ox = (lv.numRooms-1) * GW;
        lv.platforms = lv.platforms.filter(p => p.x < ox);
        lv.entities   = lv.entities.filter(e => entX(e) < ox);
        lv.spawns.pop(); lv.names.pop(); lv.skies.pop();
        lv.numRooms--;
        // Ensure right wall on new last room
        const nox = (lv.numRooms-1)*GW;
        if (!lv.platforms.find(p => p.x===nox+GW-8 && p.h===GH))
            lv.platforms.push({x:nox+GW-8, y:0, w:8, h:GH, color:'#4a5570'});
        if (room >= lv.numRooms) room = lv.numRooms-1;
        sel=null; selKind=''; updateRoomLabel(); updateProps(); autoSave(); render();
    };

    function updateRoomLabel() {
        const el = document.getElementById('ed-room-label');
        if (el) el.textContent = `Room ${room+1} / ${lv.numRooms}`;
    }

    // ── Save / Load / Play ────────────────────────────────────────────────────
    function autoSave() {
        try { localStorage.setItem('celeste_custom_level', JSON.stringify(lv)); } catch(e) {}
    }

    function setStatus(msg, ms) {
        const el = document.getElementById('ed-status');
        if (el) { el.textContent = msg; if (ms) setTimeout(() => el.textContent='', ms); }
    }

    window.edNew = function () {
        if (!confirm('New blank level? Current work will be lost.')) return;
        lv = createEmpty(3); room=0; sel=null; selKind='';
        updateRoomLabel(); updateProps(); render();
    };
    window.edSave = function () {
        autoSave(); setStatus('Saved ✓', 2000);
    };
    window.edExport = function () {
        const blob = new Blob([JSON.stringify(lv, null, 2)], {type:'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'celeste_level.json'; a.click();
    };
    window.edImport = function () {
        document.getElementById('ed-file-input').click();
    };
    window.edPlay = function () {
        autoSave();
        window.location.href = '/game.html?mode=custom';
    };

    document.addEventListener('DOMContentLoaded', () => {
        const fi = document.getElementById('ed-file-input');
        if (fi) fi.addEventListener('change', ev => {
            const file = ev.target.files[0]; if (!file) return;
            const r = new FileReader();
            r.onload = e2 => {
                try {
                    lv = JSON.parse(e2.target.result);
                    if (!lv.numRooms) lv.numRooms = lv.spawns ? lv.spawns.length : 3;
                    room=0; sel=null; selKind='';
                    updateRoomLabel(); updateProps(); autoSave(); render();
                    setStatus('Imported ✓', 2000);
                } catch(err) { alert('Invalid JSON: ' + err.message); }
            };
            r.readAsText(file); ev.target.value='';
        });
    });

    // ── Boot ──────────────────────────────────────────────────────────────────
    (function boot() {
        const stored = localStorage.getItem('celeste_custom_level');
        if (stored) {
            try {
                lv = JSON.parse(stored);
                if (!lv.numRooms) lv.numRooms = lv.spawns ? lv.spawns.length : 3;
            } catch(e) { lv = createEmpty(3); }
        }
        window.edSetTool('platform');
        window.edSetEnt('crystal');
        updateRoomLabel();
        updateProps();
        render();
    })();
})();
