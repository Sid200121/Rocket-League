[README.md](https://github.com/user-attachments/files/26068307/README.md)
# 🚀 Rocket Rumble — 2D Arena

A browser-based, single-player Rocket League-inspired 2D game. No dependencies, pure HTML/CSS/JS. Deploy anywhere instantly.

---

## 🎮 Game Modes

| Mode | Description |
|------|-------------|
| 1v1  | You vs 1 bot |
| 2v2  | You + 1 bot teammate vs 2 bots |
| 3v3  | You + 2 bot teammates vs 3 bots |

---

## 🕹️ Controls

| Key | Action |
|-----|--------|
| `W` / `↑` | Accelerate forward |
| `S` / `↓` | Reverse |
| `A` / `←` | Turn left |
| `D` / `→` | Turn right |
| `Space` | Boost |
| `Z` | Jump |
| `Escape` | Pause / Resume |

---

## ⚙️ Features

- **Physics engine** — realistic ball bounce, wall collision, car–car collision with knockback
- **Bot AI** — 3 difficulty levels (Easy / Medium / Hard)
  - Easy: slow reactions, little aggression, inaccurate targeting
  - Medium: decent positioning, moderate boost usage
  - Hard: predictive ball tracking, aggressive play, high boost utilization
- **Boost system** — 100-unit boost, drains on use, slow regeneration, pads on field
- **Boost pads** — 4 full pads (corners, 100 boost) + 5 small pads (30 boost) with cooldowns
- **Jump** — visual vertical jump
- **5-minute match timer** — overtime ready to be added
- **Goal celebrations** — flash screen on score
- **Particle effects** — boost trail, collision sparks
- **Full HUD** — score, timer, boost bar

---

## 🚀 Deploy to Vercel

### Option 1: Drag & Drop
1. Go to [vercel.com/new](https://vercel.com/new)
2. Drag the project folder directly — done!

### Option 2: GitHub + Vercel
```bash
# Push to GitHub
git init
git add .
git commit -m "Initial commit — Rocket Rumble"
git remote add origin https://github.com/YOUR_USERNAME/rocket-rumble.git
git push -u origin main
```
Then in Vercel: **Import Git Repository** → select repo → Deploy.

No build step needed — this is pure static HTML.

---

## 📁 Project Structure

```
rocket-rumble/
├── index.html   — Game HTML + screens
├── style.css    — UI, HUD, animations
├── game.js      — Physics engine + bot AI + render loop
└── README.md
```

---

## 🔧 Customization

Open `game.js` and tweak the constants at the top:

```js
const GAME_DURATION = 300;   // Match length in seconds
const CAR_SPEED = 220;       // Max car speed
const BOOST_FORCE = 420;     // Boost acceleration
const BOOST_MAX = 100;       // Max boost amount
const BALL_BOUNCE = 0.72;    // Ball bounciness (0–1)
```

---

## 📜 License

MIT — free to use, modify, and share.
