const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = 800;
canvas.height = 600;

// --- Input ---
const keys = {};
window.addEventListener("keydown", (e) => {
    keys[e.key] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
    }
});
window.addEventListener("keyup", (e) => (keys[e.key] = false));

// --- Game state ---
let score = 0;
let lives = 3;
let gameOver = false;
let invincibleTimer = 0;
let shootCooldown = 0;
const bullets = [];
const ufos = [];
const particles = [];
let ufoSpawnTimer = 0;
let ufoSpawnInterval = 120; // frames between spawns

// --- Ship ---
const ship = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    angle: -Math.PI / 2,
    radius: 15,
    vx: 0,
    vy: 0,
    thrust: 0.12,
    friction: 0.99,
    rotSpeed: 0.05,
    thrusting: false,
};

// --- Helper functions ---
function wrap(obj) {
    if (obj.x < -20) obj.x = canvas.width + 20;
    if (obj.x > canvas.width + 20) obj.x = -20;
    if (obj.y < -20) obj.y = canvas.height + 20;
    if (obj.y > canvas.height + 20) obj.y = -20;
}

function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function spawnUfo() {
    const edge = Math.floor(Math.random() * 4);
    let x, y, vx, vy;
    const speed = 1 + Math.random() * 1.5 + score / 500;

    switch (edge) {
        case 0: x = -20; y = Math.random() * canvas.height; break;
        case 1: x = canvas.width + 20; y = Math.random() * canvas.height; break;
        case 2: x = Math.random() * canvas.width; y = -20; break;
        case 3: x = Math.random() * canvas.width; y = canvas.height + 20; break;
    }

    // Aim roughly toward center with some randomness
    const angle = Math.atan2(canvas.height / 2 - y + (Math.random() - 0.5) * 300,
                              canvas.width / 2 - x + (Math.random() - 0.5) * 300);
    vx = Math.cos(angle) * speed;
    vy = Math.sin(angle) * speed;

    const size = Math.random() < 0.3 ? 12 : 20; // small or large UFO

    ufos.push({ x, y, vx, vy, radius: size, shootTimer: 60 + Math.floor(Math.random() * 60) });
}

function spawnParticles(x, y, count, color) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 3;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 20 + Math.floor(Math.random() * 20),
            color,
        });
    }
}

function resetShip() {
    ship.x = canvas.width / 2;
    ship.y = canvas.height / 2;
    ship.vx = 0;
    ship.vy = 0;
    ship.angle = -Math.PI / 2;
    invincibleTimer = 90;
}

// --- Update ---
function update() {
    if (gameOver) {
        if (keys[" "]) {
            // Restart
            score = 0;
            lives = 3;
            gameOver = false;
            bullets.length = 0;
            ufos.length = 0;
            particles.length = 0;
            ufoSpawnInterval = 120;
            resetShip();
        }
        return;
    }

    // Ship rotation
    if (keys["ArrowLeft"]) ship.angle -= ship.rotSpeed;
    if (keys["ArrowRight"]) ship.angle += ship.rotSpeed;

    // Ship thrust
    ship.thrusting = !!keys["ArrowUp"];
    if (ship.thrusting) {
        ship.vx += Math.cos(ship.angle) * ship.thrust;
        ship.vy += Math.sin(ship.angle) * ship.thrust;
    }

    // Ship movement
    ship.vx *= ship.friction;
    ship.vy *= ship.friction;
    ship.x += ship.vx;
    ship.y += ship.vy;
    wrap(ship);

    // Invincibility
    if (invincibleTimer > 0) invincibleTimer--;

    // Shooting
    if (shootCooldown > 0) shootCooldown--;
    if (keys[" "] && shootCooldown === 0) {
        const speed = 4.5;
        bullets.push({
            x: ship.x + Math.cos(ship.angle) * ship.radius,
            y: ship.y + Math.sin(ship.angle) * ship.radius,
            vx: Math.cos(ship.angle) * speed + ship.vx * 0.3,
            vy: Math.sin(ship.angle) * speed + ship.vy * 0.3,
            life: 90,
            fromPlayer: true,
        });
        shootCooldown = 10;
    }

    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;
        b.life--;
        wrap(b);
        if (b.life <= 0) bullets.splice(i, 1);
    }

    // Spawn UFOs
    ufoSpawnTimer++;
    if (ufoSpawnTimer >= ufoSpawnInterval) {
        spawnUfo();
        ufoSpawnTimer = 0;
        // Gradually increase difficulty
        if (ufoSpawnInterval > 40) ufoSpawnInterval -= 1;
    }

    // Update UFOs
    for (let i = ufos.length - 1; i >= 0; i--) {
        const u = ufos[i];
        u.x += u.vx;
        u.y += u.vy;

        // UFO shooting
        u.shootTimer--;
        if (u.shootTimer <= 0) {
            const angle = Math.atan2(ship.y - u.y, ship.x - u.x) + (Math.random() - 0.5) * 0.5;
            const speed = 2.5;
            bullets.push({
                x: u.x,
                y: u.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 120,
                fromPlayer: false,
            });
            u.shootTimer = 50 + Math.floor(Math.random() * 40);
        }

        // Remove if off screen for too long
        if (u.x < -60 || u.x > canvas.width + 60 || u.y < -60 || u.y > canvas.height + 60) {
            ufos.splice(i, 1);
            continue;
        }

        // Bullet-UFO collision
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (b.fromPlayer && dist(b, u) < u.radius + 3) {
                score += u.radius === 12 ? 200 : 100;
                spawnParticles(u.x, u.y, 12, "#0f0");
                bullets.splice(j, 1);
                ufos.splice(i, 1);
                break;
            }
        }
    }

    // Ship-UFO collision
    if (invincibleTimer === 0) {
        for (let i = ufos.length - 1; i >= 0; i--) {
            if (dist(ship, ufos[i]) < ship.radius + ufos[i].radius) {
                spawnParticles(ship.x, ship.y, 20, "#f80");
                spawnParticles(ufos[i].x, ufos[i].y, 12, "#0f0");
                ufos.splice(i, 1);
                lives--;
                if (lives <= 0) { gameOver = true; return; }
                resetShip();
                break;
            }
        }
    }

    // Ship-enemy bullet collision
    if (invincibleTimer === 0) {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            if (!b.fromPlayer && dist(ship, b) < ship.radius + 3) {
                spawnParticles(ship.x, ship.y, 20, "#f80");
                bullets.splice(i, 1);
                lives--;
                if (lives <= 0) { gameOver = true; return; }
                resetShip();
                break;
            }
        }
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

