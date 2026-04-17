'use strict';

// ============================================================
// Space Slug - Metal Slug style shooter
// ============================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const W = canvas.width;
const H = canvas.height;
const GROUND_Y = H - 80;

// ------------------------------------------------------------
// Sprite configuration — frame rects were auto-detected from the
// sprite sheets by scanning for non-transparent regions.
// Each animation scales frames to a consistent visual height.
// ------------------------------------------------------------
const TARGET_H = 96; // visual height of character on screen

const SPRITE_CONFIG = {
    idle: {
        src: 'assets/idle.png',
        fps: 1,
        frames: [{ x: 270, y: 96, w: 153, h: 183 }]
    },
    run: {
        src: 'assets/run.png',
        fps: 16,
        frames: [
            { x: 38,  y: 157, w: 56, h: 57 },
            { x: 99,  y: 156, w: 50, h: 58 },
            { x: 164, y: 155, w: 43, h: 59 },
            { x: 222, y: 156, w: 49, h: 57 },
            { x: 281, y: 155, w: 50, h: 59 },
            { x: 344, y: 157, w: 54, h: 57 },
            { x: 406, y: 156, w: 49, h: 58 },
            { x: 467, y: 155, w: 46, h: 59 },
            { x: 528, y: 156, w: 48, h: 58 },
            { x: 583, y: 158, w: 55, h: 56 }
        ]
    },
    jump: {
        src: 'assets/jump.png',
        fps: 10,
        frames: [
            { x: 37,  y: 272, w: 65, h: 78 },
            { x: 111, y: 216, w: 69, h: 77 },
            { x: 188, y: 182, w: 61, h: 73 },
            { x: 265, y: 129, w: 69, h: 77 },
            { x: 346, y: 100, w: 68, h: 74 },
            { x: 425, y: 102, w: 67, h: 78 },
            { x: 503, y: 162, w: 65, h: 78 },
            { x: 574, y: 208, w: 66, h: 81 }
        ]
    },
    shoot: {
        src: 'assets/shoot.png',
        fps: 14,
        // bottom row: rapid fire with muzzle flashes
        frames: [
            { x: 35,  y: 286, w: 75, h: 69 },
            { x: 124, y: 287, w: 91, h: 71 },
            { x: 230, y: 287, w: 96, h: 69 }
        ]
    }
};

const SPRITES = {};
let spritesMissing = false;

function loadImage(path) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = path;
    });
}

async function loadAssets() {
    for (const [key, cfg] of Object.entries(SPRITE_CONFIG)) {
        const img = await loadImage(cfg.src);
        if (img) {
            SPRITES[key] = { img, cfg };
        } else {
            SPRITES[key] = null;
            spritesMissing = true;
        }
    }
}

// ------------------------------------------------------------
// Animation
// ------------------------------------------------------------
class Animation {
    constructor(key) {
        this.key = key;
        this.time = 0;
        this.frame = 0;
    }
    reset() { this.time = 0; this.frame = 0; }
    update(dt) {
        const sprite = SPRITES[this.key];
        if (!sprite) return;
        const { frames, fps } = sprite.cfg;
        if (frames.length <= 1) return;
        this.time += dt;
        const frameTime = 1 / fps;
        while (this.time >= frameTime) {
            this.time -= frameTime;
            this.frame = (this.frame + 1) % frames.length;
        }
    }
    draw(cx, cy, flipX, alpha = 1) {
        const sprite = SPRITES[this.key];
        if (!sprite) return false;
        const f = sprite.cfg.frames[this.frame];
        const scale = TARGET_H / f.h;
        const dw = f.w * scale;
        const dh = f.h * scale;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(cx, cy);
        if (flipX) ctx.scale(-1, 1);
        ctx.drawImage(sprite.img, f.x, f.y, f.w, f.h, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
        return true;
    }
}

// ------------------------------------------------------------
// Input
// ------------------------------------------------------------
const keys = {};
const keyOnce = {};
window.addEventListener('keydown', (e) => {
    if (!keys[e.code]) keyOnce[e.code] = true;
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
    }
});
window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});
function consumeKeyOnce(code) {
    if (keyOnce[code]) { keyOnce[code] = false; return true; }
    return false;
}

