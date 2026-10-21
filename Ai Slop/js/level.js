'use strict';

/*
  Level data. Tiles are 32px. Solids / oneways / water are [col,row,w,h] rects.
  Enemies use { cx: centre-x px, by: bottom-y px }.
  Collectibles use { cx, cy } in px.
*/
var TILE = 32;

var LEVEL1 = {
  name: 'The Dock',
  cols: 90,
  rows: 20,
  spawn: { x: 112, y: 480 },

  // ground masses
  solids: [
    [0, 15, 12, 5],    // starting dock      cols  0-11
    [15, 15, 11, 5],   // island B           cols 15-25
    [29, 15, 9, 5],    // island C           cols 29-37
    [41, 14, 9, 6],    // island D (higher)  cols 41-49
    [53, 13, 9, 7],    // island E (higher)  cols 53-61
    [65, 13, 10, 7],   // island F           cols 65-74
    [78, 12, 12, 8]    // final fort + goal  cols 78-89
  ],

  // one-way wooden platforms
  oneways: [
    [32, 12, 4, 1],
    [37, 10, 4, 1],
    [55, 10, 4, 1],
    [68, 10, 4, 1]
  ],

  // moving platforms (one-way from above, and they carry you)
  movers: [
    { x: 790, y: 462, w: 84, h: 14, axis: 'x', min: 790, max: 900, speed: 1.1 },
    { x: 2408, y: 490, w: 88, h: 14, axis: 'y', min: 384, max: 490, speed: 0.85 }
  ],

  // instant-respawn water
  water: [
    [12, 16, 3, 4],
    [26, 16, 3, 4],
    [38, 16, 3, 4],
    [50, 16, 3, 4],
    [62, 16, 3, 4],
    [75, 16, 3, 4]
  ],

  enemies: [
    { kind: 'drifter', cx: 430, by: 330 },
    { kind: 'drifter', cx: 700, by: 300 },
    { kind: 'drifter', cx: 900, by: 280 },
    { kind: 'drifter', cx: 1180, by: 300 },
    { kind: 'drifter', cx: 1500, by: 250 },
    { kind: 'drifter', cx: 1760, by: 320 },
    { kind: 'drifter', cx: 2050, by: 280 },

    { kind: 'bouncer', cx: 640, by: 480 },
    { kind: 'bouncer', cx: 1100, by: 480 },
    { kind: 'bouncer', cx: 1480, by: 448 },
    { kind: 'bouncer', cx: 1850, by: 416 },
    { kind: 'bouncer', cx: 2200, by: 416 }
  ],

  collectibles: [
    { cx: 1072, cy: 356 },
    { cx: 1264, cy: 296 },
    { cx: 1808, cy: 296 },
    { cx: 2240, cy: 296 },
    { cx: 2380, cy: 380 }
  ],

  signs: [
    { cx: 210, by: 480, text: 'A / D to move    W or SPACE to jump' },
    { cx: 580, by: 480, text: 'Aim with the mouse, CLICK to fire' },
    { cx: 1030, by: 480, text: 'Hit a sunfish to STUN it, then touch it' },
    { cx: 1420, by: 448, text: 'CLICK while carrying to hurl it!' }
  ],

  goal: { x: 2806, y: 264, w: 50, h: 120 },

  boss: { x: 2545, y: 246, w: 120, h: 130, minX: 2545, maxX: 2670 }
};

var LEVEL2 = {
  name: 'The Reef',
  cols: 100,
  rows: 20,
  spawn: { x: 96, y: 480 },

  // ground masses
  solids: [
    [0, 15, 10, 5],    // starting deck     cols  0-9   top y 480
    [12, 15, 8, 5],    // shelf             cols 12-19   top y 480
    [22, 14, 8, 6],    // raised shelf      cols 22-29   top y 448
    [33, 13, 8, 7],    // pillar            cols 33-40   top y 416
    [44, 13, 8, 7],    // pillar            cols 44-51   top y 416
    [65, 14, 8, 6],    // far shelf         cols 65-72   top y 448
    [75, 13, 8, 7],    // far pillar        cols 75-82   top y 416
    [86, 12, 14, 8]    // final fort + goal cols 86-99   top y 384
  ],

  // one-way wooden platforms (climb + golden fish)
  oneways: [
    [17, 12, 3, 1],
    [46, 10, 3, 1],
    [50, 8, 3, 1],
    [78, 11, 3, 1]
  ],

  // moving platforms (one-way from above, and they carry you)
  movers: [
    { x: 1680, y: 470, w: 88, h: 14, axis: 'x', min: 1680, max: 1972, speed: 1.3 },
    { x: 1312, y: 470, w: 88, h: 14, axis: 'y', min: 352, max: 470, speed: 0.9 }
  ],

  // instant-respawn water
  water: [
    [10, 16, 2, 4],
    [20, 16, 2, 4],
    [30, 16, 3, 4],
    [41, 16, 3, 4],
    [52, 16, 13, 4],   // the long chasm
    [73, 16, 2, 4],
    [83, 16, 3, 4]
  ],

  enemies: [
    { kind: 'drifter', cx: 480, by: 360 },
    { kind: 'drifter', cx: 800, by: 330 },
    { kind: 'drifter', cx: 1150, by: 300 },
    { kind: 'drifter', cx: 1520, by: 300 },
    { kind: 'drifter', cx: 1900, by: 330 },
    { kind: 'drifter', cx: 2250, by: 320 },
    { kind: 'drifter', cx: 2560, by: 280 },
    { kind: 'drifter', cx: 2900, by: 300 },

    { kind: 'bouncer', cx: 560, by: 480 },
    { kind: 'bouncer', cx: 1000, by: 448 },
    { kind: 'bouncer', cx: 1180, by: 416 },
    { kind: 'bouncer', cx: 1620, by: 416 },
    { kind: 'bouncer', cx: 2150, by: 448 },
    { kind: 'bouncer', cx: 2450, by: 416 },
    { kind: 'bouncer', cx: 2800, by: 384 }
  ],

  collectibles: [
    { cx: 576, cy: 330 },
    { cx: 1536, cy: 250 },
    { cx: 1632, cy: 190 },
    { cx: 2544, cy: 290 },
    { cx: 3000, cy: 330 }
  ],

  signs: [
    { cx: 160, by: 480, text: 'LEVEL 2 - THE REEF. Mind the deep water.' },
    { cx: 1210, by: 416, text: 'Ride the platforms across the deep' },
    { cx: 2480, by: 416, text: 'Stun, grab, hurl it into the Mola!' }
  ],

  goal: { x: 3040, y: 264, w: 50, h: 120 },

  boss: { x: 2820, y: 254, w: 120, h: 130, minX: 2790, maxX: 2960 }
};

var LEVELS = [LEVEL1, LEVEL2];
