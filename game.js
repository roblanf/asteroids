const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", resize);

// --- Input ---
const keys = {};
let lastKeyPress = null;
window.addEventListener("keydown", (e) => {
    keys[e.key] = true;
    lastKeyPress = e.key;
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

// --- Wave system ---
let wave = 0;
let ufosToSpawn = 0;
let ufosAlive = 0;
let ufoSpawnTimer = 0;
let waveState = "playing"; // "playing", "upgrade", "waveIntro"
let waveIntroTimer = 0;
let upgradeChoices = [];
let selectedUpgrade = 0;
let upgradePickCooldown = 0;

// --- Upgrades ---
const upgrades = {
    extraBullets: 0,   // +1 bullet per shot each level
    guidedMissiles: false,
    rapidFire: 0,      // each level reduces cooldown
    rearGun: false,
    piercing: false,
    extraLife: 0,       // just adds a life when picked
    shield: false,
};

const UPGRADE_DEFS = [
    {
        id: "extraBullets",
        name: "SPREAD SHOT",
        desc: "Fire additional bullets in a spread pattern",
        icon: ">>>",
        color: "#ff0",
        apply() { upgrades.extraBullets++; },
        canOffer() { return upgrades.extraBullets < 4; },
    },
    {
        id: "guidedMissiles",
        name: "GUIDED MISSILES",
        desc: "Bullets home in on the nearest UFO",
        icon: "~>",
        color: "#f60",
        apply() { upgrades.guidedMissiles = true; },
        canOffer() { return !upgrades.guidedMissiles; },
    },
    {
        id: "rapidFire",
        name: "RAPID FIRE",
        desc: "Increase fire rate",
        icon: "!!!",
        color: "#f44",
        apply() { upgrades.rapidFire++; },
        canOffer() { return upgrades.rapidFire < 3; },
    },
    {
        id: "rearGun",
        name: "REAR GUN",
        desc: "Fire an extra bullet behind your ship",
        icon: "<=>",
        color: "#a6f",
        apply() { upgrades.rearGun = true; },
        canOffer() { return !upgrades.rearGun; },
    },
    {
        id: "piercing",
        name: "PIERCING SHOTS",
        desc: "Bullets pass through enemies and keep going",
        icon: "-->",
        color: "#0ff",
        apply() { upgrades.piercing = true; },
        canOffer() { return !upgrades.piercing; },
    },
    {
        id: "extraLife",
        name: "EXTRA LIFE",
        desc: "Gain an additional life",
        icon: "+1",
        color: "#0f0",
        apply() { lives++; },
        canOffer() { return true; },
    },
    {
        id: "shield",
        name: "SHIELD",
        desc: "Absorb one hit without losing a life",
        icon: "(O)",
        color: "#6bf",
        apply() { upgrades.shield = true; },
        canOffer() { return !upgrades.shield; },
    },
];

// --- Ship ---
const ship = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    angle: -Math.PI / 2,
    radius: 15,
    vx: 0,
    vy: 0,
    thrust: 0.12,
    friction: 0.995,
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
    let x, y;
    const speed = 1 + Math.random() * 1.5 + wave * 0.15;

    switch (edge) {
        case 0: x = -20; y = Math.random() * canvas.height; break;
        case 1: x = canvas.width + 20; y = Math.random() * canvas.height; break;
        case 2: x = Math.random() * canvas.width; y = -20; break;
        case 3: x = Math.random() * canvas.width; y = canvas.height + 20; break;
    }

    const angle = Math.atan2(canvas.height / 2 - y + (Math.random() - 0.5) * 300,
                              canvas.width / 2 - x + (Math.random() - 0.5) * 300);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const size = Math.random() < 0.2 + wave * 0.03 ? 12 : 20;

    ufos.push({ x, y, vx, vy, radius: size, shootTimer: 120 + Math.floor(Math.random() * 120), bobTimer: Math.random() * Math.PI * 2 });
    ufosAlive++;
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

function startWave() {
    wave++;
    ufosToSpawn = 3 + wave * 2;
    ufosAlive = 0;
    ufoSpawnTimer = 0;
    waveState = "waveIntro";
    waveIntroTimer = 120;
    // Clear leftover enemy bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        if (!bullets[i].fromPlayer) bullets.splice(i, 1);
    }
}

function startUpgradeSelection() {
    waveState = "upgrade";
    selectedUpgrade = 0;
    upgradePickCooldown = 15;
    lastKeyPress = null;

    // Pick 3 random upgrades that can still be offered
    const available = UPGRADE_DEFS.filter(u => u.canOffer());
    upgradeChoices = [];
    while (upgradeChoices.length < 3 && available.length > 0) {
        const idx = Math.floor(Math.random() * available.length);
        upgradeChoices.push(available[idx]);
        available.splice(idx, 1);
    }
}

function fireBullets() {
    const baseSpeed = 4.5;
    const cooldown = Math.max(3, 10 - upgrades.rapidFire * 2);
    shootCooldown = cooldown;

    const spreadCount = 1 + upgrades.extraBullets;
    const totalSpread = upgrades.extraBullets * 0.12; // radians spread

    for (let i = 0; i < spreadCount; i++) {
        let angle = ship.angle;
        if (spreadCount > 1) {
            angle += -totalSpread / 2 + (i / (spreadCount - 1)) * totalSpread;
        }
        bullets.push({
            x: ship.x + Math.cos(angle) * ship.radius,
            y: ship.y + Math.sin(angle) * ship.radius,
            vx: Math.cos(angle) * baseSpeed + ship.vx * 0.3,
            vy: Math.sin(angle) * baseSpeed + ship.vy * 0.3,
            life: 90,
            fromPlayer: true,
            guided: upgrades.guidedMissiles,
            piercing: upgrades.piercing,
        });
    }

    // Rear gun
    if (upgrades.rearGun) {
        const rearAngle = ship.angle + Math.PI;
        bullets.push({
            x: ship.x + Math.cos(rearAngle) * ship.radius,
            y: ship.y + Math.sin(rearAngle) * ship.radius,
            vx: Math.cos(rearAngle) * baseSpeed * 0.8,
            vy: Math.sin(rearAngle) * baseSpeed * 0.8,
            life: 60,
            fromPlayer: true,
            guided: upgrades.guidedMissiles,
            piercing: upgrades.piercing,
        });
    }
}

function findNearestUfo(x, y) {
    let nearest = null;
    let nearestDist = Infinity;
    for (const u of ufos) {
        const d = dist({ x, y }, u);
        if (d < nearestDist) {
            nearestDist = d;
            nearest = u;
        }
    }
    return nearest;
}

function takeDamage() {
    if (upgrades.shield) {
        upgrades.shield = false;
        spawnParticles(ship.x, ship.y, 15, "#6bf");
        invincibleTimer = 45;
        return;
    }
    spawnParticles(ship.x, ship.y, 20, "#f80");
    lives--;
    if (lives <= 0) { gameOver = true; return; }
    resetShip();
}

function resetGame() {
    score = 0;
    lives = 3;
    wave = 0;
    gameOver = false;
    bullets.length = 0;
    ufos.length = 0;
    particles.length = 0;
    upgrades.extraBullets = 0;
    upgrades.guidedMissiles = false;
    upgrades.rapidFire = 0;
    upgrades.rearGun = false;
    upgrades.piercing = false;
    upgrades.extraLife = 0;
    upgrades.shield = false;
    resetShip();
    startWave();
}

// --- Update ---
function update() {
    if (gameOver) {
        if (keys[" "]) {
            resetGame();
        }
        return;
    }

    // Wave intro countdown
    if (waveState === "waveIntro") {
        waveIntroTimer--;
        if (waveIntroTimer <= 0) {
            waveState = "playing";
        }
        // Still update particles during intro
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
            if (p.life <= 0) particles.splice(i, 1);
        }
        return;
    }

    // Upgrade selection screen
    if (waveState === "upgrade") {
        if (upgradePickCooldown > 0) upgradePickCooldown--;
        if (upgradePickCooldown === 0 && upgradeChoices.length > 0) {
            if (lastKeyPress === "ArrowLeft" || lastKeyPress === "ArrowUp") {
                selectedUpgrade = (selectedUpgrade - 1 + upgradeChoices.length) % upgradeChoices.length;
                lastKeyPress = null;
            }
            if (lastKeyPress === "ArrowRight" || lastKeyPress === "ArrowDown") {
                selectedUpgrade = (selectedUpgrade + 1) % upgradeChoices.length;
                lastKeyPress = null;
            }
            if (lastKeyPress === " " || lastKeyPress === "Enter") {
                upgradeChoices[selectedUpgrade].apply();
                spawnParticles(canvas.width / 2, canvas.height / 2, 30, upgradeChoices[selectedUpgrade].color);
                lastKeyPress = null;
                startWave();
            }
        }
        return;
    }

    // --- Playing state ---

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
        fireBullets();
    }

    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];

        // Guided missile homing
        if (b.guided && b.fromPlayer && ufos.length > 0) {
            const target = findNearestUfo(b.x, b.y);
            if (target) {
                const desired = Math.atan2(target.y - b.y, target.x - b.x);
                const current = Math.atan2(b.vy, b.vx);
                let diff = desired - current;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                const turnRate = 0.06;
                const newAngle = current + Math.sign(diff) * Math.min(Math.abs(diff), turnRate);
                const speed = Math.hypot(b.vx, b.vy);
                b.vx = Math.cos(newAngle) * speed;
                b.vy = Math.sin(newAngle) * speed;
            }
        }

        b.x += b.vx;
        b.y += b.vy;
        b.life--;
        wrap(b);
        if (b.life <= 0) bullets.splice(i, 1);
    }

    // Spawn UFOs for this wave
    if (ufosToSpawn > 0) {
        ufoSpawnTimer++;
        const spawnRate = Math.max(20, 60 - wave * 3);
        if (ufoSpawnTimer >= spawnRate) {
            spawnUfo();
            ufosToSpawn--;
            ufoSpawnTimer = 0;
        }
    }

    // Check wave complete
    if (ufosToSpawn === 0 && ufosAlive === 0 && waveState === "playing") {
        startUpgradeSelection();
        return;
    }

    // Update UFOs
    for (let i = ufos.length - 1; i >= 0; i--) {
        const u = ufos[i];
        u.x += u.vx;
        u.y += u.vy;
        u.bobTimer += 0.06;

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
                guided: false,
                piercing: false,
            });
            u.shootTimer = Math.max(50, 100 - wave * 2) + Math.floor(Math.random() * 80);
        }

        // Remove if off screen for too long
        if (u.x < -60 || u.x > canvas.width + 60 || u.y < -60 || u.y > canvas.height + 60) {
            ufos.splice(i, 1);
            ufosAlive--;
            continue;
        }

        // Bullet-UFO collision
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (b.fromPlayer && dist(b, u) < u.radius + 3) {
                score += u.radius === 12 ? 200 : 100;
                spawnParticles(u.x, u.y, 12, "#0f0");
                if (!b.piercing) {
                    bullets.splice(j, 1);
                }
                ufos.splice(i, 1);
                ufosAlive--;
                break;
            }
        }
    }

    // Ship-UFO collision
    if (invincibleTimer === 0) {
        for (let i = ufos.length - 1; i >= 0; i--) {
            if (dist(ship, ufos[i]) < ship.radius + ufos[i].radius) {
                spawnParticles(ufos[i].x, ufos[i].y, 12, "#0f0");
                ufos.splice(i, 1);
                ufosAlive--;
                takeDamage();
                if (gameOver) return;
                break;
            }
        }
    }

    // Ship-enemy bullet collision
    if (invincibleTimer === 0) {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            if (!b.fromPlayer && dist(ship, b) < ship.radius + 3) {
                bullets.splice(i, 1);
                takeDamage();
                if (gameOver) return;
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

    // Shield bubble
    if (upgrades.shield) {
        ctx.strokeStyle = "rgba(100, 180, 255, 0.3)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(100, 180, 255, 0.05)";
        ctx.fill();
    }

    // Engine glow
    if (ship.thrusting) {
        const flicker = Math.random() * 8;
        ctx.fillStyle = "rgba(255, 100, 0, 0.15)";
        ctx.beginPath();
        ctx.arc(-10, 0, 16 + flicker, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f80";
        ctx.beginPath();
        ctx.moveTo(-10, -5);
        ctx.lineTo(-22 - flicker, 0);
        ctx.lineTo(-10, 5);
        ctx.closePath();
        ctx.fill();
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
    const bob = Math.sin(u.bobTimer) * 2;

    const beamAlpha = 0.06 + Math.sin(u.bobTimer * 2) * 0.03;
    const beamGrad = ctx.createRadialGradient(0, s * 0.5, 0, 0, s * 0.5, s * 1.5);
    beamGrad.addColorStop(0, `rgba(0, 255, 100, ${beamAlpha})`);
    beamGrad.addColorStop(1, "rgba(0, 255, 100, 0)");
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.arc(0, s * 0.5, s * 1.5, 0, Math.PI * 2);
    ctx.fill();

    const glowGrad = ctx.createRadialGradient(0, bob, s * 0.3, 0, bob, s * 1.3);
    glowGrad.addColorStop(0, "rgba(0, 255, 150, 0.08)");
    glowGrad.addColorStop(1, "rgba(0, 255, 150, 0)");
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, bob, s * 1.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(0, 80, 40, 0.6)";
    ctx.beginPath();
    ctx.ellipse(0, bob + s * 0.1, s * 0.7, s * 0.2, 0, 0, Math.PI);
    ctx.fill();
    ctx.strokeStyle = "#0a6";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "rgba(0, 60, 30, 0.7)";
    ctx.beginPath();
    ctx.ellipse(0, bob, s, s * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0f0";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = "rgba(100, 255, 180, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, bob - s * 0.05, s * 0.85, s * 0.28, 0, Math.PI + 0.3, -0.3);
    ctx.stroke();

    const domeGrad = ctx.createLinearGradient(0, bob - s * 0.6, 0, bob - s * 0.1);
    domeGrad.addColorStop(0, "rgba(100, 255, 200, 0.4)");
    domeGrad.addColorStop(1, "rgba(0, 100, 50, 0.2)");
    ctx.fillStyle = domeGrad;
    ctx.beginPath();
    ctx.ellipse(0, bob - s * 0.2, s * 0.45, s * 0.38, 0, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = "#0f0";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = "rgba(180, 255, 220, 0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(-s * 0.1, bob - s * 0.35, s * 0.15, s * 0.1, -0.3, Math.PI, 0);
    ctx.stroke();

    const numLights = u.radius === 12 ? 5 : 8;
    for (let i = 0; i < numLights; i++) {
        const lightAngle = u.bobTimer * 1.5 + (i / numLights) * Math.PI * 2;
        const lx = Math.cos(lightAngle) * s * 0.8;
        const ly = Math.sin(lightAngle) * s * 0.25 + bob;
        const brightness = 0.4 + Math.sin(lightAngle + u.bobTimer) * 0.4;

        ctx.fillStyle = `rgba(0, 255, 120, ${brightness * 0.3})`;
        ctx.beginPath();
        ctx.arc(lx, ly, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(150, 255, 200, ${brightness})`;
        ctx.beginPath();
        ctx.arc(lx, ly, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawBullet(b) {
    if (b.fromPlayer && b.guided) {
        // Guided missile look
        ctx.save();
        ctx.translate(b.x, b.y);
        const angle = Math.atan2(b.vy, b.vx);
        ctx.rotate(angle);

        // Trail glow
        ctx.fillStyle = "rgba(255, 100, 0, 0.2)";
        ctx.beginPath();
        ctx.arc(-4, 0, 5, 0, Math.PI * 2);
        ctx.fill();

        // Missile body
        ctx.fillStyle = "#f80";
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(-3, -2.5);
        ctx.lineTo(-3, 2.5);
        ctx.closePath();
        ctx.fill();

        // Missile core
        ctx.fillStyle = "#ff0";
        ctx.beginPath();
        ctx.arc(2, 0, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    } else if (b.fromPlayer && b.piercing) {
        // Piercing shot — elongated cyan bolt
        ctx.save();
        ctx.translate(b.x, b.y);
        const angle = Math.atan2(b.vy, b.vx);
        ctx.rotate(angle);

        ctx.fillStyle = "rgba(0, 255, 255, 0.15)";
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#0ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.lineTo(6, 0);
        ctx.stroke();

        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    } else {
        // Normal bullet
        ctx.fillStyle = b.fromPlayer ? "#ff0" : "#f44";
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawUpgradeScreen() {
    // Dim background
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#fff";
    ctx.font = "36px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`WAVE ${wave} COMPLETE!`, canvas.width / 2, canvas.height * 0.2);

    ctx.font = "20px monospace";
    ctx.fillStyle = "#aaa";
    ctx.fillText("Choose an upgrade", canvas.width / 2, canvas.height * 0.2 + 40);

    const cardW = 180;
    const cardH = 200;
    const gap = 30;
    const totalW = upgradeChoices.length * cardW + (upgradeChoices.length - 1) * gap;
    const startX = (canvas.width - totalW) / 2;
    const cardY = canvas.height * 0.35;

    for (let i = 0; i < upgradeChoices.length; i++) {
        const u = upgradeChoices[i];
        const cx = startX + i * (cardW + gap);
        const isSelected = i === selectedUpgrade;

        // Card background
        ctx.fillStyle = isSelected ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.04)";
        ctx.strokeStyle = isSelected ? u.color : "#555";
        ctx.lineWidth = isSelected ? 3 : 1;
        ctx.beginPath();
        ctx.roundRect(cx, cardY, cardW, cardH, 10);
        ctx.fill();
        ctx.stroke();

        // Glow effect on selected
        if (isSelected) {
            ctx.shadowColor = u.color;
            ctx.shadowBlur = 20;
            ctx.strokeStyle = u.color;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Icon
        ctx.fillStyle = u.color;
        ctx.font = "28px monospace";
        ctx.textAlign = "center";
        ctx.fillText(u.icon, cx + cardW / 2, cardY + 50);

        // Name
        ctx.fillStyle = "#fff";
        ctx.font = "bold 14px monospace";
        ctx.fillText(u.name, cx + cardW / 2, cardY + 85);

        // Description (word wrap)
        ctx.fillStyle = "#aaa";
        ctx.font = "12px monospace";
        const words = u.desc.split(" ");
        let line = "";
        let lineY = cardY + 110;
        for (const word of words) {
            const test = line + word + " ";
            if (ctx.measureText(test).width > cardW - 20) {
                ctx.fillText(line.trim(), cx + cardW / 2, lineY);
                line = word + " ";
                lineY += 16;
            } else {
                line = test;
            }
        }
        ctx.fillText(line.trim(), cx + cardW / 2, lineY);
    }

    // Controls hint
    ctx.fillStyle = "#666";
    ctx.font = "14px monospace";
    ctx.textAlign = "center";
    ctx.fillText("< LEFT / RIGHT > to select, SPACE to confirm", canvas.width / 2, cardY + cardH + 50);
}

function draw() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Stars
    ctx.fillStyle = "#555";
    for (let i = 0; i < 80; i++) {
        const sx = (i * 137.5 + 50) % canvas.width;
        const sy = (i * 241.3 + 30) % canvas.height;
        ctx.fillRect(sx, sy, 1.5, 1.5);
    }

    if (!gameOver && waveState !== "upgrade") {
        drawShip();
    }

    // Bullets
    for (const b of bullets) {
        drawBullet(b);
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
    ctx.fillText(`Wave: ${wave}`, 15, 55);
    ctx.textAlign = "right";
    ctx.fillText(`Lives: ${lives}`, canvas.width - 15, 30);

    // Active upgrades display
    const activeUpgrades = [];
    if (upgrades.extraBullets > 0) activeUpgrades.push(`Spread x${1 + upgrades.extraBullets}`);
    if (upgrades.guidedMissiles) activeUpgrades.push("Guided");
    if (upgrades.rapidFire > 0) activeUpgrades.push(`Rapid x${upgrades.rapidFire}`);
    if (upgrades.rearGun) activeUpgrades.push("Rear Gun");
    if (upgrades.piercing) activeUpgrades.push("Piercing");
    if (upgrades.shield) activeUpgrades.push("Shield");
    if (activeUpgrades.length > 0) {
        ctx.fillStyle = "#888";
        ctx.font = "12px monospace";
        ctx.textAlign = "right";
        ctx.fillText(activeUpgrades.join(" | "), canvas.width - 15, 50);
    }

    // Wave intro
    if (waveState === "waveIntro") {
        ctx.fillStyle = "#fff";
        ctx.font = "48px monospace";
        ctx.textAlign = "center";
        const alpha = Math.min(1, waveIntroTimer / 30);
        ctx.globalAlpha = alpha;
        ctx.fillText(`WAVE ${wave}`, canvas.width / 2, canvas.height / 2);
        ctx.font = "20px monospace";
        ctx.fillText(`${3 + wave * 2} enemies incoming`, canvas.width / 2, canvas.height / 2 + 40);
        ctx.globalAlpha = 1;
    }

    // Upgrade selection
    if (waveState === "upgrade") {
        drawUpgradeScreen();
    }

    // Game over
    if (gameOver) {
        ctx.fillStyle = "#fff";
        ctx.font = "48px monospace";
        ctx.textAlign = "center";
        ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 20);
        ctx.font = "20px monospace";
        ctx.fillText(`Final Score: ${score}  |  Wave: ${wave}`, canvas.width / 2, canvas.height / 2 + 20);
        ctx.fillText("Press SPACE to restart", canvas.width / 2, canvas.height / 2 + 55);
    }
}

// --- Game loop ---
function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// Start first wave
startWave();
loop();
