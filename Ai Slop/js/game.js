'use strict';

/* ---------------------------------------------------------------- canvas */
var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
var W = canvas.width;
var H = canvas.height;

function fitCanvas() {
  var scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  scale = Math.max(scale, 0.4);
  canvas.style.width = Math.floor(W * scale) + 'px';
  canvas.style.height = Math.floor(H * scale) + 'px';
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

Input.attach(canvas);

// Audio needs a real user gesture to start.
function unlockAudio() {
  Sfx.init();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('mousedown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
}
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('mousedown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

/* ------------------------------------------------------------- constants */
var STEP = 1000 / 60;
var VIEW_H = 16 * TILE;
var WATER_Y = VIEW_H;

var Game = {
  state: 'title',        // title | play | pause | dead | clear | win
  world: null,
  levelIndex: 0,
  score: 0,
  cam: { x: 0, y: 0 },
  camP: { x: 0, y: 0 },
  clouds: [],
  t: 0
};

function curLevel() { return LEVELS[Game.levelIndex]; }

/* ------------------------------------------------------------ world init */
function tileRects(list, forceH) {
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var r = list[i];
    out.push({
      x: r[0] * TILE,
      y: r[1] * TILE,
      w: r[2] * TILE,
      h: forceH === undefined ? r[3] * TILE : forceH
    });
  }
  return out;
}

function buildWorld(L) {
  var world = {
    name: L.name,
    width: L.cols * TILE,
    height: L.rows * TILE,
    waterY: WATER_Y,
    solids: tileRects(L.solids),
    oneways: tileRects(L.oneways, 14),
    water: tileRects(L.water),
    movers: [],
    sunfishes: [],
    pellets: [],
    particles: [],
    floats: [],
    collectibles: [],
    signs: [],
    goal: null,
    boss: null,
    bossDefeated: !L.boss,
    won: false,
    shake: 0,
    time: 0,
    score: Game.score,
    mouse: { x: 0, y: 0 },
    player: null
  };

  world.player = new Player(L.spawn.x, L.spawn.y);

  for (var i = 0; i < L.movers.length; i++) world.movers.push(new Mover(L.movers[i]));

  world.onewaysAll = world.oneways.concat(world.movers);

  for (var e = 0; e < L.enemies.length; e++) {
    var en = L.enemies[e];
    world.sunfishes.push(new Sunfish(en.kind, en.cx, en.by));
  }

  for (var c = 0; c < L.collectibles.length; c++) {
    var co = L.collectibles[c];
    world.collectibles.push(new GoldenFish(co.cx, co.cy));
  }

  for (var s = 0; s < L.signs.length; s++) {
    var sg = L.signs[s];
    world.signs.push(new Sign(sg.cx, sg.by, sg.text));
  }

  world.goal = new Goal(L.goal.x, L.goal.y, L.goal.w, L.goal.h);
  world.boss = L.boss ? new Mola(L.boss) : null;

  return world;
}

function loadLevel() {
  Game.world = buildWorld(curLevel());
  makeClouds(Game.world.width);
  centerCameraOnPlayer();
}

function resetLevel() {
  loadLevel();
}

function centerCameraOnPlayer() {
  Game.cam.x = clamp(Game.world.player.x - W * 0.42, 0, Math.max(0, Game.world.width - W));
  Game.cam.y = clamp(Game.world.player.y - H * 0.55, 0, Math.max(0, Game.world.height - H));
  Game.camP.x = Game.cam.x;
  Game.camP.y = Game.cam.y;
}

function advanceLevel() {
  if (Game.levelIndex >= LEVELS.length - 1) return false;
  Game.score = Game.world.score;
  Game.levelIndex++;
  loadLevel();
  return true;
}

function makeClouds(worldWidth) {
  var span = worldWidth || W;
  Game.clouds = [];
  for (var i = 0; i < 14; i++) {
    Game.clouds.push({
      x: rand(-200, span),
      y: rand(10, 190),
      s: rand(0.6, 1.5),
      v: rand(0.03, 0.11),
      p: rand(0.1, 0.32)
    });
  }
}

/* ------------------------------------------------------------------ step */
function snapshot(world) {
  var list = [world.player, world.boss];
  var i;
  for (i = 0; i < world.sunfishes.length; i++) list.push(world.sunfishes[i]);
  for (i = 0; i < world.pellets.length; i++) list.push(world.pellets[i]);
  for (i = 0; i < world.movers.length; i++) list.push(world.movers[i]);
  for (i = 0; i < world.collectibles.length; i++) list.push(world.collectibles[i]);
  for (i = 0; i < list.length; i++) {
    if (list[i]) { list[i].px = list[i].x; list[i].py = list[i].y; }
  }
}

function updateMovers(world) {
  var p = world.player;
  for (var i = 0; i < world.movers.length; i++) {
    var m = world.movers[i];
    var ox = m.x, oy = m.y;
    m.update();
    var dx = m.x - ox, dy = m.y - oy;

    var riding = p.onGround &&
      p.x + p.w > ox + 3 && p.x < ox + m.w - 3 &&
      Math.abs((p.y + p.h) - oy) <= 5;

    if (riding) { p.x += dx; p.y += dy; }
  }
}

function damagePlayer(world, fromX) {
  var p = world.player;
  if (p.invuln > 0 || p.dead) return;

  p.health--;
  p.invuln = 95;
  world.shake = Math.max(world.shake, 8);
  Sfx.hurt();

  var dir = (p.x + p.w / 2) < fromX ? -1 : 1;
  p.vx = dir * 5;
  p.vy = -6;
  p.onGround = false;

  burst(world, p.x + p.w / 2, p.y + p.h / 2, 12, {
    colors: ['#ff5d5d', '#ffb3b3', '#ffffff'], spd: 4,
    lifeMin: 14, lifeMax: 30, sizeMin: 2, sizeMax: 4
  });

  if (p.health <= 0) {
    p.health = 0;
    p.dead = true;
    p.dropCarry(world);
    Game.state = 'dead';
    Sfx.gameover();
  }
}

function drownPlayer(world, waterRect) {
  var p = world.player;
  if (p.dead) return;

  burst(world, p.x + p.w / 2, waterRect.y, 18, {
    colors: ['#7fd7ff', '#dff6ff', '#ffffff'], spd: 4.5, up: 2.5, g: 0.2,
    lifeMin: 16, lifeMax: 36, sizeMin: 2, sizeMax: 5
  });
  Sfx.splash();
  world.shake = Math.max(world.shake, 6);

  p.dropCarry(world);
  p.health--;
  p.x = p.lastSafe.x;
  p.y = p.lastSafe.y;
  p.vx = 0; p.vy = 0;
  p.invuln = 80;

  if (p.health <= 0) {
    p.health = 0;
    p.dead = true;
    Game.state = 'dead';
    Sfx.gameover();
  }
}

function hitSunfish(world, f, x, y) {
  if (f.mode === 'alive') {
    f.stun(world);
    world.score += 10;
    addFloat(world, x, y - 12, '+10', '#9be7ff');
  } else if (f.mode === 'stunned') {
    f.kill(world, false);
    world.score += 25;
    addFloat(world, x, y - 12, '+25', '#ffd166');
  }
}

function resolveCollisions(world) {
  var p = world.player;
  var i, j, b, f, g;

  // pellets
  for (i = 0; i < world.pellets.length; i++) {
    b = world.pellets[i];
    if (b.dead) continue;

    for (j = 0; j < world.sunfishes.length; j++) {
      f = world.sunfishes[j];
      if (f.dead || f.mode === 'carried' || f.mode === 'thrown') continue;
      if (!rectsOverlap(b, f)) continue;
      b.dead = true;
      hitSunfish(world, f, b.x + b.w / 2, b.y + b.h / 2);
      break;
    }
    if (b.dead) continue;

    if (world.boss && !world.bossDefeated && !world.boss.dead && rectsOverlap(b, world.boss)) {
      b.dead = true;
      world.boss.hit(world, 1);
      addFloat(world, b.x, b.y - 10, 'HIT', '#ffffff');
    }
  }

  // thrown sunfish
  for (i = 0; i < world.sunfishes.length; i++) {
    f = world.sunfishes[i];
    if (f.mode !== 'thrown' || f.dead) continue;

    for (j = 0; j < world.sunfishes.length; j++) {
      g = world.sunfishes[j];
      if (g === f || g.dead || g.mode !== 'alive') continue;
      if (!rectsOverlap(f, g)) continue;
      g.kill(world, true);
      world.score += 50;
      addFloat(world, g.x + g.w / 2, g.y - 6, '+50', '#ffd166');
      f.pierce--;
      if (f.pierce <= 0) { f.dead = true; break; }
    }
    if (f.dead) continue;

    if (world.boss && !world.bossDefeated && !world.boss.dead && rectsOverlap(f, world.boss)) {
      world.boss.hit(world, 2);
      addFloat(world, f.x, f.y - 10, 'BOOM', '#ffd166');
      f.dead = true;
      burst(world, f.x + f.w / 2, f.y + f.h / 2, 12, {
        colors: ['#ffd166', '#ff7a3d', '#ffffff'], spd: 5
      });
    }
  }

  if (!p.dead) {
    // player vs live fish
    for (i = 0; i < world.sunfishes.length; i++) {
      f = world.sunfishes[i];
      if (f.mode !== 'alive' || f.dead) continue;
      if (rectsOverlap(p, f)) {
        damagePlayer(world, f.x + f.w / 2);
        break;
      }
    }
    // player vs boss
    if (world.boss && !world.bossDefeated && !world.boss.dead && rectsOverlap(p, world.boss)) {
      damagePlayer(world, world.boss.x + world.boss.w / 2);
    }
  }

  // collectibles
  for (i = 0; i < world.collectibles.length; i++) {
    var c = world.collectibles[i];
    if (c.dead) continue;
    if (!p.dead && rectsOverlap(p, c)) {
      c.dead = true;
      world.score += 100;
      Sfx.pickup();
      addFloat(world, c.x + c.w / 2, c.y, '+100', '#ffe066');
      burst(world, c.x + c.w / 2, c.y + c.h / 2, 16, {
        colors: ['#ffe066', '#fff6c4', '#ffffff'], spd: 4, round: true,
        lifeMin: 16, lifeMax: 34, sizeMin: 2, sizeMax: 4
      });
    }
  }

  // water
  if (!p.dead) {
    for (i = 0; i < world.water.length; i++) {
      var wr = world.water[i];
      if (rectsOverlap(p, wr) && p.y + p.h > wr.y + 4) {
        drownPlayer(world, wr);
        break;
      }
    }
  }
}

function updateCamera(world) {
  var p = world.player;
  var look = clamp(Math.cos(p.aim) * 40, -60, 60);
  var tx = clamp(p.x + p.w / 2 - W * 0.42 + look, 0, world.width - W);
  var ty = clamp(p.y + p.h / 2 - H * 0.55, 0, world.height - H);
  Game.camP.x = Game.cam.x;
  Game.camP.y = Game.cam.y;
  Game.cam.x += (tx - Game.cam.x) * 0.12;
  Game.cam.y += (ty - Game.cam.y) * 0.1;
}

function step() {
  var world = Game.world;
  if (!world) return;
  world.time++;

  snapshot(world);

  updateMovers(world);

  world.mouse.x = Game.cam.x + Input.mouse.x;
  world.mouse.y = Game.cam.y + Input.mouse.y;

  var i;
  world.player.update(world);

  for (i = 0; i < world.sunfishes.length; i++) world.sunfishes[i].update(world);
  for (i = 0; i < world.pellets.length; i++) world.pellets[i].update(world);
  for (i = 0; i < world.collectibles.length; i++) world.collectibles[i].update(world);
  if (world.boss && !world.bossDefeated) world.boss.update(world);
  world.goal.update(world);

  // particles
  for (i = world.particles.length - 1; i >= 0; i--) {
    var pa = world.particles[i];
    pa.vy += pa.g;
    pa.vx *= 0.985;
    pa.x += pa.vx;
    pa.y += pa.vy;
    pa.life--;
    if (pa.life <= 0) world.particles.splice(i, 1);
  }

  // floating score text
  for (i = world.floats.length - 1; i >= 0; i--) {
    var fl = world.floats[i];
    fl.y -= 0.65;
    fl.life--;
    if (fl.life <= 0) world.floats.splice(i, 1);
  }

  resolveCollisions(world);

  // cleanup
  for (i = world.sunfishes.length - 1; i >= 0; i--) if (world.sunfishes[i].dead) world.sunfishes.splice(i, 1);
  for (i = world.pellets.length - 1; i >= 0; i--) if (world.pellets[i].dead) world.pellets.splice(i, 1);
  for (i = world.collectibles.length - 1; i >= 0; i--) if (world.collectibles[i].dead) world.collectibles.splice(i, 1);

  if (world.player.carry && world.player.carry.dead) world.player.carry = null;

  updateCamera(world);

  world.shake *= 0.86;
  if (world.shake < 0.05) world.shake = 0;

  if (world.won) {
    world.won = false;
    Game.state = Game.levelIndex < LEVELS.length - 1 ? 'clear' : 'win';
    Sfx.win();
  }
}

/* ---------------------------------------------------------------- render */
function drawSky(cam) {
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2b6ea8');
  g.addColorStop(0.45, '#6fb6d8');
  g.addColorStop(0.8, '#a9dced');
  g.addColorStop(1, '#d8eef5');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // sun
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath(); ctx.arc(W - 150, 95, 46, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.18;
  ctx.beginPath(); ctx.arc(W - 150, 95, 78, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // clouds (parallax)
  for (var i = 0; i < Game.clouds.length; i++) {
    var c = Game.clouds[i];
    var sx = c.x + Game.t * c.v - cam.x * c.p;
    sx = ((sx % 3600) + 3600) % 3600 - 400;
    var sy = c.y - cam.y * c.p * 0.5;
    if (sx < -300 || sx > W + 300) continue;
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#ffffff';
    ctx.translate(sx, sy);
    ctx.scale(c.s, c.s);
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.arc(30, 6, 20, 0, Math.PI * 2);
    ctx.arc(-28, 8, 18, 0, Math.PI * 2);
    ctx.arc(6, -14, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // far islands
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#3f7d92';
  for (var k = 0; k < 6; k++) {
    var ix = ((k * 700 - cam.x * 0.35) % 4200 + 4200) % 4200 - 500;
    ctx.beginPath();
    ctx.moveTo(ix, 300);
    ctx.quadraticCurveTo(ix + 60, 210, ix + 130, 300);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawOcean(cam) {
  var top = WATER_Y;
  var g = ctx.createLinearGradient(0, top, 0, top + 160);
  g.addColorStop(0, '#2a86b8');
  g.addColorStop(1, '#0b3b57');
  ctx.fillStyle = g;
  ctx.fillRect(0, top, Game.world.width, Game.world.height - top);
}

function drawWaterRect(r, time) {
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();

  var g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, 'rgba(120,215,255,0.55)');
  g.addColorStop(1, 'rgba(20,80,130,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);

  // surface ripples
  ctx.strokeStyle = 'rgba(220,246,255,0.85)';
  ctx.lineWidth = 2;
  for (var k = 0; k < 2; k++) {
    ctx.beginPath();
    for (var x = r.x; x <= r.x + r.w; x += 4) {
      var y = r.y + 3 + k * 5 + Math.sin((x * 0.08) + time * 0.06 + k * 2) * 2.4;
      if (x === r.x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawTerrain(world, time) {
  for (var i = 0; i < world.solids.length; i++) {
    var s = world.solids[i];

    // rocky base
    ctx.fillStyle = '#123642';
    ctx.fillRect(s.x, s.y, s.w, s.h);

    ctx.fillStyle = '#0d2833';
    for (var x = s.x + 6; x < s.x + s.w - 4; x += 37) {
      for (var y = s.y + 26; y < s.y + s.h - 6; y += 29) {
        ctx.fillRect(x + ((y * 7) % 11) - 5, y, 4, 3);
      }
    }

    // wooden deck on top
    var deckH = 16;
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(s.x, s.y, s.w, deckH);
    ctx.fillStyle = '#a06a34';
    ctx.fillRect(s.x, s.y, s.w, deckH - 6);
    ctx.fillStyle = '#6b4a2b';
    for (var px = s.x + 3; px < s.x + s.w - 2; px += 16) {
      ctx.fillRect(px, s.y + 2, 2, deckH - 6);
    }
    ctx.fillStyle = '#3d2a17';
    ctx.fillRect(s.x, s.y + deckH - 2, s.w, 3);

    // grass-ish moss
    ctx.fillStyle = 'rgba(80,160,110,0.35)';
    ctx.fillRect(s.x, s.y + deckH, s.w, 4);
  }

  // one-way planks
  for (var j = 0; j < world.oneways.length; j++) {
    var p = world.oneways[j];
    ctx.fillStyle = '#8a5a2b';
    rrect(ctx, p.x, p.y, p.w, 14, 3); ctx.fill();
    ctx.fillStyle = '#a06a34';
    ctx.fillRect(p.x + 2, p.y + 1, p.w - 4, 6);
    ctx.fillStyle = '#3d2a17';
    ctx.fillRect(p.x, p.y + 11, p.w, 3);
  }
}

function drawWorldLayer(a) {
  var cam = {
    x: lerp(Game.camP.x, Game.cam.x, a),
    y: lerp(Game.camP.y, Game.cam.y, a)
  };
  var world = Game.world;

  ctx.save();
  var shx = 0, shy = 0;
  if (world.shake > 0.1) {
    shx = rand(-1, 1) * world.shake;
    shy = rand(-1, 1) * world.shake;
  }
  ctx.translate(-Math.round(cam.x) + shx, -Math.round(cam.y) + shy);

  drawOcean(cam);

  var i;
  for (i = 0; i < world.water.length; i++) drawWaterRect(world.water[i], world.time);

  // signs behind everything
  for (i = 0; i < world.signs.length; i++) world.signs[i].draw(ctx, a);

  drawTerrain(world, world.time);

  world.goal.draw(ctx, world);

  for (i = 0; i < world.movers.length; i++) world.movers[i].draw(ctx, a);

  for (i = 0; i < world.collectibles.length; i++) world.collectibles[i].draw(ctx, a);

  if (world.boss && !world.boss.dead) world.boss.draw(ctx, a);

  for (i = 0; i < world.sunfishes.length; i++) world.sunfishes[i].draw(ctx, a);

  for (i = 0; i < world.pellets.length; i++) world.pellets[i].draw(ctx, a);

  world.player.draw(ctx, a);

  // particles
  for (i = 0; i < world.particles.length; i++) {
    var pa = world.particles[i];
    var al = pa.life / pa.maxLife;
    ctx.globalAlpha = clamp(al, 0, 1);
    ctx.fillStyle = pa.color;
    if (pa.round) {
      ctx.beginPath(); ctx.arc(pa.x, pa.y, pa.size, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillRect(pa.x - pa.size / 2, pa.y - pa.size / 2, pa.size, pa.size);
    }
  }
  ctx.globalAlpha = 1;

  // floating text
  ctx.font = 'bold 14px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  for (i = 0; i < world.floats.length; i++) {
    var fl = world.floats[i];
    ctx.globalAlpha = clamp(fl.life / fl.maxLife, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(fl.text, fl.x + 1, fl.y + 1);
    ctx.fillStyle = fl.color;
    ctx.fillText(fl.text, fl.x, fl.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  ctx.restore();
}

/* ------------------------------------------------------------------- HUD */
function heartShape(ctx, x, y, s, filled) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.bezierCurveTo(-8, -4, -4, -11, 0, -6);
  ctx.bezierCurveTo(4, -11, 8, -4, 0, 4);
  ctx.closePath();
  ctx.fillStyle = filled ? '#e8483f' : 'rgba(0,0,0,0.35)';
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = filled ? '#7d1d18' : 'rgba(255,255,255,0.25)';
  ctx.stroke();
  if (filled) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(-3, -4, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function panel(x, y, w, h, r) {
  ctx.fillStyle = 'rgba(7,20,30,0.55)';
  rrect(ctx, x, y, w, h, r); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  rrect(ctx, x, y, w, h, r); ctx.stroke();
}

function drawHUD() {
  var world = Game.world;
  if (!world) return;
  var p = world.player;

  // hearts
  panel(14, 14, 14 + p.maxHealth * 30, 40, 10);
  for (var i = 0; i < p.maxHealth; i++) {
    heartShape(ctx, 38 + i * 30, 34, 2.0, i < p.health);
  }

  // score
  panel(W - 214, 14, 200, 40, 10);
  ctx.font = 'bold 20px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#ffe9a8';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('SCORE  ' + world.score, W - 30, 35);

  // level name
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText(world.name.toUpperCase(), W / 2, 30);

  // carried fish badge
  if (p.carry) {
    var bob = Math.sin(world.time * 0.15) * 2;
    panel(W / 2 - 108, H - 62 + bob, 216, 42, 10);
    ctx.textAlign = 'left';
    ctx.font = 'bold 16px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#ffd166';
    ctx.fillText('SUNFISH AMMO READY', W / 2 - 84, H - 41 + bob);

    ctx.save();
    ctx.translate(W / 2 - 96, H - 42 + bob);
    var c = SUN_COLORS.drifter;
    ctx.fillStyle = c.fin;
    ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-13, -5); ctx.lineTo(-13, 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c.body;
    ctx.beginPath(); ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(4, -1.5, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#22303c';
    ctx.beginPath(); ctx.arc(4.5, -1.5, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // boss bar
  if (world.boss && !world.bossDefeated && !world.boss.dead &&
      Math.abs((p.x + p.w / 2) - (world.boss.x + world.boss.w / 2)) < W) {
    var bw = 320, bx = W / 2 - bw / 2, by = 66;
    panel(bx - 10, by - 6, bw + 20, 32, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    rrect(ctx, bx, by, bw, 16, 6); ctx.fill();
    var frac = clamp(world.boss.hp / world.boss.maxHp, 0, 1);
    var gg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    gg.addColorStop(0, '#8fd6c4');
    gg.addColorStop(1, '#4fb39b');
    ctx.fillStyle = gg;
    rrect(ctx, bx + 2, by + 2, (bw - 4) * frac, 12, 4); ctx.fill();
    ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#cfe6e0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('MOLA MOLA', W / 2, by - 12);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawCrosshair() {
  var mx = Input.mouse.x, my = Input.mouse.y;
  ctx.save();
  ctx.translate(mx, my);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-15, 0); ctx.lineTo(-6, 0);
  ctx.moveTo(6, 0); ctx.lineTo(15, 0);
  ctx.moveTo(0, -15); ctx.lineTo(0, -6);
  ctx.moveTo(0, 6); ctx.lineTo(0, 15);
  ctx.stroke();
  ctx.fillStyle = Input.mouse.down ? '#ffd166' : 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function dim(alpha) {
  ctx.fillStyle = 'rgba(4,12,20,' + alpha + ')';
  ctx.fillRect(0, 0, W, H);
}

function centerText(text, y, size, color, weight) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = (weight || 'bold') + ' ' + size + 'px "Trebuchet MS", sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(text, W / 2 + 2, y + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, W / 2, y);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawTitle() {
  dim(0.62);
  var t = Game.t * 0.04;

  ctx.save();
  ctx.translate(W / 2, 150 + Math.sin(t) * 5);
  centerText('SUNFISH', -34, 68, '#ffd166');
  centerText('SLAYER', 34, 68, '#ff9f43');
  ctx.restore();

  centerText('a fisherman, a rod, and far too many sunfish', 246, 18, '#bfe3f2', 'normal');

  var rows = [
    'A / D  or  arrows  -  run',
    'W  /  SPACE  -  jump',
    'MOUSE  -  aim            CLICK  -  fire the rod',
    'stun a sunfish, touch it to grab, CLICK to hurl it',
    'E  -  grab nearby     R  -  restart     ESC  -  pause     M  -  mute'
  ];
  for (var i = 0; i < rows.length; i++) {
    centerText(rows[i], 306 + i * 27, 16, i === 3 ? '#9be7ff' : 'rgba(235,245,250,0.88)', 'normal');
  }

  var pulse = 0.55 + Math.sin(Game.t * 0.09) * 0.45;
  ctx.globalAlpha = pulse;
  centerText('CLICK  TO  CAST  OFF', 480, 30, '#ffffff');
  ctx.globalAlpha = 1;
}

function drawPause() {
  dim(0.6);
  centerText('PAUSED', H / 2 - 30, 56, '#ffd166');
  centerText('press ESC to keep fishing', H / 2 + 30, 18, '#bfe3f2', 'normal');
}

function drawDead() {
  dim(0.68);
  centerText('YOU SANK', H / 2 - 70, 62, '#ff6b5d');
  centerText('the sunfish win this round', H / 2 - 16, 20, '#bfe3f2', 'normal');
  centerText('SCORE  ' + Game.world.score, H / 2 + 30, 30, '#ffe9a8');
  centerText('press  R  to try again', H / 2 + 92, 20, '#ffffff', 'normal');
}

function drawClear() {
  dim(0.58);
  var t = Game.t * 0.06;
  ctx.save();
  ctx.translate(W / 2, 180 + Math.sin(t) * 5);
  centerText('LEVEL CLEAR', 0, 60, '#3ddc84');
  ctx.restore();
  centerText(Game.world.name + ' is yours, captain.', 250, 20, '#bfe3f2', 'normal');
  centerText('SCORE  ' + Game.world.score, 318, 34, '#ffe9a8');
  centerText('press  SPACE  for the next level', 400, 20, '#ffffff', 'normal');
}

function drawWin() {
  dim(0.62);
  var t = Game.t * 0.06;
  ctx.save();
  ctx.translate(W / 2, 180 + Math.sin(t) * 5);
  centerText('GAME CLEAR', 0, 60, '#3ddc84');
  ctx.restore();
  centerText('Every last sunfish, accounted for.', 250, 20, '#bfe3f2', 'normal');
  centerText('FINAL SCORE  ' + Game.world.score, 318, 34, '#ffe9a8');
  centerText('press  R  to start over', 400, 20, '#ffffff', 'normal');
}

function render(a) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  var camApprox = {
    x: lerp(Game.camP.x, Game.cam.x, a),
    y: lerp(Game.camP.y, Game.cam.y, a)
  };

  drawSky(camApprox);
  drawWorldLayer(a);

  if (Game.state === 'play') { drawHUD(); }
  else if (Game.state === 'pause') { drawHUD(); drawPause(); }
  else if (Game.state === 'dead') { drawHUD(); drawDead(); }
  else if (Game.state === 'clear') { drawHUD(); drawClear(); }
  else if (Game.state === 'win') { drawHUD(); drawWin(); }
  else { drawTitle(); }

  // the OS pointer is hidden on the canvas, so always draw our own
  drawCrosshair();

  // vignette
  var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

/* ------------------------------------------------------------- main loop */
function update() {
  if (Input.pressed('KeyM')) {
    var m = Sfx.toggleMute();
    if (!m) Sfx.pickup();
  }

  if (Game.state === 'title') {
    if (Input.mouse.justDown || Input.pressed('Space', 'Enter', 'KeyW')) {
      Sfx.init();
      Game.state = 'play';
    }
    return;
  }

  if (Game.state === 'play') {
    if (Input.pressed('Escape')) { Game.state = 'pause'; return; }
    step();
  } else if (Game.state === 'pause') {
    if (Input.pressed('Escape')) Game.state = 'play';
    if (Input.pressed('KeyR')) { resetLevel(); Game.state = 'play'; }
  } else if (Game.state === 'clear') {
    if (Input.pressed('Space', 'Enter', 'KeyW')) { advanceLevel(); Game.state = 'play'; }
    if (Input.pressed('KeyR')) { resetLevel(); Game.state = 'play'; }
  } else if (Game.state === 'dead') {
    if (Input.pressed('KeyR')) { resetLevel(); Game.state = 'play'; }
  } else if (Game.state === 'win') {
    if (Input.pressed('KeyR')) {
      Game.levelIndex = 0; Game.score = 0;
      resetLevel(); Game.state = 'play';
    }
  }
}

var acc = 0;
var last = performance.now();

function frame(now) {
  var dt = now - last;
  last = now;
  if (dt > 250) dt = 250;
  acc += dt;

  var guard = 0, ran = 0;
  while (acc >= STEP && guard < 5) {
    update();
    acc -= STEP;
    guard++;
    ran++;
  }
  if (guard >= 5) acc = 0;

  Game.t++;
  render(clamp(acc / STEP, 0, 1));
  // Only clear edge-triggered input once a logic step has consumed it.
  // Otherwise presses made during a zero-step render frame (common on
  // >60Hz displays, or when frame timing runs just fast) are dropped.
  if (ran > 0) Input.endFrame();
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ boot */
resetLevel();
requestAnimationFrame(frame);
