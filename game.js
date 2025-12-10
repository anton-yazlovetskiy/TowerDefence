/* =========================================
   CONFIG & STATE
   ========================================= */
let CONFIG = {
    cols: 12, rows: 13,
    start: { x: 11, y: 0 }, end: { x: 0, y: 12 }
};

const PALETTE = {
    radar: '#2ecc71', blaster: '#f39c12', sniper: '#e74c3c', slow: '#3498db',
    tank: '#9b59b6', shooter: '#e84393', normal: '#f1c40f',
    laser: '#00ff00', enemyProj: '#ff0000'
};

/* TUNING */
const TOWERS_CONFIG = {
    // RADAR (Machine Gun) - Green
    radar1: { baseType: 'radar', tier: 1, color: PALETTE.radar, radius: 1.5, damage: 3,  speed: 1000, cost: 50,  cd: 6, hp: 150 }, 
    radar2: { baseType: 'radar', tier: 2, color: PALETTE.radar, radius: 3.5, damage: 8,  speed: 1000, cost: 150, cd: 12, hp: 300 },
    radar3: { baseType: 'radar', tier: 3, color: PALETTE.radar, radius: 8.5, damage: 70, speed: 1000, cost: 400, cd: 60, hp: 600 },
    
    // BLASTER (Cannon) - Orange
    blaster1: { baseType: 'blaster', tier: 1, color: PALETTE.blaster, radius: 1.5, damage: 20,  speed: 1000, cost: 100, cd: 25, hp: 200 },
    blaster2: { baseType: 'blaster', tier: 2, color: PALETTE.blaster, radius: 3.5, damage: 60,  speed: 1000, cost: 300, cd: 35, hp: 400 },
    blaster3: { baseType: 'blaster', tier: 3, color: PALETTE.blaster, radius: 8.5, damage: 300, speed: 1000, cost: 700, cd: 80, hp: 800 },
    
    // SNIPER (Triangle) - Red
    sniper1: { baseType: 'sniper', tier: 1, color: PALETTE.sniper, radius: 1.5, damage: 50,  speed: 1200, cost: 150,  cd: 55, hp: 100 },
    sniper2: { baseType: 'sniper', tier: 2, color: PALETTE.sniper, radius: 3.5, damage: 150, speed: 1500, cost: 450,  cd: 90,  hp: 200 },
    sniper3: { baseType: 'sniper', tier: 3, color: PALETTE.sniper, radius: 8.5, damage: 800, speed: 2000, cost: 1000, cd: 140, hp: 400 },
    
    // SLOW (Hexagon) - Blue
    slow1: { baseType: 'slow', tier: 1, color: PALETTE.slow, radius: 2.5, damage: 2, speed: 1000, cost: 100, cd: 20, hp: 200, slow: 0.85 },
    slow2: { baseType: 'slow', tier: 2, color: PALETTE.slow, radius: 3.5, damage: 5, speed: 1000, cost: 250, cd: 20, hp: 400, slow: 0.70 },
    slow3: { baseType: 'slow', tier: 3, color: PALETTE.slow, radius: 8.5, damage: 15, speed: 1000, cost: 600, cd: 40, hp: 800, slow: 0.50 }
};

const STATE = {
    lives: 100, money: 450, victoryPoints: 0, wave: 1, theme: 'dark', cellSize: 0,
    grid: [], path: [], 
    towers: [], enemies: [], projectiles: [], particles: [],
    isWaveActive: false, enemiesToSpawn: 0, spawnTimer: 0,
    dragData: null, hoverPos: null, selectedTower: null,
    autoStart: false, isPaused: false, 
    diffMultiplier: 1, 
    gameSpeed: 1, 
    gridSize: 'normal'
};

function getCSSVar(name) { return getComputedStyle(document.body).getPropertyValue(name).trim(); }

/* =========================================
   MAZE & ENTITIES
   ========================================= */
class Maze {
    constructor() { this.grid = []; }
    generateZigZag() {
        this.grid = [];
        for(let y=0; y<CONFIG.rows; y++) this.grid.push(new Array(CONFIG.cols).fill(1));
        
        let pathPoints = [];
        for (let y = 0; y < CONFIG.rows; y++) {
            if (y % 2 === 0) {
                const goingLeft = (y/2) % 2 === 0;
                if (goingLeft) {
                    for(let x = CONFIG.cols - 1; x >= 0; x--) { this.grid[y][x] = 0; pathPoints.push({x, y}); }
                    if (y < CONFIG.rows - 1) { this.grid[y+1][0] = 0; pathPoints.push({x: 0, y: y+1}); }
                } else {
                    for(let x = 0; x < CONFIG.cols; x++) { this.grid[y][x] = 0; pathPoints.push({x, y}); }
                    if (y < CONFIG.rows - 1) { this.grid[y+1][CONFIG.cols-1] = 0; pathPoints.push({x: CONFIG.cols-1, y: y+1}); }
                }
            }
        }
        STATE.grid = this.grid; STATE.path = pathPoints;
        STATE.towers = []; STATE.enemies = []; STATE.projectiles = []; STATE.particles = []; STATE.selectedTower = null;
    }
}

