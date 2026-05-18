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
// Assets
// ------------------------------------------------------------
const SPRITE_CONFIG = {
    idle:  { src: 'assets/idle.png',  frames: 1,  fw: 0, fh: 0, fps: 1  },
    run:   { src: 'assets/run.png',   frames: 10, fw: 0, fh: 0, fps: 16 },
    jump:  { src: 'assets/jump.png',  frames: 8,  fw: 0, fh: 0, fps: 12 },
    shoot: { src: 'assets/shoot.png', frames: 3,  fw: 0, fh: 0, fps: 14 }
};

const SPRITES = {};
let assetsReady = false;
let assetsFailed = false;

function loadImage(path) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = path;
    });
}

async function loadAssets() {
    const results = await Promise.all(
        Object.entries(SPRITE_CONFIG).map(async ([key, cfg]) => {
            const img = await loadImage(cfg.src);
            return [key, img, cfg];
        })
    );
    let allOk = true;
    for (const [key, img, cfg] of results) {
        if (img) {
            cfg.fw = Math.floor(img.width / cfg.frames);
            cfg.fh = img.height;
            SPRITES[key] = { img, cfg };
        } else {
            allOk = false;
            SPRITES[key] = null;
        }
    }
    assetsReady = allOk;
    assetsFailed = !allOk;
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
        if (frames <= 1) return;
        this.time += dt;
        const frameTime = 1 / fps;
        while (this.time >= frameTime) {
            this.time -= frameTime;
            this.frame = (this.frame + 1) % frames;
        }
    }
    draw(cx, cy, flipX) {
        const sprite = SPRITES[this.key];
        if (!sprite) return false;
        const { fw, fh } = sprite.cfg;
        ctx.save();
        ctx.translate(cx, cy);
        if (flipX) ctx.scale(-1, 1);
        ctx.drawImage(
            sprite.img,
            this.frame * fw, 0, fw, fh,
            -fw / 2, -fh / 2, fw, fh
        );
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
const PLAYER_H = 72;

class Player {
    constructor() {
        this.reset();
        this.anims = {
            idle: new Animation('idle'),
            run:  new Animation('run'),
            jump: new Animation('jump'),
            shoot: new Animation('shoot')
        };
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

        // horizontal
        let move = 0;
        if (keys['KeyA'] || keys['ArrowLeft']) move -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) move += 1;
        this.vx = move * SPEED;
        if (move !== 0) this.facing = move;

        // jump
        if ((consumeKeyOnce('KeyW') || consumeKeyOnce('Space') || consumeKeyOnce('ArrowUp')) && this.onGround) {
            this.vy = JUMP_V;
            this.onGround = false;
            this.anims.jump.reset();
        }

        // gravity + position
        this.vy += GRAVITY * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // ground collision
        if (this.y + PLAYER_H / 2 >= GROUND_Y) {
            this.y = GROUND_Y - PLAYER_H / 2;
            this.vy = 0;
            this.onGround = true;
        }

        // bounds
        if (this.x < PLAYER_W / 2) this.x = PLAYER_W / 2;
        if (this.x > W - PLAYER_W / 2) this.x = W - PLAYER_W / 2;

        // shooting
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

        // animation update
        if (!this.onGround) this.anims.jump.update(dt);
        else if (Math.abs(this.vx) > 10) this.anims.run.update(dt);
        else this.anims.idle.update(dt);

        if (this.shootAnimTimer > 0) this.anims.shoot.update(dt);

        if (this.invuln > 0) this.invuln -= dt;
    }
    fire(type) {
        const muzzleX = this.x + this.facing * 32;
        const muzzleY = this.y - 6;
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
        const blink = this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0;
        if (blink) { ctx.globalAlpha = 0.4; }

        const flip = this.facing < 0;
        let drew = false;

        if (!this.onGround) {
            drew = this.anims.jump.draw(this.x, this.y, flip);
        } else if (Math.abs(this.vx) > 10) {
            drew = this.anims.run.draw(this.x, this.y, flip);
        } else {
            drew = this.anims.idle.draw(this.x, this.y, flip);
        }

        if (this.shootAnimTimer > 0) {
            this.anims.shoot.draw(this.x, this.y, flip);
        }

        if (!drew) drawPlayerFallback(this.x, this.y, this.facing);

        ctx.globalAlpha = 1;
    }
}

