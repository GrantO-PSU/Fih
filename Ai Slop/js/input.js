'use strict';

/* Keyboard + mouse input. Classic script, exposes a global `Input`. */
var Input = (function () {
  var keys = Object.create(null);
  var just = Object.create(null);

  var mouse = {
    x: 480, y: 272,      // position in canvas (game) coordinates
    down: false,         // held
    justDown: false      // pressed this frame
  };

  var canvas = null;

  var BLOCK = {
    Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1,
    KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, KeyE: 1, KeyR: 1
  };

  function toCanvas(e) {
    if (!canvas) return;
    var r = canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    mouse.x = (e.clientX - r.left) / r.width * canvas.width;
    mouse.y = (e.clientY - r.top) / r.height * canvas.height;
  }

  function attach(c) {
    canvas = c;

    window.addEventListener('keydown', function (e) {
      if (BLOCK[e.code]) e.preventDefault();
      if (!keys[e.code]) just[e.code] = true;
      keys[e.code] = true;
    });

    window.addEventListener('keyup', function (e) {
      if (BLOCK[e.code]) e.preventDefault();
      keys[e.code] = false;
    });

    window.addEventListener('blur', function () {
      for (var k in keys) keys[k] = false;
      mouse.down = false;
    });

    window.addEventListener('mousemove', toCanvas);
    window.addEventListener('mousedown', function (e) {
      if (e.button === 0) { mouse.down = true; mouse.justDown = true; }
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) mouse.down = false;
    });
    window.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  return {
    mouse: mouse,
    attach: attach,
    down: function (code) { return !!keys[code]; },
    any: function () {
      for (var i = 0; i < arguments.length; i++) if (keys[arguments[i]]) return true;
      return false;
    },
    pressed: function () {
      for (var i = 0; i < arguments.length; i++) if (just[arguments[i]]) return true;
      return false;
    },
    anyPressed: function () {
      for (var k in just) if (just[k]) return true;
      return false;
    },
    endFrame: function () {
      for (var k in just) delete just[k];
      mouse.justDown = false;
    }
  };
})();