class Enemy {
    constructor(wave, type = 'normal') {
        this.type = type; this.pathIndex = 0; this.progress = 0; this.alive = true;
        let hpMult = 1; if (type === 'tank') hpMult = 5.0; else if (type === 'shooter') hpMult = 1.2;
        
        const diffFactor = STATE.diffMultiplier * 5;
        this.hp = (20 + (wave * 12)) * hpMult * diffFactor; 
        this.maxHp = this.hp;
        
        this.baseSpeed = 0.06 + (wave * 0.003); 
        this.attackCooldown = 0; this.attackRange = 3.5; this.attackDmg = 5 + wave;
        this.hitSlowTimer = 0; 

        if (STATE.path && STATE.path.length > 0) {
            const p = STATE.path[0]; this.x = p.x; this.y = p.y;
        } else {
            this.x = 0; this.y = 0; this.alive = false; 
        }
    }

    update() {
        if (!this.alive) return;
        let currentSpeed = this.baseSpeed;
        
        let slowFactor = 1.0;
        STATE.towers.forEach(t => {
            if (t.stats.slow > 0) {
                const dist = Math.sqrt((t.x - this.x)**2 + (t.y - this.y)**2);
                if (dist <= t.stats.radius) if (t.stats.slow < slowFactor) slowFactor = t.stats.slow;
            }
        });
        currentSpeed *= slowFactor;

        if (this.hitSlowTimer > 0) {
            currentSpeed *= 0.6; 
            this.hitSlowTimer--;
        }

        if (this.type === 'shooter') {
            if (this.attackCooldown > 0) this.attackCooldown--;
            const target = this.findTargetTower();
            if (target && this.attackCooldown <= 0) {
                STATE.projectiles.push(new Projectile(this.x, this.y, target, this.attackDmg, PALETTE.enemyProj, 'enemy'));
                this.attackCooldown = 80;
            }
        }
        this.progress += currentSpeed;
        if (this.progress >= 1.0) {
            this.progress = 0; this.pathIndex++;
            if (STATE.path && this.pathIndex >= STATE.path.length - 1) { this.teleportLoop(); return; }
        }
        if (STATE.path && STATE.path[this.pathIndex]) {
            const p = STATE.path[this.pathIndex]; const next = STATE.path[this.pathIndex + 1] || p;
            this.x = p.x + (next.x - p.x) * this.progress; this.y = p.y + (next.y - p.y) * this.progress;
        }
    }

    findTargetTower() {
        for (const t of STATE.towers) {
            const dist = Math.sqrt((t.x - this.x)**2 + (t.y - this.y)**2);
            if (dist <= this.attackRange) return t;
        }
        return null;
    }

    teleportLoop() {
        STATE.lives--; updateUI();
        if (STATE.lives <= 0) { this.alive = false; endGame("Base Destroyed!"); return; }
        this.pathIndex = 0; this.progress = 0;
        const p = STATE.path[0]; this.x = p.x; this.y = p.y;
    }

    takeDamage(amt) {
        this.hp -= amt;
        this.hitSlowTimer = 70; 
        if (this.hp <= 0) {
            this.alive = false; this.spawnParticles();
            let money = 30;
            if (this.type === 'tank') { money = 80; STATE.victoryPoints += 10; }
            if (this.type === 'shooter') { money = 50; STATE.lives++; } 
            STATE.money += money; updateUI(); checkWin();
        }
    }

    spawnParticles() {
        const color = (this.type === 'tank') ? PALETTE.tank : (this.type === 'shooter' ? PALETTE.shooter : PALETTE.normal);
        for(let i=0; i<6; i++) STATE.particles.push(new Particle(this.x, this.y, color));
    }

    drawIcon(ctx, cs, cx, cy, radius) {
        ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 2; ctx.beginPath();
        if (this.type === 'tank') {
            const r = radius * 0.5; ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy - r);
            ctx.bezierCurveTo(cx + r, cy, cx, cy + r, cx, cy + r); ctx.bezierCurveTo(cx, cy + r, cx - r, cy, cx - r, cy - r); ctx.stroke();
        } else if (this.type === 'shooter') {
            const r = radius * 0.5; ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
        } else {
            ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.arc(cx, cy, radius * 0.3, 0, Math.PI*2); ctx.fill();
        }
    }
}