function drawPlayerFallback(x, y, facing) {
    // retângulos coloridos estilizados quando sprites não existem
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    // corpo
    ctx.fillStyle = '#5a6d3a';
    ctx.fillRect(-18, -20, 36, 44);
    // capacete
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.arc(0, -28, 14, 0, Math.PI * 2);
    ctx.fill();
    // viseira
    ctx.fillStyle = '#5db7d6';
    ctx.beginPath();
    ctx.arc(4, -28, 9, 0, Math.PI * 2);
    ctx.fill();
    // arma
    ctx.fillStyle = '#222';
    ctx.fillRect(6, -6, 34, 8);
    // pernas
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
            ctx.fillStyle = this.fromEnemy ? '#ff66cc' : '#ffdd33';
            ctx.fillRect(this.x - 8, this.y - 2, 16, 4);
            ctx.fillStyle = this.fromEnemy ? '#ffe0ff' : '#fff8cc';
            ctx.fillRect(this.x - 3, this.y - 1, 6, 2);
            if (this.fromEnemy) {
                ctx.fillStyle = 'rgba(255, 100, 200, 0.35)';
                ctx.fillRect(this.x - 12, this.y - 3, 24, 6);
            }
        }
    }
}

// ------------------------------------------------------------
// Enemy
// ------------------------------------------------------------
class Enemy {
    constructor(x) {
        this.x = x;
        this.y = GROUND_Y - PLAYER_H / 2;
        this.vx = 0;
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
                this.y - 6,
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
        // tint enemies red via composite
        ctx.save();
        const drew = (Math.abs(this.vx) > 10
            ? this.anims.run.draw(this.x, this.y, flip)
            : this.anims.idle.draw(this.x, this.y, flip));
        if (drew) {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = 'rgba(120, 40, 200, 0.55)';
            ctx.fillRect(this.x - PLAYER_W, this.y - PLAYER_H, PLAYER_W * 2, PLAYER_H * 2);
        }
        ctx.restore();
        if (!drew) drawEnemyFallback(this.x, this.y, this.facing);
    }
}

