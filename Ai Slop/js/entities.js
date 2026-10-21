'use strict';

/* ------------------------------------------------------------------ utils */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function sign(v) { return v < 0 ? -1 : 1; }

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function pointIn(x, y, r) {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function addInterp(Cls) {
  Cls.prototype.pos = function (a) {
    if (this.px === undefined) return { x: this.x, y: this.y };
    return { x: this.px + (this.x - this.px) * a, y: this.py + (this.y - this.py) * a };
  };
}

/* --------------------------------------------------------------- physics */
var Phys = {
  moveX: function (e, dx, solids) {
    if (dx === 0) return false;
    e.x += dx;
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (!rectsOverlap(e, s)) continue;
      if (dx > 0) e.x = s.x - e.w; else e.x = s.x + s.w;
      e.vx = 0;
      return true;
    }
    return false;
  },
  moveY: function (e, dy, solids, oneways) {
    var prevBottom = e.y + e.h;
    e.y += dy;
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (!rectsOverlap(e, s)) continue;
      if (dy > 0) { e.y = s.y - e.h; e.onGround = true; }
      else if (dy < 0) { e.y = s.y + s.h; }
      e.vy = 0;
      return true;
    }
    if (dy > 0 && oneways) {
      for (var j = 0; j < oneways.length; j++) {
        var p = oneways[j];
        if (!rectsOverlap(e, p)) continue;
        if (prevBottom <= p.y + 2) {
          e.y = p.y - e.h;
          e.vy = 0;
          e.onGround = true;
          return true;
        }
      }
    }
    return false;
  }
};

/* ------------------------------------------------------------- particles */
function burst(world, x, y, n, opt) {
  opt = opt || {};
  var colors = opt.colors || ['#ffd166', '#ef8354'];
  var spd = opt.spd === undefined ? 3 : opt.spd;
  var spread = opt.spread === undefined ? 0.7 : opt.spread;
  for (var i = 0; i < n; i++) {
    var ang = opt.dir === undefined ? rand(0, Math.PI * 2) : opt.dir + rand(-spread, spread);
    var s = rand(spd * 0.3, spd);
    var life = randInt(opt.lifeMin || 16, opt.lifeMax || 36);
    world.particles.push({
      x: x, y: y,
      vx: Math.cos(ang) * s,
      vy: Math.sin(ang) * s - (opt.up || 0),
      g: opt.g === undefined ? 0.16 : opt.g,
      size: rand(opt.sizeMin || 2, opt.sizeMax || 5),
      life: life, maxLife: life,
      color: pick(colors),
      round: !!opt.round
    });
  }
}

function addFloat(world, x, y, text, color) {
  world.floats.push({ x: x, y: y, text: text, color: color || '#fff', life: 48, maxLife: 48 });
}

/* ---------------------------------------------------------------- player */
var PC = {
  MAXSPD: 3.6,
  ACCEL: 0.72,
  AIRACCEL: 0.42,
  FRIC: 0.74,
  AIRFRIC: 0.94,
  GRAV: 0.60,
  JUMP: -11.8,     // apex ~116px, which clears the 96px one-way platforms with margin
  CUT: -3.6,
  MAXFALL: 15
};

function Player(x, y) {
  this.w = 20; this.h = 30;
  this.x = x - this.w / 2;
  this.y = y - this.h;
  this.spawnX = this.x; this.spawnY = this.y;
  this.vx = 0; this.vy = 0;
  this.onGround = false;
  this.coyote = 0; this.jumpBuf = 0;
  this.facing = 1;
  this.health = 3; this.maxHealth = 3;
  this.invuln = 0;
  this.carry = null;
  this.shootCd = 0;
  this.aim = 0;
  this.walkPhase = 0;
  this.sx = 1; this.sy = 1;
  this.dead = false;
  this.lastSafe = { x: this.x, y: this.y };
  this.muzzle = { x: this.x, y: this.y };
}