class Projectile {
    constructor(x, y, target, damage, color, source = 'tower') {
        this.x = x; this.y = y; this.target = target;
        this.damage = damage; 
        this.color = color;
        // Enemy projectiles slower
        this.speed = (source === 'tower') ? 0.8 : 0.3;
        this.alive = true; this.source = source;
    }
    update() {
        let targetExists = false;
        if (this.source === 'tower') targetExists = this.target.alive;
        else targetExists = STATE.towers.includes(this.target);
        
        if (!targetExists) { this.alive = false; return; }
        
        const dx = this.target.x - this.x; const dy = this.target.y - this.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < this.speed) {
            this.target.takeDamage(this.damage); this.alive = false; 
            STATE.particles.push(new Particle(this.x, this.y, this.color));
        } else { 
            this.x += (dx/dist)*this.speed; 
            this.y += (dy/dist)*this.speed; 
        }
    }
    
    draw(ctx, cs) {
        if (this.source === 'tower') {
            // Laser
            const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            const len = 0.5 * cs; 
            // Thickness based on damage (visual punch)
            const width = Math.min(6, Math.max(2, this.damage / 20));
            
            ctx.strokeStyle = PALETTE.laser;
            ctx.lineWidth = width;
            ctx.beginPath();
            const px = (this.x + 0.5) * cs;
            const py = (this.y + 0.5) * cs;
            ctx.moveTo(px, py);
            ctx.lineTo(px - Math.cos(angle) * len, py - Math.sin(angle) * len);
            ctx.stroke();
        } else {
            // Enemy Ball (Big)
            ctx.fillStyle = this.color; 
            ctx.beginPath(); 
            ctx.arc((this.x+0.5)*cs, (this.y+0.5)*cs, cs*0.15, 0, Math.PI*2); 
            ctx.fill(); 
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        }
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.vx = (Math.random() - 0.5) * 0.15;
        this.vy = (Math.random() - 0.5) * 0.15;
        this.life = 1.0; this.decay = 0.03 + Math.random() * 0.03;
    }
    update() { this.x += this.vx; this.y += this.vy; this.life -= this.decay; }
    draw(ctx, cs) {
        ctx.globalAlpha = Math.max(0, this.life); ctx.fillStyle = this.color;
        ctx.fillRect((this.x * cs), (this.y * cs), cs * 0.1, cs * 0.1);
        ctx.globalAlpha = 1.0;
    }
}