// ------------------------------------------------------------
// Player
// ------------------------------------------------------------
const PLAYER_W = 56;
const PLAYER_H = 88;

class Player {
    constructor() {
        this.anims = {
            idle: new Animation('idle'),
            run:  new Animation('run'),
            jump: new Animation('jump'),
            shoot: new Animation('shoot')
        };
        this.reset();
    }
    reset() {
        this.x = 120;
        this.y = GROUND_Y - PLAYER_H / 2;
        this.vx = 0;
        this.vy = 0;
        this.onGround = true;
        this.facing = 1;
        this.hp = 3;
        this.invuln = 0;
        this.shootCooldown = 0;
        this.shootAnimTimer = 0;
        this.charging = 0;
        this.alive = true;
    }
    get rect() {
        return { x: this.x - PLAYER_W / 2, y: this.y - PLAYER_H / 2, w: PLAYER_W, h: PLAYER_H };
    }
    update(dt) {
        if (!this.alive) return;

        const SPEED = 260;
        const JUMP_V = -620;
        const GRAVITY = 1800;

        let move = 0;
        if (keys['KeyA'] || keys['ArrowLeft']) move -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) move += 1;
        this.vx = move * SPEED;
        if (move !== 0) this.facing = move;

        if ((consumeKeyOnce('KeyW') || consumeKeyOnce('Space') || consumeKeyOnce('ArrowUp')) && this.onGround) {
            this.vy = JUMP_V;
            this.onGround = false;
            this.anims.jump.reset();
        }

        this.vy += GRAVITY * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        if (this.y + PLAYER_H / 2 >= GROUND_Y) {
            this.y = GROUND_Y - PLAYER_H / 2;
            this.vy = 0;
            this.onGround = true;
        }

        if (this.x < PLAYER_W / 2) this.x = PLAYER_W / 2;
        if (this.x > W - PLAYER_W / 2) this.x = W - PLAYER_W / 2;

        this.shootCooldown -= dt;
        this.shootAnimTimer -= dt;

        if (keys['KeyJ'] && this.shootCooldown <= 0) {
            this.fire('normal');
        }
        if (keys['KeyK']) {
            this.charging += dt;
        } else if (this.charging > 0) {
            if (this.charging >= 0.6) this.fire('charged');
            else if (this.shootCooldown <= 0) this.fire('normal');
            this.charging = 0;
        }

        if (!this.onGround) this.anims.jump.update(dt);
        else if (Math.abs(this.vx) > 10) this.anims.run.update(dt);
        else this.anims.idle.update(dt);

        if (this.shootAnimTimer > 0) this.anims.shoot.update(dt);

        if (this.invuln > 0) this.invuln -= dt;
    }
    fire(type) {
        const muzzleX = this.x + this.facing * 38;
        const muzzleY = this.y + 4;
        if (type === 'charged') {
            bullets.push(new Bullet(muzzleX, muzzleY, this.facing * 900, 'charged'));
            this.shootCooldown = 0.35;
            hudWeapon.textContent = 'CARREGADO';
        } else {
            bullets.push(new Bullet(muzzleX, muzzleY, this.facing * 780, 'normal'));
            this.shootCooldown = 0.14;
            hudWeapon.textContent = 'NORMAL';
        }
        this.shootAnimTimer = 0.2;
        this.anims.shoot.reset();
        spawnMuzzleFlash(muzzleX, muzzleY, this.facing);
    }
    takeDamage() {
        if (this.invuln > 0) return;
        this.hp -= 1;
        this.invuln = 1.2;
        hudLives.textContent = this.hp;
        spawnExplosion(this.x, this.y, '#ff5533');
        if (this.hp <= 0) {
            this.alive = false;
            game.state = 'gameover';
            document.getElementById('final-score').textContent = game.score;
            document.getElementById('gameover').classList.remove('hidden');
        }
    }
    draw() {
        const alpha = (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0) ? 0.4 : 1;
        const flip = this.facing < 0;
        let drew = false;

        if (this.shootAnimTimer > 0 && this.onGround && Math.abs(this.vx) < 10) {
            drew = this.anims.shoot.draw(this.x, this.y, flip, alpha);
        } else if (!this.onGround) {
            drew = this.anims.jump.draw(this.x, this.y, flip, alpha);
        } else if (Math.abs(this.vx) > 10) {
            drew = this.anims.run.draw(this.x, this.y, flip, alpha);
        } else {
            drew = this.anims.idle.draw(this.x, this.y, flip, alpha);
        }

        if (!drew) {
            ctx.globalAlpha = alpha;
            drawPlayerFallback(this.x, this.y, this.facing);
            ctx.globalAlpha = 1;
        }
    }
}

