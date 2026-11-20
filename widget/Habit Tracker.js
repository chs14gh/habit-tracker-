// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: fire;

// ============================================================
//  HABIT TRACKER — small home-screen widget for Scriptable
//  Shows the habit you starred (★) in the Habits web app.
//  Name this script exactly:  Habit Tracker
// ============================================================

// ---- Settings you can change --------------------------------
// Where tapping the widget takes you (your Habits app link).
const APP_URL = "https://chs14gh.github.io/habit-tracker-/";

// The app uses the Nunito font. iOS doesn't include it, so the widget
// uses Apple's rounded system font, which is the closest match.
// If you install Nunito on your iPhone (e.g. with a font app),
// set this to true to use it.
const USE_NUNITO = false;
// -------------------------------------------------------------

const PREFIX = "HABITWIDGET:";
const fm = FileManager.local();
const STORE = fm.joinPath(fm.documentsDirectory(), "habit-tracker-widget.json");

// ---------- 1. Receive new data from the web app ----------
function decode(code) {
  try {
    code = String(code || "").trim();
    if (code.startsWith(PREFIX)) code = code.slice(PREFIX.length);
    const json = Data.fromBase64String(code).toRawString();
    const d = JSON.parse(json);
    return d && d.v === 1 ? d : null;
  } catch (e) { return null; }
}

let incoming = null;
const qp = args.queryParameters || {};
if (qp.habit) incoming = decode(qp.habit);
if (!incoming && config.runsInApp) {
  // Fallback: the app also copies a code — pick it up from the clipboard.
  try {
    const p = Pasteboard.paste();
    if (p && p.startsWith(PREFIX)) incoming = decode(p);
  } catch (e) {}
}
if (incoming) fm.writeString(STORE, JSON.stringify(incoming));

let data = null;
try { if (fm.fileExists(STORE)) data = JSON.parse(fm.readString(STORE)); } catch (e) {}

// ---------- 2. Habit maths (same rules as the app) ----------
const pad = n => String(n).padStart(2, "0");
const keyOf = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function currentStreak(done) {
  const set = new Set(done);
  let d = today();
  if (!set.has(keyOf(d))) d = addDays(d, -1); // today not done yet: streak still alive
  let n = 0;
  while (set.has(keyOf(d))) { n++; d = addDays(d, -1); }
  return n;
}

// ---------- 3. Colour helpers ----------
function hslToRgb(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
function parseColor(c) {
  c = String(c || "").trim();
  let m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 }; }
  m = c.match(/hsla?\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%(?:[,\s/]+([\d.]+))?/i);
  if (m) {
    const [r, g, b] = hslToRgb(+m[1], +m[2] / 100, +m[3] / 100);
    return { r, g, b, a: m[4] === undefined ? 1 : +m[4] };
  }
  return { r: 255, g: 200, b: 221, a: 1 };
}
const hex = (r, g, b) => "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
const NIGHT = [20, 24, 70];
function needsLight(c) {
  const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
  const mix = [c.r, c.g, c.b].map((v, i) => v * c.a + NIGHT[i] * (1 - c.a));
  return .2126 * lin(mix[0]) + .7152 * lin(mix[1]) + .0722 * lin(mix[2]) < 0.2;
}

// ---------- 4. Size: small widget in points for this iPhone ----------
function smallWidgetPoints() {
  const s = Device.screenSize();
  const w = Math.min(s.width, s.height), h = Math.max(s.width, s.height);
  const table = {
    "440x956": 170, "430x932": 170, "428x926": 170, "414x896": 169, "414x736": 159,
    "402x874": 162, "393x852": 158, "390x844": 158, "375x812": 155, "360x780": 155,
    "375x667": 148, "320x568": 141
  };
  return table[Math.round(w) + "x" + Math.round(h)] || 158;
}