class Tower {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type;
        this.stats = { ...TOWERS_CONFIG[type] };
        this.hp = this.stats.hp; this.maxHp = this.stats.hp;
        this.cooldownTimer = 0; this.rotation = 0;
    }
    update() {
        if (this.cooldownTimer > 0) this.cooldownTimer--;
        const target = this.findTarget();
        if (target) {
            this.rotation = Math.atan2(target.y - this.y, target.x - this.x);
            if (this.cooldownTimer <= 0) {
                STATE.projectiles.push(new Projectile(this.x, this.y, target, this.stats.damage, this.stats.color, 'tower'));
                this.cooldownTimer = this.stats.cd;
            }
        } else { this.rotation += 0.02; }
    }
    findTarget() {
        let target = null;
        for (const e of STATE.enemies) {
            if (!e.alive) continue;
            const dist = Math.sqrt((e.x - this.x)**2 + (e.y - this.y)**2);
            if (dist <= this.stats.radius) { if (!target || e.pathIndex > target.pathIndex) target = e; }
        }
        return target;
    }
    takeDamage(amt) {
        this.hp -= amt;
        if (this.hp <= 0) {
            if (STATE.selectedTower === this) STATE.selectedTower = null;
            for(let i=0; i<8; i++) STATE.particles.push(new Particle(this.x, this.y, '#95a5a6'));
        }
    }

    // NEW DRAW METHOD: Geometric Shapes
    draw(ctx, cs, isIcon = false) {
        const cx = isIcon ? cs/2 : (this.x + 0.5) * cs; const cy = isIcon ? cs/2 : (this.y + 0.5) * cs;
        const base = this.stats.baseType; const tier = this.stats.tier; const color = this.stats.color;
        const size = cs * 0.7; // 70% of cell
        
        ctx.save(); ctx.translate(cx, cy);

        // 1. RADAR (CIRCLE + RECT)
        if (base === 'radar') {
            if(!isIcon) ctx.rotate(this.rotation); else ctx.rotate(-Math.PI/4);
            // Base
            ctx.fillStyle = '#34495e'; ctx.beginPath(); ctx.arc(0, 0, size*0.4, 0, Math.PI*2); ctx.fill();
            // Barrel
            ctx.fillStyle = color; 
            // Multi-barrel for tiers
            if (tier === 1) ctx.fillRect(0, -size*0.1, size*0.5, size*0.2);
            else if (tier === 2) { ctx.fillRect(0, -size*0.15, size*0.5, size*0.1); ctx.fillRect(0, size*0.05, size*0.5, size*0.1); }
            else { ctx.fillRect(0, -size*0.2, size*0.6, size*0.4); }
        } 
        
        // 2. BLASTER (SQUARE)
        else if (base === 'blaster') {
            if(!isIcon) ctx.rotate(this.rotation); else ctx.rotate(-Math.PI/4);
            ctx.fillStyle = '#2c3e50'; ctx.fillRect(-size*0.35, -size*0.35, size*0.7, size*0.7);
            ctx.fillStyle = color; 
            // Inner core
            const core = size * (0.2 + tier * 0.1);
            ctx.fillRect(-core/2, -core/2, core, core);
            // Barrel
            ctx.fillStyle = '#7f8c8d'; ctx.fillRect(0, -size*0.1, size*0.5, size*0.2);
        }
        
        // 3. SNIPER (TRIANGLE)
        else if (base === 'sniper') {
            if(!isIcon) ctx.rotate(this.rotation); else ctx.rotate(-Math.PI/4);
            ctx.fillStyle = '#2c3e50'; 
            ctx.beginPath(); ctx.moveTo(size*0.4, 0); ctx.lineTo(-size*0.3, size*0.3); ctx.lineTo(-size*0.3, -size*0.3); ctx.fill();
            // Long Barrel
            ctx.strokeStyle = color; ctx.lineWidth = 2 + tier; 
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(size*0.6, 0); ctx.stroke();
            // Center Dot
            ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, size*0.15, 0, Math.PI*2); ctx.fill();
        }
        
        // 4. SLOW (HEXAGON)
        else if (base === 'slow') {
            ctx.fillStyle = color;
            ctx.beginPath(); 
            for (let i = 0; i < 6; i++) {
                const angle = i * Math.PI / 3;
                ctx.lineTo(size*0.4 * Math.cos(angle), size*0.4 * Math.sin(angle));
            }
            ctx.closePath(); ctx.fill();
            
            // Pulse effect
            const pulse = isIcon ? 0 : (Math.sin(Date.now() / 200) + 1) * 0.5 * size * 0.1;
            ctx.strokeStyle = "white"; ctx.lineWidth = tier; 
            ctx.beginPath(); ctx.arc(0, 0, size*0.15 + pulse, 0, Math.PI*2); ctx.stroke();
        }

        ctx.restore();

        // Level Dots (Only on board, not icons)
        if (!isIcon) {
            ctx.fillStyle = "white";
            const dotY = cy + size*0.4; const dotSize = cs*0.06; const spacing = cs*0.12;
            if (tier === 1) { ctx.beginPath(); ctx.arc(cx, dotY, dotSize, 0, Math.PI*2); ctx.fill(); }
            else if (tier === 2) { ctx.beginPath(); ctx.arc(cx-spacing/2, dotY, dotSize, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(cx+spacing/2, dotY, dotSize, 0, Math.PI*2); ctx.fill(); }
            else if (tier === 3) { ctx.beginPath(); ctx.arc(cx-spacing, dotY, dotSize, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(cx, dotY, dotSize, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(cx+spacing, dotY, dotSize, 0, Math.PI*2); ctx.fill(); }
            
            const hpPct = this.hp / this.maxHp;
            if (hpPct < 1.0) drawCircularHP(ctx, cx, cy, cs*0.42, hpPct, hpPct > 0.5 ? '#2ecc71' : '#e74c3c');
        }
    }
}

/* =========================================
   INPUT & INIT
   ========================================= */
class InputHandler {
    constructor() {
        this.setupShop(); this.setupCanvas();
        this.setupControls();
    }
    
    setupControls() {
        const autostart = document.getElementById('chk-autostart');
        if (autostart) autostart.addEventListener('change', (e) => { STATE.autoStart = e.target.checked; });
        
        const btnPause = document.getElementById('btn-pause');
        if (btnPause) btnPause.addEventListener('click', (e) => { 
            STATE.isPaused = !STATE.isPaused; e.target.innerText = STATE.isPaused ? "▶" : "⏸"; 
        });

        const btnMinus = document.getElementById('diff-minus');
        const btnPlus = document.getElementById('diff-plus');
        if (btnMinus) btnMinus.addEventListener('click', () => this.changeDiff(-1));
        if (btnPlus) btnPlus.addEventListener('click', () => this.changeDiff(1));

        const btnGrid = document.getElementById('btn-grid-size');
        if (btnGrid) btnGrid.addEventListener('click', () => this.toggleGridSize());

        // SPEED TOGGLE
        const btnSpeed = document.getElementById('btn-speed');
        if (btnSpeed) {
            btnSpeed.addEventListener('click', () => {
                STATE.gameSpeed = (STATE.gameSpeed === 1) ? 2 : 1;
                btnSpeed.innerText = STATE.gameSpeed + 'x';
            });
        }
    }

    changeDiff(delta) {
        STATE.diffMultiplier = Math.max(1, STATE.diffMultiplier + delta);
        const disp = document.getElementById('diff-val');
        if(disp) disp.innerText = 'x' + STATE.diffMultiplier;
    }

    toggleGridSize() {
        if (STATE.gridSize === 'normal') {
            STATE.gridSize = 'huge';
            CONFIG.cols = 24; CONFIG.rows = 26;
            CONFIG.start = { x: 23, y: 0 }; CONFIG.end = { x: 0, y: 25 };
            const btn = document.getElementById('btn-grid-size'); if(btn) btn.innerText = "Map: 24x26";
        } else {
            STATE.gridSize = 'normal';
            CONFIG.cols = 12; CONFIG.rows = 13;
            CONFIG.start = { x: 11, y: 0 }; CONFIG.end = { x: 0, y: 12 };
            const btn = document.getElementById('btn-grid-size'); if(btn) btn.innerText = "Map: 12x13";
        }
        
        STATE.wave = 1; STATE.isWaveActive = false; 
        STATE.money = 450; STATE.lives = 100; STATE.victoryPoints = 0;
        const btnStart = document.getElementById('btn-start');
        if(btnStart) { btnStart.innerText = "Start!"; btnStart.disabled = false; }
        
        maze.generateZigZag();
        handleResize();
        updateUI();
    }

    setupShop() {
        const items = document.querySelectorAll('.tower-card'); const shop = document.querySelector('.ui-shop');
        if (!shop) return;
        items.forEach(item => {
            const type = item.dataset.type; const cost = parseInt(item.dataset.cost);
            item.addEventListener('dragstart', (e) => { if (STATE.money < cost) { e.preventDefault(); return; } e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'shop', type, cost })); });
            item.addEventListener('touchstart', (e) => { if (STATE.money < cost) return; STATE.dragData = { source: 'shop', type, cost }; }, {passive: false});
        });
        document.addEventListener('touchmove', (e) => { if (STATE.dragData) { e.preventDefault(); const t = e.touches[0]; STATE.hoverPos = this.getTouchGridPos(t.clientX, t.clientY); } }, {passive: false});
        document.addEventListener('touchend', (e) => { if (STATE.dragData && STATE.hoverPos && STATE.dragData.source === 'shop') this.buildTower(STATE.hoverPos.x, STATE.hoverPos.y, STATE.dragData.type, STATE.dragData.cost); STATE.dragData = null; STATE.hoverPos = null; });
        shop.addEventListener('dragover', (e) => { e.preventDefault(); });
        shop.addEventListener('drop', (e) => { e.preventDefault(); try { const d = JSON.parse(e.dataTransfer.getData('text/plain')); if (d.source === 'game') this.sellTower(d.x, d.y); } catch(err){} });
    }
    setupCanvas() {
        const cvs = document.getElementById('gameCanvas');
        if(!cvs) return;
        cvs.addEventListener('click', (e) => { const pos = this.getMouseGridPos(e); if(!pos)return; STATE.selectedTower = STATE.towers.find(t=>t.x===pos.x && t.y===pos.y) || null; });
        cvs.addEventListener('dragover', (e) => { e.preventDefault(); const pos = this.getMouseGridPos(e); if(pos) STATE.hoverPos = pos; });
        cvs.addEventListener('dragleave', () => STATE.hoverPos = null);
        cvs.addEventListener('drop', (e) => { e.preventDefault(); STATE.hoverPos = null; const pos = this.getMouseGridPos(e); if(!pos) return; try{ const d=JSON.parse(e.dataTransfer.getData('text/plain')); if(d.source==='shop') this.buildTower(pos.x, pos.y, d.type, d.cost); }catch(e){} });
        cvs.setAttribute('draggable','true');
        cvs.addEventListener('dragstart', (e) => { const pos = this.getMouseGridPos(e); const t = STATE.towers.find(t=>t.x===pos.x && t.y===pos.y); if(t) { STATE.dragData = {source:'game',x:t.x,y:t.y}; e.dataTransfer.setData('text/plain', JSON.stringify({source:'game',x:t.x,y:t.y})); const img=new Image(); img.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; e.dataTransfer.setDragImage(img,0,0); } else e.preventDefault(); });
        cvs.addEventListener('touchstart', (e) => { const t = e.touches[0]; const pos = this.getTouchGridPos(t.clientX, t.clientY); if(!pos) return; const tower = STATE.towers.find(t=>t.x===pos.x && t.y===pos.y); if(tower) { STATE.selectedTower = tower; STATE.dragData = {source:'game', x:tower.x, y:tower.y, cost:tower.stats.cost}; } else STATE.selectedTower = null; }, {passive:false});
    }
    getMouseGridPos(e) { const r = canvas.getBoundingClientRect(); return this.toGrid(e.clientX - r.left, e.clientY - r.top); }
    getTouchGridPos(cx, cy) { const r = canvas.getBoundingClientRect(); return this.toGrid(cx - r.left, cy - r.top); }
    toGrid(x, y) { const gx = Math.floor(x/STATE.cellSize); const gy = Math.floor(y/STATE.cellSize); if(gx>=0 && gx<CONFIG.cols && gy>=0 && gy<CONFIG.rows) return {x:gx, y:gy}; return null; }
    
    buildTower(x, y, type, cost) {
        if (!STATE.grid[y] || STATE.grid[y][x] !== 1) return showToast("Только на стене!");
        const existing = STATE.towers.find(t => t.x === x && t.y === y);
        if (existing) {
            if (existing.stats.baseType === TOWERS_CONFIG[type].baseType) {
                if (TOWERS_CONFIG[type].tier > existing.stats.tier) {
                    const upgradeCost = cost - existing.stats.cost; 
                    if (STATE.money >= upgradeCost) {
                        STATE.money -= upgradeCost; STATE.towers = STATE.towers.filter(t => t !== existing); STATE.towers.push(new Tower(x, y, type)); updateUI(); return;
                    } else return showToast("Не хватает денег!");
                }
            }
            return showToast("Место занято!");
        }
        if (STATE.money >= cost) { STATE.money -= cost; STATE.towers.push(new Tower(x, y, type)); updateUI(); }
    }
    sellTower(x, y) {
        const idx = STATE.towers.findIndex(t => t.x === x && t.y === y);
        if (idx !== -1) { const t = STATE.towers[idx]; STATE.money += Math.floor(t.stats.cost * 0.7); STATE.towers.splice(idx, 1); if (STATE.selectedTower === t) STATE.selectedTower = null; updateUI(); showToast("Продано!"); }
    }
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function gameLoop() { 
    try {
        for(let i = 0; i < STATE.gameSpeed; i++) {
            update();
        }
        draw(); 
        requestAnimationFrame(gameLoop); 
    } catch(e) {
        console.error(e);
    }
}

