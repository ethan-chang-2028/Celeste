// Celeste — test scene with Celeste-style movement and pixel-art sprite.
// Implements wall jump, dash, coyote time, jump-cut, and grab/cling.

(function () {
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const statusEl = document.getElementById('status');
    ctx.imageSmoothingEnabled = false;

    const WORLD = {
        width: canvas.width,
        height: canvas.height,
        gravity: 1800,
        maxFallSpeed: 720,
        wallSlideSpeed: 140,
    };

    const GROUND_Y = WORLD.height - 60;

    const platforms = [
        { x: 0,   y: GROUND_Y,        w: WORLD.width, h: 60,  color: '#3a5a3a' },
        { x: 180, y: GROUND_Y - 110,  w: 140, h: 18, color: '#5a7a5a' },
        { x: 420, y: GROUND_Y - 200,  w: 140, h: 18, color: '#5a7a5a' },
        { x: 660, y: GROUND_Y - 110,  w: 140, h: 18, color: '#5a7a5a' },
        { x: 0,   y: GROUND_Y - 220,  w: 24,  h: 220, color: '#4a5570' },
        { x: WORLD.width - 24, y: GROUND_Y - 220, w: 24, h: 220, color: '#4a5570' },
        { x: 300, y: GROUND_Y - 340,  w: 24,  h: 140, color: '#4a5570' },
        { x: 640, y: GROUND_Y - 340,  w: 24,  h: 140, color: '#4a5570' },
    ];

    const player = {
        x: 80,
        y: GROUND_Y - 48,
        w: 24,
        h: 32,
        vx: 0,
        vy: 0,
        runSpeed: 260,
        airAccel: 1600,
        groundAccel: 2400,
        friction: 2200,
        jumpVel: 540,
        wallJumpVx: 280,
        dashSpeed: 520,
        dashTime: 0.18,
        dashCooldown: 0.10,
        coyoteTime: 0.10,
        jumpBufferTime: 0.12,
        onGround: false,
        wallDir: 0,
        facing: 1,
        coyote: 0,
        jumpBuffer: 0,
        dashTimer: 0,
        dashCool: 0,
        dashesLeft: 1,
        dashVx: 0,
        dashVy: 0,
        grabbing: false,
    };

    const keys = Object.create(null);
    const pressed = Object.create(null);

    const trackedCodes = new Set([
        'ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
        'KeyC','KeyX','KeyZ','ShiftLeft','ShiftRight','KeyR',
    ]);

    window.addEventListener('keydown', (e) => {
        if (trackedCodes.has(e.code)) {
            if (!keys[e.code]) pressed[e.code] = true;
            keys[e.code] = true;
            e.preventDefault();
        }
        if (e.code === 'KeyR') reset();
    });
    window.addEventListener('keyup', (e) => {
        if (trackedCodes.has(e.code)) keys[e.code] = false;
    });

    function reset() {
        player.x = 80;
        player.y = GROUND_Y - player.h;
        player.vx = 0;
        player.vy = 0;
        player.dashTimer = 0;
        player.dashCool = 0;
        player.dashesLeft = 1;
        statusEl.textContent = 'Reset.';
    }

    function rectsOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function checkWall(dir) {
        const probe = { x: player.x + dir, y: player.y + 2, w: player.w, h: player.h - 4 };
        for (const p of platforms) if (rectsOverlap(probe, p)) return true;
        return false;
    }

    function update(dt) {
        const left  = keys['ArrowLeft'];
        const right = keys['ArrowRight'];
        const down  = keys['ArrowDown'];
        const up    = keys['ArrowUp'];
        const grab  = keys['KeyZ'] || keys['ShiftLeft'] || keys['ShiftRight'];
        const jumpPressed = pressed['KeyC'];
        const jumpHeld    = keys['KeyC'];
        const dashPressed = pressed['KeyX'];

        const inputX = (right ? 1 : 0) - (left ? 1 : 0);
        const inputY = (down  ? 1 : 0) - (up   ? 1 : 0);

        if (inputX !== 0) player.facing = inputX;

        player.coyote    = Math.max(0, player.coyote - dt);
        player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
        player.dashCool  = Math.max(0, player.dashCool - dt);
        if (jumpPressed) player.jumpBuffer = player.jumpBufferTime;

        const touchingLeft  = checkWall(-1);
        const touchingRight = checkWall(1);
        player.wallDir = touchingRight ? 1 : touchingLeft ? -1 : 0;

        const canGrab = grab && player.wallDir !== 0 && !player.onGround;
        player.grabbing = canGrab;

        if (player.dashTimer > 0) {
            player.dashTimer -= dt;
            player.vx = player.dashVx;
            player.vy = player.dashVy;
        } else {
            if (dashPressed && player.dashesLeft > 0 && player.dashCool <= 0) {
                let dx = inputX, dy = inputY;
                if (dx === 0 && dy === 0) { dx = player.facing; }
                const len = Math.hypot(dx, dy) || 1;
                player.dashVx = (dx / len) * player.dashSpeed;
                player.dashVy = (dy / len) * player.dashSpeed;
                player.dashTimer = player.dashTime;
                player.dashCool  = player.dashCooldown;
                player.dashesLeft--;
                player.vx = player.dashVx;
                player.vy = player.dashVy;
            } else {
                const accel = player.onGround ? player.groundAccel : player.airAccel;
                const targetVx = inputX * player.runSpeed;
                if (inputX !== 0) {
                    if (player.vx < targetVx) player.vx = Math.min(targetVx, player.vx + accel * dt);
                    else if (player.vx > targetVx) player.vx = Math.max(targetVx, player.vx - accel * dt);
                } else if (player.onGround) {
                    if (player.vx > 0) player.vx = Math.max(0, player.vx - player.friction * dt);
                    else if (player.vx < 0) player.vx = Math.min(0, player.vx + player.friction * dt);
                }

                if (player.grabbing) {
                    player.vy = inputY * 120;
                } else {
                    player.vy += WORLD.gravity * dt;
                    if (player.wallDir !== 0 && player.vy > WORLD.wallSlideSpeed && !player.onGround) {
                        player.vy = WORLD.wallSlideSpeed;
                    }
                    if (player.vy > WORLD.maxFallSpeed) player.vy = WORLD.maxFallSpeed;
                }

                const canCoyoteJump = player.coyote > 0;
                if (player.jumpBuffer > 0) {
                    if (player.onGround || canCoyoteJump) {
                        player.vy = -player.jumpVel;
                        player.jumpBuffer = 0;
                        player.coyote = 0;
                    } else if (player.wallDir !== 0) {
                        player.vy = -player.jumpVel;
                        player.vx = -player.wallDir * player.wallJumpVx;
                        player.facing = -player.wallDir;
                        player.jumpBuffer = 0;
                    }
                }

                if (!jumpHeld && player.vy < -200) player.vy = -200;
            }
        }

        const wasOnGround = player.onGround;

        player.x += player.vx * dt;
        for (const p of platforms) {
            if (rectsOverlap(player, p)) {
                if (player.vx > 0) player.x = p.x - player.w;
                else if (player.vx < 0) player.x = p.x + p.w;
                if (player.dashTimer > 0) { player.dashVx = 0; player.vx = 0; }
                else player.vx = 0;
            }
        }

        player.y += player.vy * dt;
        player.onGround = false;
        for (const p of platforms) {
            if (rectsOverlap(player, p)) {
                if (player.vy > 0) {
                    player.y = p.y - player.h;
                    player.vy = 0;
                    player.onGround = true;
                } else if (player.vy < 0) {
                    player.y = p.y + p.h;
                    player.vy = 0;
                }
                if (player.dashTimer > 0) player.dashVy = 0;
            }
        }

        if (player.onGround) {
            player.coyote = player.coyoteTime;
            player.dashesLeft = 1;
        } else if (wasOnGround) {
            player.coyote = player.coyoteTime;
        }
        if (player.wallDir !== 0 && !player.onGround) player.dashesLeft = 1;

        if (player.x < 0) { player.x = 0; player.vx = 0; }
        if (player.x + player.w > WORLD.width) { player.x = WORLD.width - player.w; player.vx = 0; }
        if (player.y > WORLD.height + 200) reset();

        for (const k of Object.keys(pressed)) delete pressed[k];

        const state = player.dashTimer > 0 ? 'dashing'
            : player.grabbing ? 'grabbing'
            : player.wallDir && !player.onGround ? 'wall-slide'
            : player.onGround ? 'grounded' : 'airborne';
        statusEl.textContent =
            `x=${player.x.toFixed(0)}  y=${player.y.toFixed(0)}  ` +
            `vx=${player.vx.toFixed(0)}  vy=${player.vy.toFixed(0)}  ` +
            `dashes=${player.dashesLeft}  ${state}`;
    }

    // 12x16 pixel-art Madeline-ish sprite. Colors keyed; null = transparent.
    // 0 transparent, 1 hair, 2 skin, 3 shirt, 4 pants, 5 eye, 6 outline
    const SPRITE_W = 12, SPRITE_H = 16;
    const SPRITE_PIXELS = [
        '............',
        '...111111...',
        '..11111111..',
        '.1111111111.',
        '.1122222211.',
        '.1122252211.',
        '.1122222211.',
        '.1122222211.',
        '..22222222..',
        '..33333333..',
        '.3333333333.',
        '.3333333333.',
        '..44444444..',
        '..44444444..',
        '..44....44..',
        '..44....44..',
    ];
    const PALETTE = {
        '1': '#c44a4a',
        '2': '#f0c89a',
        '3': '#3a6ec7',
        '4': '#2a2a4a',
        '5': '#1a1a2a',
    };
    const PIXEL_SCALE = 2;

    function drawSprite() {
        const sx = Math.round(player.x);
        const sy = Math.round(player.y);
        const flip = player.facing < 0;
        ctx.save();
        if (flip) {
            ctx.translate(sx + SPRITE_W * PIXEL_SCALE, sy);
            ctx.scale(-1, 1);
        } else {
            ctx.translate(sx, sy);
        }
        for (let py = 0; py < SPRITE_H; py++) {
            const row = SPRITE_PIXELS[py];
            for (let px = 0; px < SPRITE_W; px++) {
                const ch = row[px];
                const color = PALETTE[ch];
                if (!color) continue;
                ctx.fillStyle = color;
                ctx.fillRect(px * PIXEL_SCALE, py * PIXEL_SCALE, PIXEL_SCALE, PIXEL_SCALE);
            }
        }
        ctx.restore();

        if (player.dashTimer > 0) {
            ctx.fillStyle = 'rgba(150, 220, 255, 0.4)';
            ctx.fillRect(sx - 4, sy, player.w + 8, player.h);
        }
    }

    function render() {
        ctx.clearRect(0, 0, WORLD.width, WORLD.height);

        for (const p of platforms) {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(p.x, p.y, p.w, 4);
        }

        drawSprite();
    }

    let last = performance.now();
    function frame(now) {
        const dt = Math.min((now - last) / 1000, 1 / 30);
        last = now;
        update(dt);
        render();
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();