function drawEnemyFallback(x, y, facing) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    ctx.fillStyle = '#3a1a5a';
    ctx.fillRect(-18, -20, 36, 44);
    ctx.fillStyle = '#1a1a2a';
    ctx.beginPath();
    ctx.arc(0, -28, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#66ff88';
    ctx.beginPath();
    ctx.arc(4, -28, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(6, -6, 34, 8);
    ctx.fillStyle = '#2a1240';
    ctx.fillRect(-14, 24, 10, 12);
    ctx.fillRect(4, 24, 10, 12);
    ctx.restore();
}

// ------------------------------------------------------------
// Particles (explosion, muzzle)
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
// Background (parallax) - tema espacial
// ------------------------------------------------------------
const STAR_LAYERS = [
    { count: 90, speed: 0.15, size: 1, color: '#5566aa' }, // longe
    { count: 60, speed: 0.35, size: 1, color: '#aabbff' }, // medio
    { count: 30, speed: 0.65, size: 2, color: '#ffffff' }  // perto
];
const starLayers = STAR_LAYERS.map(def => {
    const stars = [];
    for (let i = 0; i < def.count; i++) {
        stars.push({
            x: Math.random() * W,
            y: Math.random() * (GROUND_Y - 30),
            tw: Math.random() * Math.PI * 2
        });
    }
    return { ...def, stars };
});

// planeta gigante no horizonte + lua
const planet = { x: W * 0.78, y: GROUND_Y - 180, r: 110 };
const moon   = { x: W * 0.22, y: 90, r: 28 };

// cumes de asteroide no chao distante
const ridges = [];
for (let i = 0; i < 10; i++) {
    ridges.push({
        x: i * 130 + Math.random() * 30,
        w: 180 + Math.random() * 60,
        h: 50 + Math.random() * 80
    });
}
// estacao orbital faixa media
const stations = [];
for (let i = 0; i < 3; i++) {
    stations.push({
        x: 200 + i * 360 + Math.random() * 80,
        y: 70 + Math.random() * 80,
        w: 70, h: 14
    });
}

let bgOffset = 0;
let bgTwinkle = 0;

function drawBackground(dt) {
    // gradiente espacial profundo
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0,    '#02030a');
    g.addColorStop(0.45, '#0b0830');
    g.addColorStop(0.85, '#1a0a3a');
    g.addColorStop(1,    '#28104a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, GROUND_Y);

    // nebulosa difusa
    const neb = ctx.createRadialGradient(W * 0.35, GROUND_Y * 0.45, 30, W * 0.35, GROUND_Y * 0.45, 280);
    neb.addColorStop(0, 'rgba(160, 60, 200, 0.25)');
    neb.addColorStop(0.5, 'rgba(80, 30, 140, 0.12)');
    neb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, W, GROUND_Y);

    const neb2 = ctx.createRadialGradient(W * 0.7, GROUND_Y * 0.3, 30, W * 0.7, GROUND_Y * 0.3, 240);
    neb2.addColorStop(0, 'rgba(40, 120, 200, 0.22)');
    neb2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb2;
    ctx.fillRect(0, 0, W, GROUND_Y);

    if (player && player.alive) bgOffset += player.vx * 0.05 * dt;
    bgTwinkle += dt;

    // estrelas em parallax + cintilancia
    for (const layer of starLayers) {
        ctx.fillStyle = layer.color;
        for (const s of layer.stars) {
            const sx = ((s.x - bgOffset * layer.speed) % W + W) % W;
            const tw = 0.55 + 0.45 * Math.sin(bgTwinkle * 3 + s.tw);
            ctx.globalAlpha = tw;
            ctx.fillRect(sx, s.y, layer.size, layer.size);
        }
    }
    ctx.globalAlpha = 1;

    // lua pequena
    const mx = ((moon.x - bgOffset * 0.2) % (W + 120) + (W + 120)) % (W + 120) - 60;
    const mg = ctx.createRadialGradient(mx, moon.y, 4, mx, moon.y, moon.r);
    mg.addColorStop(0, '#ffffff');
    mg.addColorStop(0.5, '#cfd8ff');
    mg.addColorStop(1, 'rgba(150,170,255,0)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(mx, moon.y, moon.r, 0, Math.PI * 2); ctx.fill();

    // planeta grande com anel
    const px = ((planet.x - bgOffset * 0.35) % (W + 300) + (W + 300)) % (W + 300) - 150;
    // anel atras
    ctx.save();
    ctx.translate(px, planet.y);
    ctx.rotate(-0.25);
    ctx.strokeStyle = 'rgba(200, 140, 90, 0.55)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(0, 0, planet.r * 1.55, planet.r * 0.4, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // corpo
    const pg = ctx.createRadialGradient(px - 30, planet.y - 30, 10, px, planet.y, planet.r);
    pg.addColorStop(0, '#ffd1a0');
    pg.addColorStop(0.5, '#d97a3a');
    pg.addColorStop(1, '#4a1a0a');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(px, planet.y, planet.r, 0, Math.PI * 2); ctx.fill();
    // anel na frente
    ctx.save();
    ctx.translate(px, planet.y);
    ctx.rotate(-0.25);
    ctx.strokeStyle = 'rgba(220, 160, 110, 0.85)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(0, 0, planet.r * 1.55, planet.r * 0.4, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();

    // estacao orbital (mini silhuetas)
    for (const st of stations) {
        const sx = ((st.x - bgOffset * 0.5) % (W + 200) + (W + 200)) % (W + 200) - 100;
        ctx.fillStyle = '#5a6688';
        ctx.fillRect(sx, st.y, st.w, st.h);
        ctx.fillStyle = '#8aa0d0';
        ctx.fillRect(sx, st.y, st.w, 3);
        ctx.fillStyle = '#ffee66';
        ctx.fillRect(sx + 4, st.y + 6, 2, 2);
        ctx.fillRect(sx + 12, st.y + 6, 2, 2);
        ctx.fillRect(sx + 20, st.y + 6, 2, 2);
        // antena
        ctx.fillStyle = '#aaaacc';
        ctx.fillRect(sx + st.w / 2 - 1, st.y - 8, 2, 8);
    }

    // cumes de asteroide ao fundo
    ctx.fillStyle = '#1a1030';
    for (const m of ridges) {
        const rx = ((m.x - bgOffset * 0.6) % (W + 220) + (W + 220)) % (W + 220) - 110;
        ctx.beginPath();
        ctx.moveTo(rx, GROUND_Y);
        ctx.lineTo(rx + m.w * 0.3, GROUND_Y - m.h * 0.7);
        ctx.lineTo(rx + m.w * 0.55, GROUND_Y - m.h);
        ctx.lineTo(rx + m.w * 0.8, GROUND_Y - m.h * 0.55);
        ctx.lineTo(rx + m.w, GROUND_Y);
        ctx.closePath();
        ctx.fill();
    }
    // cumes proximos com neon
    ctx.fillStyle = '#2a1850';
    for (let i = 0; i < 6; i++) {
        const baseX = i * 220 + 80;
        const rx = ((baseX - bgOffset * 1.1) % (W + 260) + (W + 260)) % (W + 260) - 130;
        const h = 55 + (i % 3) * 18;
        ctx.beginPath();
        ctx.moveTo(rx, GROUND_Y);
        ctx.lineTo(rx + 60, GROUND_Y - h);
        ctx.lineTo(rx + 120, GROUND_Y - h * 0.5);
        ctx.lineTo(rx + 200, GROUND_Y);
        ctx.closePath();
        ctx.fill();
        // brilho neon na crista
        ctx.strokeStyle = 'rgba(170, 90, 220, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rx + 60, GROUND_Y - h);
        ctx.lineTo(rx + 120, GROUND_Y - h * 0.5);
        ctx.stroke();
    }

    // chao - superficie lunar / metalica
    const ground = ctx.createLinearGradient(0, GROUND_Y, 0, H);
    ground.addColorStop(0, '#3a2858');
    ground.addColorStop(1, '#0a0418');
    ctx.fillStyle = ground;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    // crista superior em neon
    ctx.fillStyle = '#8855dd';
    ctx.fillRect(0, GROUND_Y, W, 2);
    ctx.fillStyle = 'rgba(190, 120, 255, 0.5)';
    ctx.fillRect(0, GROUND_Y + 2, W, 1);

    // padrao de placas de tile no chao
    ctx.fillStyle = '#2a1c44';
    const tileOff = ((bgOffset * 1.8) % 48 + 48) % 48;
    for (let x = -tileOff; x < W; x += 48) {
        ctx.fillRect(x, GROUND_Y + 8, 32, 2);
        ctx.fillRect(x, GROUND_Y + 22, 32, 2);
    }
    // pontos de luz no chao
    ctx.fillStyle = '#66ddff';
    const dotOff = ((bgOffset * 1.8) % 96 + 96) % 96;
    for (let x = -dotOff; x < W; x += 96) {
        ctx.fillRect(x + 14, GROUND_Y + 14, 2, 2);
    }
}

// ------------------------------------------------------------
// Collision helper
// ------------------------------------------------------------
function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ------------------------------------------------------------
// Game state
// ------------------------------------------------------------
const game = {
    state: 'menu', // menu | playing | gameover
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

    // spawn enemies
    game.enemySpawnTimer -= dt;
    if (game.enemySpawnTimer <= 0 && enemies.length < 5) {
        const fromLeft = Math.random() < 0.5;
        enemies.push(new Enemy(fromLeft ? -30 : W + 30));
        game.enemySpawnTimer = 1.8 + Math.random() * 1.5;
    }

    for (const b of bullets) b.update(dt);
    for (const e of enemies) e.update(dt);
    for (const p of particles) p.update(dt);

    // bullet vs enemy
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

    // enemy bullet vs player
    for (const b of bullets) {
        if (b.dead || !b.fromEnemy) continue;
        if (aabb(b.rect, player.rect)) {
            b.dead = true;
            player.takeDamage();
        }
    }

    // enemy body vs player
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

    if (assetsFailed) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, H - 28, W, 28);
        ctx.fillStyle = '#ffbbbb';
        ctx.font = '14px monospace';
        ctx.fillText('Sprites nao encontrados em assets/ - usando graficos de fallback. Veja assets/README.md', 10, H - 10);
    }
}

// ------------------------------------------------------------
// Main loop
// ------------------------------------------------------------
let lastTime = performance.now();
function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    update(dt);
    render(dt);
    requestAnimationFrame(loop);
}

// ------------------------------------------------------------
// Wiring
// ------------------------------------------------------------
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

loadAssets().then(() => {
    requestAnimationFrame(loop);
});