function drawPlayerFallback(x, y, facing) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    ctx.fillStyle = '#5a6d3a';
    ctx.fillRect(-18, -20, 36, 44);
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.arc(0, -28, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5db7d6';
    ctx.beginPath();
    ctx.arc(4, -28, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(6, -6, 34, 8);
    ctx.fillStyle = '#4a5a2e';
    ctx.fillRect(-14, 24, 10, 12);
    ctx.fillRect(4, 24, 10, 12);
    ctx.restore();
}

// ------------------------------------------------------------
// Bullet
// ------------------------------------------------------------
class Bullet {
    constructor(x, y, vx, type, fromEnemy = false) {
        this.x = x; this.y = y; this.vx = vx;
        this.type = type;
        this.fromEnemy = fromEnemy;
        this.dead = false;
        this.life = 1.5;
        this.damage = type === 'charged' ? 3 : 1;
    }
    update(dt) {
        this.x += this.vx * dt;
        this.life -= dt;
        if (this.life <= 0 || this.x < -40 || this.x > W + 40) this.dead = true;
    }
    get rect() {
        const r = this.type === 'charged' ? 16 : 6;
        return { x: this.x - r, y: this.y - r / 2, w: r * 2, h: r };
    }
    draw() {
        if (this.type === 'charged') {
            const g = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, 18);
            g.addColorStop(0, '#eaffff');
            g.addColorStop(0.4, '#40d8ff');
            g.addColorStop(1, 'rgba(40,150,255,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 18, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = this.fromEnemy ? '#ff6644' : '#ffdd33';
            ctx.fillRect(this.x - 8, this.y - 2, 16, 4);
            ctx.fillStyle = '#fff8cc';
            ctx.fillRect(this.x - 3, this.y - 1, 6, 2);
        }
    }
}

// ------------------------------------------------------------
// Enemy — uses same sprites, rendered with red tint
// ------------------------------------------------------------
class Enemy {
    constructor(x) {
        this.x = x;
        this.y = GROUND_Y - PLAYER_H / 2;
        this.vx = 0;
        this.facing = 1;
        this.hp = 2;
        this.dead = false;
        this.shootTimer = 1 + Math.random() * 1.5;
        this.anims = {
            run: new Animation('run'),
            idle: new Animation('idle')
        };
    }
    get rect() {
        return { x: this.x - PLAYER_W / 2, y: this.y - PLAYER_H / 2, w: PLAYER_W, h: PLAYER_H };
    }
    update(dt) {
        const dist = player.x - this.x;
        this.facing = dist < 0 ? -1 : 1;
        const desiredRange = 260;
        if (Math.abs(dist) > desiredRange) {
            this.vx = Math.sign(dist) * 110;
        } else {
            this.vx = 0;
        }
        this.x += this.vx * dt;

        this.shootTimer -= dt;
        if (this.shootTimer <= 0 && Math.abs(dist) < 600) {
            this.shootTimer = 1.4 + Math.random() * 1.2;
            bullets.push(new Bullet(
                this.x + this.facing * 28,
                this.y + 4,
                this.facing * 420,
                'normal',
                true
            ));
        }

        if (Math.abs(this.vx) > 10) this.anims.run.update(dt);
        else this.anims.idle.update(dt);
    }
    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) {
            this.dead = true;
            spawnExplosion(this.x, this.y, '#ffaa22');
            game.score += 100;
            hudScore.textContent = game.score;
        }
    }
    draw() {
        const flip = this.facing < 0;
        const anim = (Math.abs(this.vx) > 10) ? this.anims.run : this.anims.idle;
        const drew = anim.draw(this.x, this.y, flip);

        if (drew) {
            // red tint overlay using source-atop: paint only over drawn pixels.
            // We re-draw the sprite then tint. Simplest: render tint on an
            // offscreen canvas. For performance, skip offscreen and accept
            // a rect overlay blended with multiply.
            const sprite = SPRITES[anim.key];
            const f = sprite.cfg.frames[anim.frame];
            const scale = TARGET_H / f.h;
            const dw = f.w * scale;
            const dh = f.h * scale;
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = 0.55;
            ctx.translate(this.x, this.y);
            if (flip) ctx.scale(-1, 1);
            ctx.fillStyle = '#ff3030';
            ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
            ctx.restore();
        } else {
            drawEnemyFallback(this.x, this.y, this.facing);
        }
    }
}