// Fixed Icon Generation
function generateShopIcons() {
    const keys = Object.keys(TOWERS_CONFIG);
    keys.forEach(key => {
        const container = document.getElementById(`preview-${key}`);
        if (!container) return;
        const tempCvs = document.createElement('canvas');
        tempCvs.width = 40; tempCvs.height = 40; // Small clean size
        const tempCtx = tempCvs.getContext('2d');
        const mockTower = new Tower(0,0, key);
        mockTower.draw(tempCtx, 40, true);
        container.innerHTML = ''; container.appendChild(tempCvs);
    });
}

function startWave() {
    if (STATE.isWaveActive) return;
    STATE.isWaveActive = true;
    STATE.enemiesToSpawn = 10 + STATE.wave * 2;
    STATE.spawnTimer = 0;
    const btn = document.getElementById('btn-start');
    if(btn) { btn.disabled = true; btn.innerText = "Level " + STATE.wave; }
}
function endWave() {
    STATE.isWaveActive = false; STATE.wave++; updateUI();
    const btn = document.getElementById('btn-start');
    if(btn) { btn.disabled = false; btn.innerText = "Start!"; }
    
    // BANKRUPTCY CHECK
    if (STATE.money < 50 && STATE.towers.length === 0) {
        endGame("No Money & No Towers!");
        return;
    }

    if (STATE.autoStart) setTimeout(startWave, 1000);
}
function checkWin() {
    if (STATE.victoryPoints >= 1000) { 
        STATE.isPaused = true; 
        const t = document.getElementById('toast'); document.getElementById('toast-title').innerText = "VICTORY!"; document.getElementById('toast-message').innerText = "1000 VP Reached!"; 
        document.getElementById('restart-btn').style.display='inline-block'; t.classList.remove('hidden'); t.style.display='block'; 
    }
}

