// Отрисовка обоев «Совиная почта» на день и на неделю в canvas.
// Раскладка совпадает с src/oboi/render.py.
import { hoursWord, niceSubject, shortSubject } from "./names.js";

export const W = 1170;
export const H = 2532;
const SHEET_TOP = 1050;
const SHEET_MAX_BOTTOM = 2455;
const MIN_SCALE = 0.55;

const INK = "rgb(48,32,20)";
const SOFT = "rgb(92,70,48)";
const TITLE = "rgb(104,24,26)";
const LINE = "rgb(150,122,88)";
const SEAL = "rgb(150,28,34)";
const SEAL_DARK = "rgb(98,14,20)";
const SEAL_TEXT = "rgb(238,178,150)";
const GLOW = "rgba(236,222,190,0.59)";
const GRADE_COLORS = {
  2: "rgb(112,74,48)", 3: "rgb(70,98,38)", 4: "rgb(168,78,28)", 5: "rgb(125,25,30)", 6: "rgb(24,84,50)",
  7: "rgb(30,60,116)", 8: "rgb(138,94,18)", 9: "rgb(94,44,120)", 10: "rgb(0,98,108)", 11: "rgb(152,50,84)",
};
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV"];
const FONT_FILES = { regular: "OldStandard-Regular.ttf", bold: "OldStandard-Bold.ttf", italic: "OldStandard-Italic.ttf" };
export const SHORT_DAYS = { "Понедельник": "Пн", "Вторник": "Вт", "Среда": "Ср", "Четверг": "Чт",
  "Пятница": "Пт", "Суббота": "Сб", "Воскресенье": "Вс" };

