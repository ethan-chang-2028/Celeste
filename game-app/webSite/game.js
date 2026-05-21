// Celeste — minimal test scene.
// Renders a ground and a controllable sprite so the game loop, input,
// gravity, and collisions can be exercised in the browser.

(function () {
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const statusEl = document.getElementById('status');

    const WORLD = {
        width: canvas.width,
        height: canvas.height,
        gravity: 1800,
    };

    const GROUND_Y = WORLD.height - 60;

    const platforms = [
        { x: 0, y: GROUND_Y, w: WORLD.width, h: 60, color: '#3a5a3a' },
        { x: 180, y: GROUND_Y - 90, w: 140, h: 18, color: '#5a7a5a' },
        { x: 420, y: GROUND_Y - 170, w: 140, h: 18, color: '#5a7a5a' },
        { x: 660, y: GROUND_Y - 90, w: 140, h: 18, color: '#5a7a5a' },
    ];

    const player = {
        x: 80,
        y: GROUND_Y - 48,
        w: 28,
        h: 48,
        vx: 0,
        vy: 0,
        speed: 280,
        jump: 620,
        onGround: false,
        facing: 1,
    };

    const keys = Object.create(null);

    window.addEventListener('keydown', (e) => {
        keys[e.code] = true;
        if (e.code === 'KeyR') reset();
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
            e.preventDefault();
        }
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });

    function reset() {
        player.x = 80;
        player.y = GROUND_Y - player.h;
        player.vx = 0;
        player.vy = 0;
        statusEl.textContent = 'Reset.';
    }

    function rectsOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function update(dt) {
        const left = keys['ArrowLeft'] || keys['KeyA'];
        const right = keys['ArrowRight'] || keys['KeyD'];
        const jump = keys['Space'] || keys['ArrowUp'] || keys['KeyW'];

        player.vx = 0;
        if (left)  { player.vx = -player.speed; player.facing = -1; }
        if (right) { player.vx =  player.speed; player.facing =  1; }

        if (jump && player.onGround) {
            player.vy = -player.jump;
            player.onGround = false;
        }

        player.vy += WORLD.gravity * dt;

        player.x += player.vx * dt;
        for (const p of platforms) {
            if (rectsOverlap(player, p)) {
                if (player.vx > 0) player.x = p.x - player.w;
                else if (player.vx < 0) player.x = p.x + p.w;
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
            }
        }

        if (player.x < 0) player.x = 0;
        if (player.x + player.w > WORLD.width) player.x = WORLD.width - player.w;
        if (player.y > WORLD.height + 200) reset();

        statusEl.textContent =
            `x=${player.x.toFixed(0)}  y=${player.y.toFixed(0)}  ` +
            `vx=${player.vx.toFixed(0)}  vy=${player.vy.toFixed(0)}  ` +
            `${player.onGround ? 'grounded' : 'airborne'}`;
    }

    function drawSprite() {
        const { x, y, w, h, facing } = player;
        ctx.fillStyle = '#e85a7a';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#3a1a22';
        ctx.fillRect(x + 4, y + 6, w - 8, 10);
        ctx.fillStyle = '#ffffff';
        const eyeX = facing === 1 ? x + w - 10 : x + 4;
        ctx.fillRect(eyeX, y + 18, 6, 6);
        ctx.fillStyle = '#000';
        ctx.fillRect(eyeX + (facing === 1 ? 3 : 1), y + 20, 2, 2);
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