function update() {
    if (STATE.isPaused || STATE.lives <= 0) return;
    if (STATE.isWaveActive && STATE.enemiesToSpawn > 0) {
        STATE.spawnTimer--;
        if (STATE.spawnTimer <= 0) {
            const rand = Math.random(); let type = 'normal';
            if (STATE.wave >= 2 && rand > 0.7) type = 'tank';
            if (STATE.wave >= 3 && rand > 0.85) type = 'shooter';
            STATE.enemies.push(new Enemy(STATE.wave, type));
            STATE.enemiesToSpawn--; STATE.spawnTimer = 35; 
        }
    }
    STATE.enemies.forEach(e => e.update()); STATE.towers.forEach(t => t.update());
    STATE.projectiles.forEach(p => p.update()); STATE.particles.forEach(p => p.update());

    STATE.enemies = STATE.enemies.filter(e => e.alive);
    STATE.projectiles = STATE.projectiles.filter(p => p.alive);
    STATE.particles = STATE.particles.filter(p => p.life > 0);
    STATE.towers = STATE.towers.filter(t => t.hp > 0);
    if (STATE.selectedTower && STATE.selectedTower.hp <= 0) STATE.selectedTower = null;
    if (STATE.isWaveActive && STATE.enemiesToSpawn === 0 && STATE.enemies.length === 0) endWave();
}