// ---------- 5. Draw ----------
const FLAME = [ // viewBox 24 x 28, same shape as the app
  ["M", 12, 0], ["C", 13, 5, 8, 7, 8, 12], ["C", 8, 14, 9, 15, 10, 16], ["C", 7, 15, 5, 13, 5, 10],
  ["C", 2, 13, 0, 16, 0, 20], ["C", 0, 25, 5, 28, 12, 28], ["C", 19, 28, 24, 25, 24, 19],
  ["C", 24, 12, 18, 9, 18, 4], ["C", 16, 6, 16, 8, 16, 10], ["C", 16, 5, 14, 2, 12, 0]
];

function font(kind, size) {
  if (USE_NUNITO) return new Font(kind === "black" ? "Nunito-Black" : "Nunito-ExtraBold", size);
  return kind === "black" ? Font.blackRoundedSystemFont(size) : Font.heavyRoundedSystemFont(size);
}

function drawCard(d) {
  const pts = smallWidgetPoints();
  const scale = Device.screenScale();      // 3 on most iPhones → crisp
  const W = Math.round(pts * scale);
  const u = W / 170;                        // design units (the app card is 170 wide)
  const P = v => v * u;

  const ctx = new DrawContext();
  ctx.size = new Size(W, W);
  ctx.respectScreenScale = false;           // we already multiplied by the screen scale
  ctx.opaque = true;

  const habit = d && !d.none ? d : null;
  const c = parseColor(habit ? habit.color : "#D8C8F5");
  const light = needsLight(c);
  const INK = light ? [244, 245, 255] : [36, 32, 58];
  const ink = a => new Color(hex(...INK), a);
  const white = a => new Color("#FFFFFF", a);
  const rr = (x, y, w, h, r, color) => {
    const p = new Path(); p.addRoundedRect(new Rect(P(x), P(y), P(w), P(h)), P(r), P(r));
    ctx.addPath(p); ctx.setFillColor(color); ctx.fillPath();
  };
  const text = (str, x, y, w, h, f, color, align) => {
    ctx.setFont(f); ctx.setTextColor(color);
    if (align === "center") ctx.setTextAlignedCenter();
    else if (align === "right") ctx.setTextAlignedRight();
    else ctx.setTextAlignedLeft();
    ctx.drawTextInRect(str, new Rect(P(x), P(y), P(w), P(h)));
  };

  // Background: night sky, then the habit colour on top (shows through if see-through)
  ctx.setFillColor(new Color(hex(...NIGHT)));
  ctx.fillRect(new Rect(0, 0, W, W));
  if (c.a < 1) {
    const stars = [[18,30],[150,22],[60,150],[120,90],[30,100],[160,140],[95,40],[140,60],[75,120],[10,165]];
    ctx.setFillColor(white(0.8));
    for (const [x, y] of stars) ctx.fillEllipse(new Rect(P(x), P(y), P(1.6), P(1.6)));
  }
  ctx.setFillColor(new Color(hex(c.r, c.g, c.b), c.a));
  ctx.fillRect(new Rect(0, 0, W, W));

  if (!habit) {
    text("⭐", 14, 14, 50, 40, Font.systemFont(P(30)), white(1));
    text("Star a habit\nin the app", 14, 92, 142, 44, font("heavy", P(15)), ink(1));
    return ctx.getImage();
  }

  const done = habit.done || [];
  const set = new Set(done);
  const tk = keyOf(today());
  const isDone = set.has(tk);
  const streak = currentStreak(done);

  // Emoji (top-left)
  ctx.setFont(Font.systemFont(P(30))); ctx.setTextAlignedLeft(); ctx.setTextColor(ink(1));
  ctx.drawTextInRect(habit.emoji || "⭐", new Rect(P(13), P(12), P(60), P(42)));

  // Calendar button (top-right)
  rr(122, 14, 34, 34, 11, white(light ? 0.16 : 0.55));
  text("📅", 122, 21, 34, 22, Font.systemFont(P(16)), ink(1), "center");

  // Name (one or two lines, sitting on top of the week bars)
  const name = habit.name || "";
  const twoLines = name.length > 14;
  const nameH = twoLines ? 40 : 21;
  text(name, 14, 103 - nameH, 142, nameH + 2, font("heavy", P(16)), ink(1));

  // Last 7 days bars
  const gap = 3, bw = (142 - gap * 6) / 7;
  for (let i = 0; i < 7; i++) {
    const on = set.has(keyOf(addDays(today(), i - 6)));
    const col = light ? white(on ? 0.8 : 0.15) : ink(on ? 0.6 : 0.12);
    rr(14 + i * (bw + gap), 111, bw, 5, 2.5, col);
  }

  // Streak pill (bottom-left)
  const off = streak === 0;
  const fade = off ? 0.55 : 1;
  const num = String(streak);
  const numW = num.length * 9.6;
  const pillW = 7 + 16 + 4 + numW + 10;
  rr(14, 124.5, pillW, 29, 14.5, white((light ? 0.16 : 0.6) * fade));

  // flame
  const fx = 14 + 7, fy = 124.5 + (29 - 18) / 2, sx = 16 / 24, sy = 18 / 28;
  const fp = new Path();
  const pt = (x, y) => new Point(P(fx + x * sx), P(fy + y * sy));
  for (const seg of FLAME) {
    if (seg[0] === "M") fp.move(pt(seg[1], seg[2]));
    else fp.addCurve(pt(seg[5], seg[6]), pt(seg[1], seg[2]), pt(seg[3], seg[4]));
  }
  fp.closeSubpath();
  ctx.addPath(fp);
  ctx.setFillColor(off ? new Color("#9A8F9F", fade) : new Color("#FF6B35"));
  ctx.fillPath();

  text(num, 14 + 7 + 16 + 4, 128.5, numW + 6, 22, font("black", P(15)), ink(fade));

  // Check circle (bottom-right)
  const cx = 139, cy = 139, r = 17;
  const circ = new Rect(P(cx - r), P(cy - r), P(r * 2), P(r * 2));
  if (isDone) {
    ctx.setFillColor(light ? new Color("#F4F5FF") : new Color("#24203A"));
    ctx.fillEllipse(circ);
    const ck = new Path();
    ck.move(new Point(P(cx - 6), P(cy + 0.5)));
    ck.addLine(new Point(P(cx - 1.8), P(cy + 4.8)));
    ck.addLine(new Point(P(cx + 6.5), P(cy - 4.5)));
    ctx.addPath(ck);
    ctx.setStrokeColor(light ? new Color("#24203A") : new Color("#FFFFFF"));
    ctx.setLineWidth(P(2.8));
    ctx.strokePath();
  } else {
    ctx.setFillColor(white(light ? 0.08 : 0.35));
    ctx.fillEllipse(circ);
    const inset = new Rect(P(cx - r + 1.25), P(cy - r + 1.25), P(r * 2 - 2.5), P(r * 2 - 2.5));
    ctx.setStrokeColor(light ? white(0.35) : ink(0.25));
    ctx.setLineWidth(P(2.5));
    ctx.strokeEllipse(inset);
  }

  return ctx.getImage();
}

// ---------- 6. Build the widget ----------
const widget = new ListWidget();
widget.backgroundImage = drawCard(data);
widget.setPadding(0, 0, 0, 0);
widget.url = APP_URL;

// Ask iOS to redraw soon, and right after midnight so the
// streak and today's tick are always for the right day.
const midnight = addDays(today(), 1);
const soon = new Date(Date.now() + 15 * 60 * 1000);
widget.refreshAfterDate = midnight < soon ? new Date(midnight.getTime() + 60 * 1000) : soon;

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  if (incoming) {
    const a = new Alert();
    a.title = "Widget updated";
    a.message = (incoming.none ? "No habit is starred." : `${incoming.emoji} ${incoming.name}`) +
      "\n\niOS will refresh the home-screen widget shortly.";
    a.addAction("OK");
    await a.present();
  }
  await widget.presentSmall();
}
Script.complete();