// --- Draw ---
function drawShip() {
    if (invincibleTimer > 0 && Math.floor(invincibleTimer / 4) % 2 === 0) return;

    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);

    // Engine glow
    if (ship.thrusting) {
        const flicker = Math.random() * 8;
        // Outer glow
        ctx.fillStyle = "rgba(255, 100, 0, 0.15)";
        ctx.beginPath();
        ctx.arc(-10, 0, 16 + flicker, 0, Math.PI * 2);
        ctx.fill();
        // Main flame
        ctx.fillStyle = "#f80";
        ctx.beginPath();
        ctx.moveTo(-10, -5);
        ctx.lineTo(-22 - flicker, 0);
        ctx.lineTo(-10, 5);
        ctx.closePath();
        ctx.fill();
        // Inner flame
        ctx.fillStyle = "#ff0";
        ctx.beginPath();
        ctx.moveTo(-10, -3);
        ctx.lineTo(-16 - flicker * 0.5, 0);
        ctx.lineTo(-10, 3);
        ctx.closePath();
        ctx.fill();
    }

    // Wing struts
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(2, -3);
    ctx.lineTo(-10, -12);
    ctx.moveTo(2, 3);
    ctx.lineTo(-10, 12);
    ctx.stroke();

    // Main hull
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(8, -5);
    ctx.lineTo(-6, -6);
    ctx.lineTo(-12, -4);
    ctx.lineTo(-12, 4);
    ctx.lineTo(-6, 6);
    ctx.lineTo(8, 5);
    ctx.closePath();
    ctx.stroke();

    // Wings
    ctx.strokeStyle = "#aaf";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, -5);
    ctx.lineTo(-4, -14);
    ctx.lineTo(-14, -12);
    ctx.lineTo(-10, -5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(4, 5);
    ctx.lineTo(-4, 14);
    ctx.lineTo(-14, 12);
    ctx.lineTo(-10, 5);
    ctx.stroke();

    // Cockpit
    ctx.fillStyle = "rgba(100, 180, 255, 0.5)";
    ctx.beginPath();
    ctx.ellipse(8, 0, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#6bf";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
}

function drawUfo(u) {
    ctx.save();
    ctx.translate(u.x, u.y);
    const s = u.radius;

    ctx.strokeStyle = "#0f0";
    ctx.lineWidth = 2;

    // Saucer body
    ctx.beginPath();
    ctx.ellipse(0, 0, s, s * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Dome
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.2, s * 0.5, s * 0.35, 0, Math.PI, 0);
    ctx.stroke();

    // Bottom line
    ctx.beginPath();
    ctx.moveTo(-s * 0.6, s * 0.2);
    ctx.lineTo(s * 0.6, s * 0.2);
    ctx.stroke();

    ctx.restore();
}

function draw() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Stars (static background)
    ctx.fillStyle = "#555";
    for (let i = 0; i < 80; i++) {
        // Seeded positions based on index
        const sx = (i * 137.5 + 50) % canvas.width;
        const sy = (i * 241.3 + 30) % canvas.height;
        ctx.fillRect(sx, sy, 1.5, 1.5);
    }

    if (!gameOver) {
        drawShip();
    }

    // Bullets
    for (const b of bullets) {
        ctx.fillStyle = b.fromPlayer ? "#ff0" : "#f44";
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // UFOs
    for (const u of ufos) {
        drawUfo(u);
    }

    // Particles
    for (const p of particles) {
        const alpha = p.life / 40;
        ctx.fillStyle = p.color + Math.floor(alpha * 255).toString(16).padStart(2, "0");
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // HUD
    ctx.fillStyle = "#fff";
    ctx.font = "20px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`Score: ${score}`, 15, 30);
    ctx.textAlign = "right";
    ctx.fillText(`Lives: ${lives}`, canvas.width - 15, 30);

    if (gameOver) {
        ctx.fillStyle = "#fff";
        ctx.font = "48px monospace";
        ctx.textAlign = "center";
        ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 20);
        ctx.font = "20px monospace";
        ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2 + 20);
        ctx.fillText("Press SPACE to restart", canvas.width / 2, canvas.height / 2 + 55);
    }
}

// --- Game loop ---
function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

loop();