function handleResize() {
    const headerEl = document.querySelector('.ui-header');
    const shopEl = document.querySelector('.ui-shop');
    
    let headerH = headerEl ? headerEl.offsetHeight : 60;
    let shopH = shopEl ? shopEl.offsetHeight : 0;
    
    if (window.innerWidth > 768) {
        shopH = 0; 
    }

    const availW = window.innerWidth - (window.innerWidth > 768 ? 240 : 0) - 20; 
    const availH = window.innerHeight - headerH - shopH - 20;
    
    if (CONFIG.cols <= 0 || CONFIG.rows <= 0) return;

    const size = Math.floor(Math.min(availW / CONFIG.cols, availH / CONFIG.rows));
    
    if (size > 0 && canvas) { 
        STATE.cellSize = size; 
        canvas.width = size * CONFIG.cols; 
        canvas.height = size * CONFIG.rows; 
        draw(); 
    }
}
function drawCircularHP(ctx, x, y, radius, pct, color) { ctx.beginPath(); ctx.arc(x, y, radius, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * pct)); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke(); }

function draw() {
    const cs = STATE.cellSize; if (!cs || !ctx) return;
    if (!STATE.grid || STATE.grid.length !== CONFIG.rows) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const wallColor = getCSSVar('--wall-color'); const pathColor = getCSSVar('--path-color');
    
    for (let y = 0; y < CONFIG.rows; y++) {
        for (let x = 0; x < CONFIG.cols; x++) {
            if (STATE.grid[y] && STATE.grid[y][x] === 1) { ctx.fillStyle = wallColor; ctx.fillRect(x*cs+1, y*cs+1, cs-2, cs-2); }
            else { ctx.fillStyle = pathColor; ctx.fillRect(x*cs, y*cs, cs, cs); }
        }
    }
    if (STATE.path.length > 0) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'; ctx.lineWidth = cs * 0.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); STATE.path.forEach((p, i) => { const px = (p.x + 0.5) * cs; const py = (p.y + 0.5) * cs; if (i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }); ctx.stroke();
    }
    const s = CONFIG.start; const e = CONFIG.end;
    ctx.fillStyle = 'rgba(46, 204, 113, 0.2)'; ctx.beginPath(); ctx.arc((s.x+0.5)*cs, (s.y+0.5)*cs, cs*0.3, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(231, 76, 60, 0.2)'; ctx.beginPath(); ctx.arc((e.x+0.5)*cs, (e.y+0.5)*cs, cs*0.3, 0, Math.PI*2); ctx.fill();

    STATE.towers.forEach(t => {
        const cx = (t.x + 0.5) * cs; const cy = (t.y + 0.5) * cs;
        ctx.beginPath(); ctx.arc(cx, cy, t.stats.radius * cs, 0, Math.PI*2);
        if (STATE.selectedTower === t) { ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.strokeStyle = "rgba(255,255,255,0.8)"; } 
        else { ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.strokeStyle = "rgba(255,255,255,0.1)"; }
        ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
    });

    STATE.enemies.forEach(en => {
        const ex = (en.x + 0.5) * cs; const ey = (en.y + 0.5) * cs;
        ctx.fillStyle = (en.type === 'tank') ? PALETTE.tank : (en.type === 'shooter' ? PALETTE.shooter : PALETTE.normal);
        const r = cs * 0.25; ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke();
        en.drawIcon(ctx, cs, ex, ey, r * 2); 
        const hpPct = en.hp / en.maxHp; 
        if (!isNaN(hpPct)) drawCircularHP(ctx, ex, ey, r + 4, hpPct, (hpPct > 0.5 ? '#0f0' : '#f00'));
    });

    // 1. Рисуем лазеры (снизу)
    STATE.projectiles.forEach(p => { if (p.source === 'tower') p.draw(ctx, cs); });
    // 2. Рисуем снаряды врагов (сверху)
    STATE.projectiles.forEach(p => { if (p.source !== 'tower') p.draw(ctx, cs); });
    
    STATE.particles.forEach(p => p.draw(ctx, cs));
    STATE.towers.forEach(t => t.draw(ctx, cs));

    if (STATE.hoverPos) {
        const {x, y} = STATE.hoverPos;
        if (STATE.grid[y]) {
            const canBuild = STATE.grid[y][x] === 1;
            ctx.strokeStyle = canBuild ? "#4cc9f0" : "#e53170"; ctx.lineWidth = 2; ctx.strokeRect(x*cs, y*cs, cs, cs);
            if (STATE.dragData && STATE.dragData.source === 'shop' && canBuild) {
                const r = TOWERS_CONFIG[STATE.dragData.type].radius;
                ctx.beginPath(); ctx.arc((x+0.5)*cs, (y+0.5)*cs, r*cs, 0, Math.PI*2);
                ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.stroke();
            }
        }
    }

    if (STATE.isPaused) { ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0,0,canvas.width, canvas.height); ctx.fillStyle = "white"; ctx.font = "bold 30px Arial"; ctx.textAlign="center"; ctx.fillText("PAUSED", canvas.width/2, canvas.height/2); }
}