Player.prototype.update = function (world) {
  var m = world.mouse;
  var cx = this.x + this.w / 2;
  var cy = this.y + this.h / 2;
  this.aim = Math.atan2(m.y - cy, m.x - cx);

  // ---- horizontal
  var ax = 0;
  if (Input.down('KeyA') || Input.down('ArrowLeft')) ax -= 1;
  if (Input.down('KeyD') || Input.down('ArrowRight')) ax += 1;
  var accel = this.onGround ? PC.ACCEL : PC.AIRACCEL;
  if (ax !== 0) {
    this.vx += ax * accel;
    this.facing = ax;
  } else {
    this.vx *= this.onGround ? PC.FRIC : PC.AIRFRIC;
    if (Math.abs(this.vx) < 0.05) this.vx = 0;
  }
  this.vx = clamp(this.vx, -PC.MAXSPD, PC.MAXSPD);

  // ---- jump (coyote + buffer + variable height)
  if (Input.pressed('Space', 'KeyW', 'ArrowUp')) this.jumpBuf = 8;
  if (this.jumpBuf > 0) this.jumpBuf--;
  if (this.onGround) this.coyote = 8;
  else if (this.coyote > 0) this.coyote--;

  var held = Input.any('Space', 'KeyW', 'ArrowUp');
  if (this.jumpBuf > 0 && this.coyote > 0) {
    this.vy = PC.JUMP;
    this.jumpBuf = 0; this.coyote = 0; this.onGround = false;
    this.sy = 1.3; this.sx = 0.76;
    Sfx.jump();
  }
  if (!held && this.vy < PC.CUT) this.vy = PC.CUT;

  // ---- gravity + integrate
  this.vy = Math.min(this.vy + PC.GRAV, PC.MAXFALL);

  Phys.moveX(this, this.vx, world.solids);
  var wasGround = this.onGround;
  this.onGround = false;
  Phys.moveY(this, this.vy, world.solids, world.onewaysAll);

  if (this.onGround && !wasGround) {
    this.sy = 0.72; this.sx = 1.32;
    Sfx.land();
    burst(world, cx, this.y + this.h, 6, {
      colors: ['#cbd8e0', '#93a7b3'], spd: 2.2, g: 0.06, up: 1,
      lifeMin: 12, lifeMax: 22, sizeMin: 1.5, sizeMax: 3
    });
  }

  this.sx += (1 - this.sx) * 0.18;
  this.sy += (1 - this.sy) * 0.18;

  if (this.onGround && Math.abs(this.vx) > 0.4) this.walkPhase += Math.abs(this.vx) * 0.22;

  if (this.invuln > 0) this.invuln--;

  // ---- muzzle (rod tip)
  this.muzzle.x = cx + Math.cos(this.aim) * 38;
  this.muzzle.y = (this.y + this.h - 20) + Math.sin(this.aim) * 38;

  // ---- firing
  if (this.shootCd > 0) this.shootCd--;
  if (Input.mouse.down && this.shootCd <= 0) {
    if (this.carry) { this.throwCarry(world); this.shootCd = 26; }
    else { this.fire(world); this.shootCd = 9; }
  }

  // ---- grabbing
  if (!this.carry) {
    var best = null, bestD = 1e9;
    for (var i = 0; i < world.sunfishes.length; i++) {
      var f = world.sunfishes[i];
      if (f.mode !== 'stunned' || f.grabLock > 0 || f.dead) continue;
      if (rectsOverlap(this, f)) { best = f; break; }
      var d = Math.abs((f.x + f.w / 2) - cx) + Math.abs((f.y + f.h / 2) - cy);
      if (Input.down('KeyE') && d < 60 && d < bestD) { bestD = d; best = f; }
    }
    if (best) this.pickUp(world, best);
  }

  // ---- checkpoint
  if (this.onGround && solidAt(world, cx, this.y + this.h + 3)) {
    this.lastSafe.x = this.x;
    this.lastSafe.y = this.y;
  }
};

Player.prototype.fire = function (world) {
  var a = this.aim;
  world.pellets.push(new Pellet(
    this.muzzle.x - 5, this.muzzle.y - 2, a
  ));
  burst(world, this.muzzle.x, this.muzzle.y, 3, {
    colors: ['#ffe6a8', '#ffb347'], spd: 2.4, dir: a, spread: 0.5,
    g: 0.02, lifeMin: 7, lifeMax: 13, sizeMin: 1, sizeMax: 2.5
  });
  this.vx -= Math.cos(a) * 0.3;
  Sfx.shoot();
};

Player.prototype.pickUp = function (world, f) {
  f.mode = 'carried';
  f.vx = 0; f.vy = 0;
  this.carry = f;
  Sfx.grab();
  burst(world, f.x + f.w / 2, f.y + f.h / 2, 6, {
    colors: ['#9be7ff', '#ffffff'], spd: 2, lifeMin: 10, lifeMax: 20
  });
};

Player.prototype.throwCarry = function (world) {
  var f = this.carry;
  if (!f) return;
  this.carry = null;
  var a = this.aim;
  f.mode = 'thrown';
  f.grabLock = 30;
  f.life = 190;
  f.pierce = 4;
  f.vx = Math.cos(a) * 14;
  f.vy = Math.sin(a) * 14;
  f.x = this.x + this.w / 2 + Math.cos(a) * 18 - f.w / 2;
  f.y = this.y + this.h / 2 + Math.sin(a) * 18 - f.h / 2;
  f.spin = 0;
  world.shake = Math.max(world.shake, 4);
  Sfx.throwSun();
};