let images = null;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Не загрузилась картинка ${src}`));
    img.src = src;
  });
}

// Загружает шрифты и картинки; вызывается один раз перед первой отрисовкой
export async function loadAssets() {
  if (images) return;
  const faces = Object.entries(FONT_FILES).map(
    ([kind, file]) => new FontFace(`OS-${kind}`, `url(assets/fonts/${file})`));
  await Promise.all(faces.map((f) => f.load()));
  faces.forEach((f) => document.fonts.add(f));
  const [background, parchment] = await Promise.all(
    [loadImage("assets/background.webp"), loadImage("assets/parchment.webp")]);
  images = { background, parchment };
}

const gradeOf = (name) => {
  const head = name.split(".")[0].trim();
  return /^\d+$/.test(head) ? parseInt(head, 10) : null;
};
const gradeColor = (classes) => (classes.length && GRADE_COLORS[gradeOf(classes[0])]) || INK;
const fmtTime = (v) => (v ? v.replace(".", ":").padStart(5, "0") : "");
const timeRange = (start, end) => (start ? `${fmtTime(start)} – ${fmtTime(end)}` : "");
const romanOf = (p) => (p < ROMAN.length ? ROMAN[p] : String(p));

// Время уроков: из файла и, на всякий случай, из самих уроков
function allTimes(slots, times) {
  const out = new Map(times || []);
  for (const s of slots) {
    if (!out.has(s.period)) out.set(s.period, [s.start, s.end]);
  }
  return out;
}

// Кабинет, если все занятия в одном и том же, иначе пустая строка
export function singleRoom(slots) {
  const rooms = new Set(slots.map((s) => JSON.stringify(s.rooms)));
  if (rooms.size === 1) {
    const only = JSON.parse([...rooms][0]);
    if (only.length === 1) return only[0];
  }
  return "";
}

// Обёртка над canvas. В пробном проходе только измеряет, ничего не рисуя
class Pen {
  constructor(ctx, dry) {
    this.ctx = ctx;
    this.dry = dry;
  }

  font(kind, size) {
    return { kind, size: Math.max(8, Math.round(size)) };
  }

  use(f) {
    this.ctx.font = `${f.size}px "OS-${f.kind}"`;
  }

  len(text, f) {
    this.use(f);
    return this.ctx.measureText(text).width;
  }

  text(x, y, text, f, fill) {
    if (this.dry) return;
    this.use(f);
    this.ctx.fillStyle = fill;
    this.ctx.fillText(text, x, y + this.ctx.measureText(text).fontBoundingBoxAscent);
  }

  center(cx, y, text, f, fill) {
    this.text(cx - this.len(text, f) / 2, y, text, f, fill);
  }

  spaced(cx, y, text, f, fill, gap) {
    const chars = [...text];
    const total = chars.reduce((sum, c) => sum + this.len(c, f), 0) + gap * (chars.length - 1);
    let x = cx - total / 2;
    for (const c of chars) {
      this.text(x, y, c, f, fill);
      x += this.len(c, f) + gap;
    }
  }

  line(x0, y0, x1, y1, width) {
    if (this.dry) return;
    const { ctx } = this;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = Math.max(1, Math.round(width));
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  star(cx, cy, r, fill) {
    if (this.dry) return;
    const q = r * 0.28;
    const pts = [[cx, cy - r], [cx + q, cy - q], [cx + r, cy], [cx + q, cy + q],
      [cx, cy + r], [cx - q, cy + q], [cx - r, cy], [cx - q, cy - q]];
    const { ctx } = this;
    ctx.fillStyle = fill;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }

  dot(cx, cy, r, fill) {
    if (this.dry) return;
    const { ctx } = this;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  fit(kind, size, text, width, minSize = 14) {
    let s = size;
    while (s > minSize && this.len(text, this.font(kind, s)) > width) s -= 1;
    return this.font(kind, s);
  }

  wrap(text, f, width) {
    const lines = [];
    for (const para of text.split("\n")) {
      let cur = "";
      for (let word of para.split(" ")) {
        while (this.len(word, f) > width) { // слишком длинное слово — режем
          let k = word.length;
          while (k > 1 && this.len(word.slice(0, k), f) > width) k -= 1;
          if (cur) {
            lines.push(cur);
            cur = "";
          }
          lines.push(word.slice(0, k));
          word = word.slice(k);
        }
        const t = `${cur} ${word}`.trim();
        if (this.len(t, f) <= width) {
          cur = t;
        } else {
          lines.push(cur);
          cur = word;
        }
      }
      lines.push(cur);
    }
    const out = lines.filter((x) => x !== "");
    return out.length ? out : [""];
  }

  fitWrap(kind, size, text, width, maxLines, minSize = 14) {
    let s = size;
    for (;;) {
      const f = this.font(kind, s);
      const lines = this.wrap(text, f, width);
      if (lines.length <= maxLines || s <= minSize) return [f, lines];
      s -= 1;
    }
  }
}

function ornament(pen, cx, y, s) {
  const r = 9 * s;
  for (const [dx, k] of [[-46 * s, 0.7], [0, 1], [46 * s, 0.7]]) pen.star(cx + dx, y + r, r * k, SOFT);
  return y + 2 * r;
}

function header(pen, x, startY, w, s, title, greet, sub) {
  let y = startY;
  const cx = x + w / 2;
  const head = "СОВИНАЯ ПОЧТА · РАСПИСАНИЕ ЗАНЯТИЙ";
  pen.spaced(cx, y, head, pen.fit("regular", 25 * s, head, w * 0.74), SOFT, 2.5 * s);
  y += 42 * s;
  let f = pen.fit("bold", 92 * s, title, w * 0.96, 34);
  pen.center(cx, y, title, f, TITLE);
  y += f.size * 1.14;
  f = pen.fit("italic", 40 * s, greet, w * 0.98, 18);
  pen.center(cx, y, greet, f, INK);
  y += f.size * 1.28;
  if (sub) {
    f = pen.fit("italic", 31 * s, sub, w * 0.98, 16);
    pen.center(cx, y, sub, f, SOFT);
    y += f.size * 1.32;
  }
  return ornament(pen, cx, y + 4 * s, s) + 10 * s;
}

function legend(pen, cx, y, s, slots) {
  const grades = [...new Set(slots.flatMap((sl) => sl.classes.map(gradeOf)))]
    .filter((g) => g !== null).sort((a, b) => a - b);
  if (!grades.length) return y;
  const f = pen.font("regular", 25 * s);
  const r = 9 * s;
  const items = grades.map((g) => [g, `${g}-е`]);
  const total = items.reduce((sum, [, t]) => sum + 2 * r + 8 * s + pen.len(t, f), 0) + 24 * s * (items.length - 1);
  let px = cx - total / 2;
  for (const [g, t] of items) {
    pen.dot(px + r, y + 9 * s + r, r, GRADE_COLORS[g] || INK);
    px += 2 * r + 8 * s;
    pen.text(px, y, t, f, SOFT);
    px += pen.len(t, f) + 24 * s;
  }
  return y + f.size * 1.3;
}

function drawDay(pen, x, startY, w, s, data) {
  const { slots, title, greet, sub, room, times } = data;
  let y = header(pen, x, startY, w, s, title, greet, sub) + 2 * s;
  const colNum = x + 40 * s;
  const colTime = x + 205 * s;
  const colMain = x + 395 * s;
  const mainW = x + w - colMain;
  const byPeriod = new Map();
  for (const sl of slots) {
    if (!byPeriod.has(sl.period)) byPeriod.set(sl.period, []);
    byPeriod.get(sl.period).push(sl);
  }
  const first = Math.min(...byPeriod.keys());
  const last = Math.max(...byPeriod.keys());
  for (let period = first; period <= last; period++) {
    const items = byPeriod.get(period) || [null];
    for (const sl of items) {
      let fSub = pen.font("italic", 31 * s);
      let rowH = 108 * s;
      let lines = [];
      if (sl) {
        let subject = niceSubject(sl.subject);
        if (sl.rooms.length && !room) subject += ` · ${sl.rooms.join(", ")}`;
        [fSub, lines] = pen.fitWrap("italic", 31 * s, subject, mainW, 2, 19);
        rowH = Math.max(rowH, 64 * s + lines.length * fSub.size * 1.16 + 8 * s);
      }
      const cy = y + rowH / 2;
      let f = pen.font("bold", 29 * s);
      pen.center(colNum, cy - f.size * 0.62, romanOf(period), f, INK);
      const span = timeRange(...(times.get(period) || ["", ""]));
      if (span) {
        f = pen.fit("bold", 37 * s, span, 270 * s, 18);
        pen.center(colTime, cy - f.size * 0.62, span, f, INK);
      }
      if (sl) {
        const clText = sl.classes.join(", ");
        const fCl = pen.fit("bold", 50 * s, clText, mainW * (sl.group ? 0.62 : 1), 22);
        pen.text(colMain, y + 6 * s, clText, fCl, gradeColor(sl.classes));
        if (sl.group) {
          const gx = colMain + pen.len(clText, fCl) + 12 * s;
          const fGr = pen.fit("regular", 28 * s, sl.group, x + w - gx, 14);
          pen.text(gx, y + 6 * s + (fCl.size - fGr.size) * 0.72, sl.group, fGr, SOFT);
        }
        let ty = y + 62 * s;
        for (const line of lines) {
          pen.text(colMain, ty, line, fSub, INK);
          ty += fSub.size * 1.16;
        }
      } else {
        const freeText = "свободный час";
        f = pen.font("italic", 36 * s);
        const tx = colMain + 34 * s;
        pen.text(tx, cy - f.size * 0.62, freeText, f, SOFT);
        pen.star(tx - 20 * s, cy, 10 * s, SOFT);
        pen.star(tx + pen.len(freeText, f) + 20 * s, cy, 10 * s, SOFT);
      }
      y += rowH;
      if (!(period === last && sl === items[items.length - 1])) {
        pen.line(x + 5 * s, y, x + w - 5 * s, y, 1.6 * s);
      }
    }
  }
  y += 22 * s;
  ornament(pen, x + w / 2, y, s);
  y += 30 * s;
  return legend(pen, x + w / 2, y, s, slots);
}

// Строки ячейки: [[текст, шрифт, цвет]], высота
function weekCell(pen, items, width, s, showRooms) {
  const k = items.length === 1 ? 1 : 0.78;
  const out = [];
  for (const sl of items) {
    const cl = sl.classes.join(", ");
    out.push([cl, pen.fit("bold", 41 * s * k, cl, width, 15), gradeColor(sl.classes)]);
    let subject = shortSubject(sl.subject);
    if (sl.group) subject += ` (${sl.group})`;
    const [font, lines] = pen.fitWrap("italic", 24 * s * k, subject, width, 3, 14);
    for (const line of lines) out.push([line, font, INK]);
    if (showRooms && sl.rooms.length) {
      const room = sl.rooms.join(", ");
      out.push([room, pen.fit("regular", 22 * s * k, room, width, 13), SOFT]);
    }
  }
  return [out, out.reduce((sum, [, f]) => sum + f.size * 1.12, 0)];
}

function drawWeek(pen, x, startY, w, s, data) {
  const { slots, gridDays, greet, sub, room, total, freeLine, times } = data;
  let y = header(pen, x, startY, w, s, "НА НЕДЕЛЮ", greet, sub) + 2 * s;
  const labelW = 92 * s;
  const cellW = (w - labelW) / Math.max(1, gridDays.length);
  const headH = 52 * s;
  const byKey = new Map();
  for (const sl of slots) {
    const key = `${sl.day}|${sl.period}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(sl);
  }
  const first = Math.min(...slots.map((sl) => sl.period));
  const last = Math.max(...slots.map((sl) => sl.period));
  const x1 = x + w;
  const gridTop = y;
  let f = pen.font("bold", 31 * s);
  gridDays.forEach((day, j) => {
    pen.center(x + labelW + (j + 0.5) * cellW, y + (headH - f.size) * 0.42, SHORT_DAYS[day] || day.slice(0, 2), f, TITLE);
  });
  y += headH;
  pen.line(x, y, x1, y, 2 * s);
  for (let p = first; p <= last; p++) {
    const cells = gridDays.map((d) => weekCell(pen, byKey.get(`${d}|${p}`) || [], cellW - 10 * s, s, !room));
    const rowH = Math.max(...cells.map((c) => c[1]), 100 * s) + 12 * s;
    const fR = pen.font("bold", 24 * s);
    const fT = pen.font("regular", 19 * s);
    const [start, end] = times.get(p) || ["", ""];
    const lx = x + labelW / 2;
    const ly = y + rowH / 2 - (fR.size + 2 * fT.size * 1.1) / 2;
    pen.center(lx, ly, romanOf(p), fR, SOFT);
    pen.center(lx, ly + fR.size * 1.05, fmtTime(start), fT, INK);
    pen.center(lx, ly + fR.size * 1.05 + fT.size * 1.1, fmtTime(end), fT, INK);
    cells.forEach(([lines, height], j) => {
      const cx = x + labelW + (j + 0.5) * cellW;
      if (!lines.length) {
        pen.line(cx - 13 * s, y + rowH / 2, cx + 13 * s, y + rowH / 2, 2 * s);
        return;
      }
      let ty = y + (rowH - height) / 2;
      for (const [text, font, color] of lines) {
        pen.center(cx, ty, text, font, color);
        ty += font.size * 1.12;
      }
    });
    y += rowH;
    pen.line(x, y, x1, y, 1.4 * s);
  }
  gridDays.forEach((_, j) => {
    const vx = x + labelW + j * cellW;
    pen.line(vx, gridTop, vx, y, 1.4 * s);
  });
  y += 20 * s;
  f = pen.fit("bold", 35 * s, total, w * 0.9, 18);
  pen.center(x + w / 2, y, total, f, INK);
  y += f.size * 1.26;
  if (freeLine) {
    f = pen.fit("italic", 27 * s, freeLine, w * 0.9, 15);
    pen.center(x + w / 2, y, freeLine, f, SOFT);
    y += f.size * 1.3;
  }
  return legend(pen, x + w / 2, y + 4 * s, s, slots);
}