function drawEnemyFallback(x, y, facing) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    ctx.fillStyle = '#6a2020';
    ctx.fillRect(-18, -20, 36, 44);
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.arc(0, -28, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath();
    ctx.arc(4, -28, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(6, -6, 34, 8);
    ctx.fillStyle = '#4a1a1a';
    ctx.fillRect(-14, 24, 10, 12);
    ctx.fillRect(4, 24, 10, 12);
    ctx.restore();
}

// ------------------------------------------------------------
// Particles
// ------------------------------------------------------------
class Particle {
    constructor(x, y, vx, vy, life, color, size) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.life = life; this.maxLife = life;
        this.color = color; this.size = size;
        this.dead = false;
    }
    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += 400 * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }
    draw() {
        const a = Math.max(0, this.life / this.maxLife);
        ctx.globalAlpha = a;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
        ctx.globalAlpha = 1;
    }
}

function spawnExplosion(x, y, color) {
    for (let i = 0; i < 18; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 120 + Math.random() * 240;
        particles.push(new Particle(
            x, y,
            Math.cos(ang) * spd, Math.sin(ang) * spd - 100,
            0.4 + Math.random() * 0.4,
            color,
            3 + Math.random() * 4
        ));
    }
}

function spawnMuzzleFlash(x, y, facing) {
    for (let i = 0; i < 6; i++) {
        particles.push(new Particle(
            x + facing * 6, y,
            facing * (80 + Math.random() * 120),
            (Math.random() - 0.5) * 60,
            0.08 + Math.random() * 0.08,
            '#fff1a0',
            2 + Math.random() * 3
        ));
    }
}

// ------------------------------------------------------------
// Background
// ------------------------------------------------------------
const stars = [];
for (let i = 0; i < 80; i++) {
    stars.push({ x: Math.random() * W, y: Math.random() * (GROUND_Y - 40), s: Math.random() * 1.5 + 0.5 });
}
const mountains = [];
for (let i = 0; i < 8; i++) {
    mountains.push({ x: i * 140 + Math.random() * 40, w: 200, h: 60 + Math.random() * 80 });
}
let bgOffset = 0;