Player.prototype.dropCarry = function (world) {
  var f = this.carry;
  if (!f) return;
  this.carry = null;
  f.mode = 'stunned';
  f.grabLock = 40;
  f.vx = rand(-1, 1);
  f.vy = -2;
};

Player.prototype.draw = function (ctx, a) {
  if (this.invuln > 0 && Math.floor(this.invuln / 4) % 2 === 0) return;

  var p = this.pos(a);
  var cx = p.x + this.w / 2;
  var bottom = p.y + this.h;
  var flip = this.facing < 0 ? -1 : 1;

  ctx.save();
  ctx.translate(cx, bottom);
  ctx.scale(this.sx * flip, this.sy);

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  var swing = this.onGround ? Math.sin(this.walkPhase) * 3.5 : 2;

  // boots
  ctx.fillStyle = '#16293b';
  ctx.fillRect(-8 + swing, -6, 7, 6);
  ctx.fillRect(1 - swing, -6, 7, 6);
  // trousers
  ctx.fillStyle = '#2b4c6b';
  ctx.fillRect(-8 + swing, -14, 7, 9);
  ctx.fillRect(1 - swing, -14, 7, 9);
  // yellow slicker
  ctx.fillStyle = '#f2b134';
  rrect(ctx, -10, -25, 20, 13, 3); ctx.fill();
  ctx.fillStyle = '#dc9a1d';
  ctx.fillRect(-10, -15, 20, 3);
  // scarf
  ctx.fillStyle = '#c8452f';
  ctx.fillRect(-9, -26, 18, 3);

  // beard
  ctx.fillStyle = '#f0f2f4';
  ctx.fillRect(-7, -31, 14, 8);
  ctx.fillStyle = '#d8dde2';
  ctx.fillRect(-7, -25, 14, 2);

  // face
  ctx.fillStyle = '#eab98c';
  ctx.fillRect(-6, -35, 12, 8);
  // eye
  ctx.fillStyle = '#22303c';
  ctx.fillRect(2, -32, 2, 2.5);

  // sou'wester hat
  ctx.fillStyle = '#f2b134';
  ctx.beginPath();
  ctx.moveTo(-9, -35);
  ctx.quadraticCurveTo(0, -46, 9, -35);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#dc9a1d';
  ctx.fillRect(-12, -36, 24, 3);

  ctx.restore();

  // ---- arm + rod (rotates freely toward the cursor)
  ctx.save();
  ctx.translate(cx, bottom - 20);
  ctx.rotate(this.aim);

  ctx.fillStyle = '#f2b134';
  rrect(ctx, 0, -3.5, 13, 7, 3); ctx.fill();
  ctx.fillStyle = '#eab98c';
  ctx.beginPath(); ctx.arc(13, 0, 3.6, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = '#8a5a2b';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(30, 0); ctx.stroke();

  ctx.strokeStyle = 'rgba(232,242,248,0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(38, 0); ctx.stroke();

  ctx.fillStyle = '#d6e2ea';
  ctx.beginPath(); ctx.arc(38, 0, 2.4, 0, Math.PI * 2); ctx.fill();

  if (this.carry) {
    ctx.fillStyle = '#7a3b06';
    ctx.beginPath(); ctx.arc(30, 0, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
};

/* --------------------------------------------------------------- sunfish */
var SUN_COLORS = {
  drifter: { body: '#ffb03a', belly: '#ffdd9b', fin: '#e8791f', line: '#7a3b06' },
  bouncer: { body: '#ff8f4d', belly: '#ffd0a5', fin: '#d95f16', line: '#6d3208' }
};

function Sunfish(kind, cx, by) {
  this.kind = kind;
  this.w = 30; this.h = 26;
  this.x = cx - this.w / 2;
  this.y = by - this.h;
  this.vx = 0; this.vy = 0;
  this.mode = 'alive';
  this.phase = rand(0, Math.PI * 2);
  this.grabLock = 0;
  this.spin = 0;
  this.facing = Math.random() < 0.5 ? -1 : 1;
  this.dead = false;
  this.hurtFlash = 0;
  this.life = 0;
  this.pierce = 4;
  this.onGround = false;
  this.anim = randInt(0, 100);
  this.hopTimer = randInt(40, 90);
  this.vx = this.facing * 0.9;
}

Sunfish.prototype.update = function (world) {
  this.anim++;
  if (this.grabLock > 0) this.grabLock--;
  if (this.hurtFlash > 0) this.hurtFlash--;

  if (this.mode === 'alive') this.updateAlive(world);
  else if (this.mode === 'stunned') this.updateStunned(world);
  else if (this.mode === 'carried') this.updateCarried(world);
  else if (this.mode === 'thrown') this.updateThrown(world);
};

Sunfish.prototype.updateAlive = function (world) {
  var player = world.player;

  if (this.kind === 'drifter') {
    this.phase += 0.045;
    var px = player.x + player.w / 2, py = player.y + player.h / 2;
    var dx = px - (this.x + this.w / 2);
    var dy = py - (this.y + this.h / 2);
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 270 && d > 1) {
      this.vx += (dx / d) * 0.055;
      this.vy += (dy / d) * 0.055;
      this.facing = dx > 0 ? 1 : -1;
    } else {
      this.vx *= 0.96; this.vy *= 0.96;
    }
    this.vx = clamp(this.vx, -1.5, 1.5);
    this.vy = clamp(this.vy, -1.2, 1.2);
    this.x += this.vx;
    this.y += this.vy + Math.sin(this.phase) * 0.65;
    this.x = clamp(this.x, 8, world.width - this.w - 8);
    this.y = clamp(this.y, 32, world.height - 130);
    return;
  }

  // bouncer: patrol a platform, hopping
  this.hopTimer--;
  this.vy = Math.min(this.vy + PC.GRAV, PC.MAXFALL);

  var blocked = Phys.moveX(this, this.vx, world.solids);
  if (blocked) this.facing *= -1;

  var wasGround = this.onGround;
  this.onGround = false;
  Phys.moveY(this, this.vy, world.solids, world.onewaysAll);

  if (this.onGround) {
    this.vx = this.facing * 0.9;
    if (this.hopTimer <= 0) {
      this.vy = -7.6;
      this.onGround = false;
      this.hopTimer = randInt(55, 95);
    }
  }

  // turn around at ledges
  if (this.onGround && wasGround) {
    var probeX = this.facing > 0 ? this.x + this.w + 3 : this.x - 3;
    var probeY = this.y + this.h + 5;
    var ground = false;
    for (var i = 0; i < world.solids.length; i++) {
      if (pointIn(probeX, probeY, world.solids[i])) { ground = true; break; }
    }
    if (!ground) { this.facing *= -1; this.vx = this.facing * 0.9; }
  }

  if (this.x < 8) { this.x = 8; this.facing = 1; this.vx = 0.9; }
  if (this.x + this.w > world.width - 8) {
    this.x = world.width - this.w - 8; this.facing = -1; this.vx = -0.9;
  }

  // fell in the water
  for (var w = 0; w < world.water.length; w++) {
    if (this.y + this.h > world.water[w].y + 8 && rectsOverlap(this, world.water[w])) {
      this.kill(world, false);
      burst(world, this.x + this.w / 2, this.y + this.h, 8, {
        colors: ['#7fd7ff', '#dff6ff'], spd: 3, up: 1.5
      });
      return;
    }
  }
};

Sunfish.prototype.updateStunned = function (world) {
  this.vy = Math.min(this.vy + PC.GRAV * 0.8, PC.MAXFALL);
  this.vx *= 0.96;
  Phys.moveX(this, this.vx, world.solids);
  this.onGround = false;
  Phys.moveY(this, this.vy, world.solids, world.onewaysAll);
  if (this.onGround) this.vx *= 0.8;
  this.spin += 0.06;

  // a stunned fish that slips into the sea is gone for good
  if (this.y > world.height + 80) { this.dead = true; return; }
  for (var w = 0; w < world.water.length; w++) {
    if (rectsOverlap(this, world.water[w])) {
      burst(world, this.x + this.w / 2, world.water[w].y, 8, {
        colors: ['#7fd7ff', '#dff6ff'], spd: 3, up: 1.5
      });
      Sfx.splash();
      this.dead = true;
      return;
    }
  }
};

Sunfish.prototype.updateCarried = function (world) {
  var p = world.player;
  var tx = p.x + p.w / 2 - this.w / 2;
  var ty = p.y - this.h - 6 + Math.sin(this.anim * 0.12) * 2.5;
  this.x += (tx - this.x) * 0.4;
  this.y += (ty - this.y) * 0.4;
  this.spin = Math.sin(this.anim * 0.1) * 0.14;
};

Sunfish.prototype.updateThrown = function (world) {
  this.life--;
  var svx = this.vx, svy = this.vy;

  var hitX = Phys.moveX(this, svx, world.solids);
  var ny = svy + 0.18;
  var hitY = Phys.moveY(this, ny, world.solids, null);

  this.vx = hitX ? -svx * 0.78 : svx;
  this.vy = hitY ? -svy * 0.6 : ny;

  if (hitX || hitY) {
    this.pierce--;
    world.shake = Math.max(world.shake, 2.5);
    burst(world, this.x + this.w / 2, this.y + this.h / 2, 4, {
      colors: ['#ffd166', '#ff8a3d'], spd: 2.6, lifeMin: 8, lifeMax: 16
    });
  }

  this.spin += 0.45;

  // trail
  if (this.life % 2 === 0) {
    burst(world, this.x + this.w / 2, this.y + this.h / 2, 1, {
      colors: ['#ffd166'], spd: 0.6, g: 0, lifeMin: 8, lifeMax: 12, sizeMin: 2, sizeMax: 4
    });
  }

  for (var w = 0; w < world.water.length; w++) {
    if (rectsOverlap(this, world.water[w])) {
      burst(world, this.x + this.w / 2, world.water[w].y, 10, {
        colors: ['#7fd7ff', '#dff6ff'], spd: 3.4, up: 2
      });
      Sfx.splash();
      this.dead = true;
      return;
    }
  }

  if (this.life <= 0 || this.pierce <= 0) {
    this.dead = true;
    burst(world, this.x + this.w / 2, this.y + this.h / 2, 6, {
      colors: ['#ffd166', '#ff8a3d'], spd: 2.4
    });
  }
};

Sunfish.prototype.stun = function (world) {
  this.mode = 'stunned';
  this.vy = -3;
  this.vx = rand(-2, 2);
  this.grabLock = 14;
  this.hurtFlash = 12;
  world.shake = Math.max(world.shake, 3);
  Sfx.stun();
  burst(world, this.x + this.w / 2, this.y + this.h / 2, 9, {
    colors: ['#9be7ff', '#ffffff', '#ffd166'], spd: 3, round: true,
    lifeMin: 12, lifeMax: 26, sizeMin: 1.5, sizeMax: 3.5
  });
};

Sunfish.prototype.kill = function (world, flung) {
  if (this.dead) return;
  this.dead = true;
  world.shake = Math.max(world.shake, flung ? 5 : 2.5);
  Sfx.kill();
  burst(world, this.x + this.w / 2, this.y + this.h / 2, flung ? 16 : 11, {
    colors: ['#ffb03a', '#ff8a3d', '#ffd166', '#ffffff'],
    spd: flung ? 5 : 3.6, lifeMin: 14, lifeMax: 34, sizeMin: 2, sizeMax: 4.5
  });
};

Sunfish.prototype.draw = function (ctx, a) {
  var p = this.pos(a);
  var cx = p.x + this.w / 2, cy = p.y + this.h / 2;
  var c = SUN_COLORS[this.kind] || SUN_COLORS.drifter;
  var stunned = this.mode === 'stunned';
  var flip = this.facing < 0 ? -1 : 1;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(this.spin);
  ctx.scale(flip, 1);

  var wob = Math.sin(this.anim * 0.18) * 1.4;

  // tail
  ctx.fillStyle = c.fin;
  ctx.beginPath();
  ctx.moveTo(-13, 0);
  ctx.lineTo(-22, -9 + wob);
  ctx.lineTo(-22, 9 + wob);
  ctx.closePath();
  ctx.fill();

  // top + bottom fins
  ctx.beginPath();
  ctx.moveTo(-2, -9); ctx.lineTo(4, -18); ctx.lineTo(9, -8); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-2, 9); ctx.lineTo(3, 17); ctx.lineTo(8, 8); ctx.closePath(); ctx.fill();

  // body
  ctx.fillStyle = this.hurtFlash > 0 ? '#ffffff' : c.body;
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // belly
  ctx.fillStyle = c.belly;
  ctx.beginPath();
  ctx.ellipse(-1, 4, 10, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // stripes
  ctx.strokeStyle = c.fin;
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(-4, 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(3, -7); ctx.lineTo(3, 3); ctx.stroke();

  // outline
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(0, 0, 14, 11, 0, 0, Math.PI * 2); ctx.stroke();

  // eye
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(8, -2, 4.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = c.line; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(8, -2, 4.2, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#22303c';
  if (stunned) {
    ctx.lineWidth = 1.6; ctx.strokeStyle = '#22303c';
    ctx.beginPath();
    ctx.moveTo(6, -4.5); ctx.lineTo(10, -0.5);
    ctx.moveTo(10, -4.5); ctx.lineTo(6, -0.5);
    ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(9, -2, 1.9, 0, Math.PI * 2); ctx.fill();
  }

  // mouth
  ctx.strokeStyle = c.line; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(12, 1.5, 3, -0.6, 0.8); ctx.stroke();

  ctx.restore();

  // dizzy stars while stunned
  if (stunned) {
    ctx.save();
    ctx.translate(cx, cy - 20);
    for (var i = 0; i < 3; i++) {
      var ang = this.anim * 0.09 + i * (Math.PI * 2 / 3);
      var sx = Math.cos(ang) * 11;
      var sy = Math.sin(ang) * 4;
      ctx.fillStyle = i % 2 ? '#ffe9a8' : '#9be7ff';
      drawStar(ctx, sx, sy, 3.2, 1.6, 5);
    }
    ctx.restore();
  }
};

function drawStar(ctx, x, y, r1, r2, n) {
  ctx.beginPath();
  for (var i = 0; i < n * 2; i++) {
    var r = i % 2 ? r2 : r1;
    var a = (Math.PI / n) * i - Math.PI / 2;
    var px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/* ---------------------------------------------------------------- pellet */
function Pellet(x, y, angle) {
  this.w = 10; this.h = 4;
  this.x = x; this.y = y;
  this.vx = Math.cos(angle) * 15;
  this.vy = Math.sin(angle) * 15;
  this.a = angle;
  this.life = 72;
  this.dead = false;
}

Pellet.prototype.update = function (world) {
  this.life--;
  this.x += this.vx;
  this.y += this.vy;

  if (this.life <= 0) { this.dead = true; return; }
  if (this.x < -20 || this.x > world.width + 20 || this.y < -20 || this.y > world.height + 20) {
    this.dead = true; return;
  }
  for (var i = 0; i < world.solids.length; i++) {
    if (rectsOverlap(this, world.solids[i])) {
      this.dead = true;
      burst(world, this.x + this.w / 2, this.y + this.h / 2, 4, {
        colors: ['#ffe6a8', '#c9d6de'], spd: 2, lifeMin: 6, lifeMax: 14, sizeMin: 1, sizeMax: 2.5
      });
      return;
    }
  }
};

Pellet.prototype.draw = function (ctx, a) {
  var p = this.pos(a);
  var cx = p.x + this.w / 2, cy = p.y + this.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(this.a);
  ctx.fillStyle = 'rgba(255,214,120,0.35)';
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd166';
  rrect(ctx, -5, -2, 10, 4, 2); ctx.fill();
  ctx.fillStyle = '#fff3cc';
  ctx.fillRect(1, -1, 4, 2);
  ctx.restore();
};

/* ------------------------------------------------------------ collectible */
function GoldenFish(cx, cy) {
  this.w = 22; this.h = 18;
  this.baseY = cy;
  this.x = cx - this.w / 2;
  this.y = cy - this.h / 2;
  this.phase = rand(0, Math.PI * 2);
  this.dead = false;
}

GoldenFish.prototype.update = function () {
  this.phase += 0.05;
  this.y = this.baseY - this.h / 2 + Math.sin(this.phase) * 5;
};

GoldenFish.prototype.draw = function (ctx, a) {
  var p = this.pos(a);
  var cx = p.x + this.w / 2, cy = p.y + this.h / 2;
  var glow = 0.5 + Math.sin(this.phase * 2) * 0.25;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(255,214,90,' + (0.18 + glow * 0.2) + ')';
  ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#ffd94a';
  ctx.beginPath();
  ctx.moveTo(-6, 0); ctx.lineTo(-13, -6); ctx.lineTo(-13, 6); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(1, 0, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff0a8';
  ctx.beginPath(); ctx.ellipse(0, 2.5, 6.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#a9770a'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.ellipse(1, 0, 9, 7, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#3a2a06';
  ctx.beginPath(); ctx.arc(6, -1.5, 1.8, 0, Math.PI * 2); ctx.fill();

  var tw = 0.5 + glow;
  ctx.fillStyle = 'rgba(255,255,255,' + tw + ')';
  drawStar(ctx, 9, -9, 4, 1.4, 4);
  ctx.restore();
};

/* ----------------------------------------------------------------- mover */
function Mover(o) {
  this.x = o.x; this.y = o.y;
  this.w = o.w; this.h = o.h;
  this.axis = o.axis;
  this.min = o.min; this.max = o.max;
  this.speed = o.speed;
  this.dir = 1;
  this.px = this.x; this.py = this.y;
}

Mover.prototype.update = function () {
  if (this.axis === 'x') {
    this.x += this.speed * this.dir;
    if (this.x <= this.min) { this.x = this.min; this.dir = 1; }
    if (this.x >= this.max) { this.x = this.max; this.dir = -1; }
  } else {
    this.y += this.speed * this.dir;
    if (this.y <= this.min) { this.y = this.min; this.dir = 1; }
    if (this.y >= this.max) { this.y = this.max; this.dir = -1; }
  }
};

Mover.prototype.draw = function (ctx, a) {
  var p = this.pos(a);
  ctx.fillStyle = '#6b4a2b';
  rrect(ctx, p.x, p.y, this.w, this.h, 3); ctx.fill();
  ctx.fillStyle = '#a06a34';
  ctx.fillRect(p.x + 2, p.y + 1, this.w - 4, this.h - 6);
  ctx.fillStyle = '#3d2a17';
  for (var i = 6; i < this.w - 4; i += 12) ctx.fillRect(p.x + i, p.y + 3, 2, this.h - 9);
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(p.x, p.y + this.h - 3, this.w, 3);
};

/* ------------------------------------------------------------------ boss */
function Mola(o) {
  this.w = o.w; this.h = o.h;
  this.x = o.x; this.y = o.y;
  this.minX = o.minX; this.maxX = o.maxX;
  this.vx = 0.8;
  this.hp = 5; this.maxHp = 5;
  this.phase = rand(0, Math.PI * 2);
  this.hurtFlash = 0;
  this.dying = 0;
  this.dead = false;
}

Mola.prototype.update = function (world) {
  this.phase += 0.028;
  if (this.hurtFlash > 0) this.hurtFlash--;

  if (this.dying > 0) {
    this.dying--;
    this.y += 0.35;
    if (this.dying % 5 === 0) {
      burst(world, this.x + rand(0, this.w), this.y + rand(0, this.h), 8, {
        colors: ['#ffd166', '#ff7a3d', '#ffffff'], spd: 4, up: 1
      });
      world.shake = Math.max(world.shake, 6);
    }
    if (this.dying === 0) {
      this.dead = true;
      world.bossDefeated = true;
      world.score += 300;
      addFloat(world, this.x + this.w / 2, this.y, '+300', '#ffd166');
      burst(world, this.x + this.w / 2, this.y + this.h / 2, 34, {
        colors: ['#ffd166', '#ff7a3d', '#ffffff', '#9be7ff'],
        spd: 8, lifeMin: 20, lifeMax: 50, sizeMin: 2, sizeMax: 6
      });
      world.shake = 14;
      Sfx.bossDie();
    }
    return;
  }

  if (this.hp <= 0) return;

  this.x += this.vx;
  if (this.x <= this.minX) { this.x = this.minX; this.vx = Math.abs(this.vx); }
  if (this.x >= this.maxX) { this.x = this.maxX; this.vx = -Math.abs(this.vx); }
  this.y += Math.sin(this.phase) * 0.35;
};

Mola.prototype.hit = function (world, dmg) {
  if (this.hp <= 0 || this.dying > 0) return;
  this.hp -= dmg;
  this.hurtFlash = 8;
  world.shake = Math.max(world.shake, 4);
  Sfx.bossHit();
  burst(world, this.x + rand(20, this.w - 20), this.y + rand(20, this.h - 20), 8, {
    colors: ['#cfe6e0', '#ffffff', '#ffd166'], spd: 3.5, lifeMin: 10, lifeMax: 22
  });
  world.score += 20;
  if (this.hp <= 0) {
    this.hp = 0;
    this.dying = 62;
    world.shake = 10;
  }
};

Mola.prototype.draw = function (ctx, a) {
  if (this.dead) return;
  var p = this.pos(a);
  var cx = p.x + this.w / 2, cy = p.y + this.h / 2;
  var body = this.hurtFlash > 0 ? '#ffffff' : '#8fb6ad';
  var belly = this.hurtFlash > 0 ? '#ffffff' : '#c3ded7';

  ctx.save();
  ctx.translate(cx, cy);

  // top fin
  ctx.fillStyle = '#6d9990';
  ctx.beginPath();
  ctx.moveTo(-30, -34);
  ctx.quadraticCurveTo(6, -78, 34, -30);
  ctx.closePath();
  ctx.fill();

  // bottom fin
  ctx.beginPath();
  ctx.moveTo(-30, 34);
  ctx.quadraticCurveTo(4, 76, 34, 28);
  ctx.closePath();
  ctx.fill();

  // rear fin
  ctx.beginPath();
  ctx.moveTo(-52, -10); ctx.lineTo(-76, -30); ctx.lineTo(-72, 30); ctx.lineTo(-52, 10);
  ctx.closePath(); ctx.fill();

  // body
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(0, 0, 56, 46, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = belly;
  ctx.beginPath(); ctx.ellipse(-4, 14, 42, 26, 0, 0, Math.PI * 2); ctx.fill();

  // speckles
  ctx.fillStyle = 'rgba(60,100,92,0.45)';
  ctx.beginPath(); ctx.arc(-18, -10, 4, 0, 6.28); ctx.fill();
  ctx.beginPath(); ctx.arc(6, -20, 3, 0, 6.28); ctx.fill();
  ctx.beginPath(); ctx.arc(22, 6, 3.5, 0, 6.28); ctx.fill();

  ctx.strokeStyle = '#3f6b63';
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.ellipse(0, 0, 56, 46, 0, 0, Math.PI * 2); ctx.stroke();

  // mouth
  ctx.strokeStyle = '#3f6b63'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(46, 6, 12, -0.9, 0.7); ctx.stroke();

  // eye
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(34, -14, 11, 0, 6.28); ctx.fill();
  ctx.strokeStyle = '#3f6b63'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(34, -14, 11, 0, 6.28); ctx.stroke();
  ctx.fillStyle = '#1b2a2c';
  ctx.beginPath(); ctx.arc(37, -14, 5, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(39, -16, 1.8, 0, 6.28); ctx.fill();

  ctx.restore();
};

/* ------------------------------------------------------------------ sign */
var SIGN_FONT = 'bold 12px "Trebuchet MS", sans-serif';

function Sign(cx, by, text) {
  this.w = 12; this.h = 34;
  this.x = cx - this.w / 2;
  this.y = by - this.h;
  this.text = text;
  this.tw = 0;
}

Sign.prototype.draw = function (ctx, a) {
  var p = this.pos(a);
  var cx = p.x + this.w / 2;

  if (!this.tw) {
    ctx.font = SIGN_FONT;
    this.tw = ctx.measureText(this.text).width;
  }

  var bw = this.tw + 20, bh = 22;
  var bx = cx - bw / 2, by = p.y;

  // post
  ctx.fillStyle = '#5d3f24';
  ctx.fillRect(cx - 3, by + 18, 6, this.h - 18);
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(cx - 3, by + 18, 2, this.h - 18);

  // board
  ctx.fillStyle = '#8a5a2b';
  rrect(ctx, bx, by, bw, bh, 4); ctx.fill();
  ctx.fillStyle = '#b8813f';
  rrect(ctx, bx + 2, by + 2, bw - 4, bh - 4, 3); ctx.fill();

  ctx.font = SIGN_FONT;
  ctx.fillStyle = '#3a2612';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(this.text, cx + 1, by + bh / 2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
};

/* ------------------------------------------------------------------ goal */
function Goal(x, y, w, h) {
  this.x = x; this.y = y; this.w = w; this.h = h;
  this.phase = 0;
}

Goal.prototype.update = function (world) {
  this.phase += 0.04;
  var p = world.player;
  if (world.bossDefeated && !world.won && rectsOverlap(p, this)) {
    world.won = true;
  }
};

Goal.prototype.draw = function (ctx, world) {
  var cx = this.x + this.w / 2;
  var baseY = this.y + this.h;

  // post
  ctx.fillStyle = '#5d3f24';
  ctx.fillRect(cx - 3, this.y, 6, this.h);

  if (world.bossDefeated) {
    // green banner
    var wave = Math.sin(this.phase * 2) * 3;
    ctx.fillStyle = '#3ddc84';
    ctx.beginPath();
    ctx.moveTo(cx + 3, this.y + 6);
    ctx.quadraticCurveTo(cx + 26, this.y + 20 + wave, cx + 3, this.y + 40);
    ctx.quadraticCurveTo(cx + 18, this.y + 24 - wave, cx + 3, this.y + 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    drawStar(ctx, cx + 12, this.y + 23, 5, 2, 4);
    ctx.fillStyle = 'rgba(61,220,132,0.16)';
    ctx.beginPath(); ctx.arc(cx, this.y + 30, 34, 0, Math.PI * 2); ctx.fill();
  } else {
    // red locked banner
    ctx.fillStyle = '#c8452f';
    ctx.beginPath();
    ctx.moveTo(cx + 3, this.y + 6);
    ctx.lineTo(cx + 32, this.y + 6);
    ctx.lineTo(cx + 32, this.y + 40);
    ctx.lineTo(cx + 3, this.y + 40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LOCKED', cx + 17, this.y + 23);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // base
  ctx.fillStyle = '#3d2a17';
  ctx.fillRect(cx - 10, baseY - 5, 20, 5);
};

/* --------------------------------------------------------------- exports */
addInterp(Player);
addInterp(Sunfish);
addInterp(Pellet);
addInterp(GoldenFish);
addInterp(Mover);
addInterp(Mola);
addInterp(Sign);

function solidAt(world, x, y) {
  for (var i = 0; i < world.solids.length; i++) {
    if (pointIn(x, y, world.solids[i])) return world.solids[i];
  }
  return null;
}
