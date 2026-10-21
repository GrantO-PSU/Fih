# 🐟 Sunfish Slayer

A 2D platformer where you play a fisherman with a rod that shoots, in a sea
absolutely infested with sunfish.

**Just open `index.html` in a browser.** No build step, no dependencies, no
server needed.

## Controls

| Input | Action |
| --- | --- |
| `A` / `D` or `←` / `→` | Run |
| `W` / `Space` | Jump (hold for a higher jump) |
| Mouse | Aim — the fisherman's rod tracks the cursor |
| Left click | Fire: a pellet normally, or hurl a carried sunfish |
| `E` | Grab a stunned sunfish within reach |
| `R` | Restart the level |
| `Esc` | Pause |
| `M` | Mute / unmute |

## The sunfish loop

Sunfish are both the enemies **and** your best ammo:

1. **Shoot** a sunfish — it gets *stunned*, not killed.
2. **Touch** it (or press `E`) to scoop it up and carry it overhead.
3. **Click** to hurl it — a heavy, piercing, wall-bouncing projectile that
   one-shots anything it touches.

Shoot a stunned sunfish again and it just dies (quick, but you lose the ammo).
So the smart play is stun → grab → throw it into a crowd.

Touching a *live* sunfish costs you a heart — only stunned ones are safe to
handle.

## Level 1 — "The Dock"

Starting dock, four islands, a water hazard that sends you back to your last
solid footing, wooden one-way platforms up high holding golden fish, and a
**Mola Mola** mini-boss guarding a goal that stays locked until it's dead.

## Level 2 — "The Reef"

Reaching the Dock's goal doesn't end the run — it carries your score into a
second, meaner stretch. The Reef is taller and tighter: raised pillars, a
climbing stack of one-way platforms, a moving platform ride across a long
chasm, and a second **Mola Mola** between you and the light.

Clear it and you get the **GAME CLEAR** screen with your final score.

## Scoring

| Event | Points |
| --- | --- |
| Stun a sunfish | 10 |
| Finish off a stunned sunfish | 25 |
| Kill a sunfish with a thrown sunfish | 50 |
| Hit the Mola | 20 |
| Kill the Mola | 300 |
| Golden fish | 100 |

Your score carries from one level to the next; the **GAME CLEAR** screen shows
the final total.

## Files

```
index.html        canvas, HUD markup, script tags
js/input.js       keyboard + mouse state
js/audio.js       WebAudio blip synth (no audio files)
js/level.js       level data: terrain, enemies, pickups, signs
js/entities.js    player, sunfish, pellets, collectibles, boss, physics
js/game.js        loop, collisions, camera, parallax, HUD, overlays, progression
```

Classic `<script>` tags (not ES modules) specifically so the game runs straight
off `file://`. All art is drawn procedurally on the canvas — there are no image
or sound assets to download.