function roundedRect(ctx, x0, y0, x1, y1, r) {
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x1, y0, x1, y1, r);
  ctx.arcTo(x1, y1, x0, y1, r);
  ctx.arcTo(x0, y1, x0, y0, r);
  ctx.arcTo(x0, y0, x1, y0, r);
  ctx.closePath();
}

function drawSeal(ctx, cx, cy, letter) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.59)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = SEAL_DARK;
  ctx.beginPath();
  ctx.arc(cx, cy, 66, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = SEAL;
  ctx.beginPath();
  ctx.arc(cx, cy, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = SEAL_DARK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 46, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = '58px "OS-bold"';
  ctx.fillStyle = SEAL_TEXT;
  const m = ctx.measureText(letter);
  ctx.fillText(letter,
    cx - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2,
    cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
}

// Подбирает масштаб, чтобы лист влез в экран, и собирает картинку
function compose(canvas, drawFn, data, layout, letter) {
  const { sheetX, sheetW, padX, padTop, padBottom, minH } = layout;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const probe = new Pen(ctx, true);
  const x = sheetX + padX;
  const w = sheetW - 2 * padX;
  const maxH = SHEET_MAX_BOTTOM - SHEET_TOP;
  let s = 1;
  let h;
  for (;;) {
    h = drawFn(probe, x, 0, w, s, data) + padTop + padBottom;
    if (h <= maxH || s <= MIN_SCALE) break;
    s = Math.round((s - 0.02) * 100) / 100;
  }
  const sheetH = Math.trunc(Math.min(Math.max(h, minH), maxH));
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(images.background, 0, 0, W, H);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.67)";
  ctx.shadowBlur = 32;
  ctx.shadowOffsetX = 6;
  ctx.shadowOffsetY = 10;
  ctx.drawImage(images.parchment, sheetX, SHEET_TOP, sheetW, sheetH);
  ctx.restore();
  // осветляем тени на листе под текстом, рваные края остаются тёмными;
  // ctx.filter в Safari нет, поэтому размытие — это тень фигуры, стоящей за экраном
  ctx.save();
  ctx.shadowColor = GLOW;
  ctx.shadowBlur = 44;
  ctx.shadowOffsetX = 4000;
  ctx.fillStyle = "#000";
  roundedRect(ctx, sheetX + 34 - 4000, SHEET_TOP + 30, sheetX + sheetW - 34 - 4000, SHEET_TOP + sheetH - 30, 40);
  ctx.fill();
  ctx.restore();
  const extra = Math.max(0, sheetH - h) / 2;
  drawFn(new Pen(ctx, false), x, SHEET_TOP + padTop + extra, w, s, data);
  drawSeal(ctx, sheetX + sheetW - 44, SHEET_TOP + sheetH - 42, letter);
}

function subtitle(first, room) {
  const parts = [];
  if (first.trim()) parts.push(first.trim());
  if (room) parts.push(`все занятия — кабинет ${room}`);
  return parts.join(" · ");
}

const letterOf = (teacher) => teacher.slice(0, 1).toUpperCase() || "?";

// Обои на один день; slots — только уроки этого дня, непустые
export function renderDay(canvas, teacher, day, slots, greet, dateText = "", times = null) {
  const room = singleRoom(slots);
  const data = { slots, title: day.toUpperCase(), greet, sub: subtitle(dateText, room), room, times: allTimes(slots, times) };
  compose(canvas, drawDay, data, { sheetX: 92, sheetW: 986, padX: 66, padTop: 66, padBottom: 62, minH: 760 }, letterOf(teacher));
}

export function joinDays(days) {
  const low = days.map((d) => d.toLowerCase());
  if (low.length < 2) return low.join("");
  return `${low.slice(0, -1).join(", ")} и ${low[low.length - 1]}`;
}

// {total, freeLine, gridDays}: строка итога, строка о свободных днях, дни с уроками
export function weekTotals(slots, allDays) {
  const counts = new Map();
  for (const sl of slots) counts.set(sl.day, (counts.get(sl.day) || 0) + 1);
  const gridDays = allDays.filter((d) => counts.has(d));
  const detail = gridDays.map((d) => `${SHORT_DAYS[d] || d.slice(0, 2)} ${counts.get(d)}`).join(" · ");
  const n = slots.length;
  const free = allDays.filter((d) => !counts.has(d));
  return {
    total: `Всего за неделю: ${n} ${hoursWord(n)} (${detail})`,
    freeLine: free.length ? `${joinDays(free)} — уроков нет` : "",
    gridDays,
  };
}

// Обои на неделю; allDays — дни, которые есть в данных
export function renderWeek(canvas, teacher, allDays, slots, greet, note = "", times = null) {
  const { total, freeLine, gridDays } = weekTotals(slots, allDays);
  const room = singleRoom(slots);
  const data = { slots, gridDays, greet, sub: subtitle(note, room), room, total, freeLine, times: allTimes(slots, times) };
  compose(canvas, drawWeek, data, { sheetX: 70, sheetW: 1030, padX: 52, padTop: 62, padBottom: 58, minH: 760 }, letterOf(teacher));
}