function updateUI() {
    const elLives = document.getElementById('stat-lives'); if(elLives) elLives.innerText = STATE.lives;
    const elMoney = document.getElementById('stat-money'); if(elMoney) elMoney.innerText = STATE.money;
    const elVp = document.getElementById('stat-vp'); if(elVp) elVp.innerText = STATE.victoryPoints;
    updateShopAffordability();
}

function updateShopAffordability() {
    document.querySelectorAll('.tower-card').forEach(card => {
        const cost = parseInt(card.dataset.cost);
        if (STATE.money < cost) {
            card.classList.add('cannot-afford');
        } else {
            card.classList.remove('cannot-afford');
        }
    });
}

function showToast(msg) {
    const t = document.getElementById('toast'); if(!t) return;
    document.getElementById('toast-message').innerText = msg;
    t.classList.remove('hidden'); t.style.display='block'; setTimeout(() => t.style.display='none', 1500);
}
function endGame(reason) {
    STATE.isPaused = true;
    const t = document.getElementById('toast');
    document.getElementById('toast-title').innerText = "GAME OVER";
    document.getElementById('toast-message').innerText = reason + "\nWave: " + STATE.wave;
    document.getElementById('restart-btn').style.display='inline-block';
    t.classList.remove('hidden'); t.style.display='block';
}

class Tutorial {
    constructor() {
        this.overlay = document.getElementById('tutorial-overlay');
        this.msgBox = document.getElementById('tutorial-msg-box');
        this.title = document.getElementById('tut-title');
        this.text = document.getElementById('tut-text');
        this.btn = document.getElementById('tutorial-next-btn');
        this.skipBtn = document.getElementById('tutorial-skip-btn');
        this.step = 0;
        this.steps = [
            { el: null, title: "Welcome Commander!", msg: "Protect the base from enemies." },
            { el: 'shop-container', title: "The Shop", msg: "Drag towers from here. Gray ones are too expensive." },
            { el: 'board-container', title: "The Field", msg: "Place towers on the walls (lighter squares)." },
            { el: 'start-btn-container', title: "Ready?", msg: "Press Start to begin the first wave!" }
        ];
        if (this.overlay && this.msgBox) { this.bindEvents(); this.start(); }
    }
    bindEvents() {
        this.btn.addEventListener('click', () => this.next());
        this.skipBtn.addEventListener('click', () => this.end());
    }
    start() { this.overlay.classList.remove('hidden'); this.msgBox.classList.remove('hidden'); this.update(); }
    update() {
        document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
        if (this.step >= this.steps.length) { this.end(); return; }
        const current = this.steps[this.step];
        this.title.innerText = current.title; this.text.innerText = current.msg;
        if (current.el) {
            const el = document.getElementById(current.el);
            if (el) el.classList.add('tutorial-highlight');
        }
    }
    next() { this.step++; this.update(); }
    end() { this.overlay.classList.add('hidden'); this.msgBox.classList.add('hidden'); document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight')); handleResize(); }
}

const maze = new Maze(); const input = new InputHandler();

window.onload = () => {
    maze.generateZigZag(); 
    updateUI();
    generateShopIcons(); 
    new Tutorial(); 
    handleResize();
    setTimeout(handleResize, 100);
    setTimeout(handleResize, 500);
};

const btnStart = document.getElementById('btn-start');
if(btnStart) btnStart.addEventListener('click', startWave);
const btnRestart = document.getElementById('restart-btn');
if(btnRestart) btnRestart.addEventListener('click', () => location.reload());
const btnTheme = document.getElementById('theme-toggle');
if(btnTheme) btnTheme.addEventListener('click', () => { document.body.classList.toggle('theme-dark'); document.body.classList.toggle('theme-light'); });

window.addEventListener('resize', handleResize);
requestAnimationFrame(gameLoop);