function drawBackground(dt) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, '#0b1633');
    g.addColorStop(0.6, '#42236a');
    g.addColorStop(1, '#d66a2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, GROUND_Y);

    if (player && player.alive) bgOffset += player.vx * 0.05 * dt;

    ctx.fillStyle = '#fff';
    for (const s of stars) {
        const sx = ((s.x - bgOffset * 0.3) % W + W) % W;
        ctx.fillRect(sx, s.y, s.s, s.s);
    }

    ctx.fillStyle = '#2a1a3a';
    for (const m of mountains) {
        const mx = ((m.x - bgOffset * 0.6) % (W + 200) + (W + 200)) % (W + 200) - 100;
        ctx.beginPath();
        ctx.moveTo(mx, GROUND_Y);
        ctx.lineTo(mx + m.w / 2, GROUND_Y - m.h);
        ctx.lineTo(mx + m.w, GROUND_Y);
        ctx.closePath();
        ctx.fill();
    }

    ctx.fillStyle = '#2d1a0e';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = '#5a3318';
    ctx.fillRect(0, GROUND_Y, W, 8);

    ctx.fillStyle = '#3a1f10';
    const tileOff = ((bgOffset) % 40 + 40) % 40;
    for (let x = -tileOff; x < W; x += 40) {
        ctx.fillRect(x, GROUND_Y + 20, 20, 4);
    }
}

// ------------------------------------------------------------
// Collision
// ------------------------------------------------------------
function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ------------------------------------------------------------
// Game
// ------------------------------------------------------------
const game = {
    state: 'menu',
    score: 0,
    enemySpawnTimer: 2
};
let player;
let bullets = [];
let enemies = [];
let particles = [];

const hudScore = document.getElementById('score-value');
const hudLives = document.getElementById('lives-value');
const hudWeapon = document.getElementById('weapon-value');

function startGame() {
    game.state = 'playing';
    game.score = 0;
    game.enemySpawnTimer = 1.5;
    player = new Player();
    bullets = [];
    enemies = [];
    particles = [];
    hudScore.textContent = '0';
    hudLives.textContent = '3';
    hudWeapon.textContent = 'NORMAL';
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('gameover').classList.add('hidden');
}

function update(dt) {
    if (game.state !== 'playing') return;

    player.update(dt);

    game.enemySpawnTimer -= dt;
    if (game.enemySpawnTimer <= 0 && enemies.length < 5) {
        const fromLeft = Math.random() < 0.5;
        enemies.push(new Enemy(fromLeft ? -30 : W + 30));
        game.enemySpawnTimer = 1.8 + Math.random() * 1.5;
    }

    for (const b of bullets) b.update(dt);
    for (const e of enemies) e.update(dt);
    for (const p of particles) p.update(dt);

    for (const b of bullets) {
        if (b.dead || b.fromEnemy) continue;
        for (const e of enemies) {
            if (e.dead) continue;
            if (aabb(b.rect, e.rect)) {
                e.takeDamage(b.damage);
                if (b.type !== 'charged') b.dead = true;
                break;
            }
        }
    }

    for (const b of bullets) {
        if (b.dead || !b.fromEnemy) continue;
        if (aabb(b.rect, player.rect)) {
            b.dead = true;
            player.takeDamage();
        }
    }

    for (const e of enemies) {
        if (e.dead) continue;
        if (aabb(e.rect, player.rect)) {
            player.takeDamage();
        }
    }

    bullets = bullets.filter(b => !b.dead);
    enemies = enemies.filter(e => !e.dead);
    particles = particles.filter(p => !p.dead);
}

function render(dt) {
    ctx.clearRect(0, 0, W, H);
    drawBackground(dt);

    for (const e of enemies) e.draw();
    if (game.state === 'playing' || game.state === 'gameover') player.draw();
    for (const b of bullets) b.draw();
    for (const p of particles) p.draw();

    if (spritesMissing) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, H - 28, W, 28);
        ctx.fillStyle = '#ffbbbb';
        ctx.font = '14px monospace';
        ctx.fillText('Sprites nao encontrados em assets/ - usando graficos de fallback. Veja assets/README.md', 10, H - 10);
    }
}

// ------------------------------------------------------------
// Loop
// ------------------------------------------------------------
let lastTime = performance.now();
function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    update(dt);
    render(dt);
    requestAnimationFrame(loop);
}

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

loadAssets().then(() => {
    requestAnimationFrame(loop);
});
