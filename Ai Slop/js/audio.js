'use strict';

/* Tiny WebAudio blip synth. No assets. Exposes a global `Sfx`. */
var Sfx = (function () {
  var ctx = null;
  var master = null;
  var noiseBuf = null;
  var muted = false;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { ctx = null; return; }
    master = ctx.createGain();
    master.gain.value = 0.26;
    master.connect(ctx.destination);

    // one second of white noise, reused for all percussive sounds
    var len = Math.floor(ctx.sampleRate);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!ctx || muted) return;
    var t0 = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  function noise(dur, vol, cut, delay) {
    if (!ctx || muted || !noiseBuf) return;
    var t0 = ctx.currentTime + (delay || 0);
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cut || 1200, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, (cut || 1200) * 0.25), t0 + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0);
    s.stop(t0 + dur + 0.03);
  }

  return {
    init: init,
    isMuted: function () { return muted; },
    toggleMute: function () { muted = !muted; return muted; },

    shoot: function () { tone(720, 0.07, 'square', 0.28, 260); noise(0.05, 0.14, 2400); },
    jump: function () { tone(330, 0.13, 'triangle', 0.34, 700); },
    land: function () { noise(0.06, 0.16, 700); },
    stun: function () {
      tone(880, 0.09, 'triangle', 0.32, 1400);
      tone(1400, 0.12, 'triangle', 0.24, 900, 0.07);
    },
    kill: function () {
      noise(0.16, 0.26, 1500);
      tone(240, 0.18, 'sawtooth', 0.26, 80);
    },
    throwSun: function () {
      noise(0.12, 0.24, 900);
      tone(200, 0.18, 'sawtooth', 0.3, 60);
    },
    grab: function () { tone(620, 0.07, 'square', 0.3, 980); },
    hurt: function () { tone(340, 0.26, 'sawtooth', 0.4, 90); noise(0.2, 0.24, 900); },
    splash: function () { noise(0.35, 0.34, 700); tone(420, 0.2, 'sine', 0.16, 120); },
    pickup: function () {
      tone(900, 0.08, 'square', 0.3);
      tone(1350, 0.13, 'square', 0.28, null, 0.07);
    },
    bossHit: function () { tone(150, 0.13, 'square', 0.42, 70); noise(0.1, 0.2, 1600); },
    bossDie: function () {
      noise(0.7, 0.45, 900);
      tone(130, 0.75, 'sawtooth', 0.44, 40);
    },
    win: function () {
      var n = [523, 659, 784, 1046];
      for (var i = 0; i < n.length; i++) tone(n[i], 0.22, 'square', 0.32, null, i * 0.11);
    },
    gameover: function () {
      tone(420, 0.3, 'sawtooth', 0.4, 300);
      tone(300, 0.5, 'sawtooth', 0.4, 100, 0.28);
    }
  };
})();
