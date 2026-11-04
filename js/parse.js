// Чтение Excel с расписанием по классам: кто, когда и у кого ведёт уроки.
// Правила совпадают с src/oboi/parse_xlsx.py; сверка — tests/test_web_parity.py.

export const DAY_ORDER = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const DASH_RE = /\s+[—–-]\s+/;
const TEACHER_RE = /^([А-ЯЁ][А-ЯЁ-]*\s+[А-ЯЁ]\.\s?[А-ЯЁ]\.)\s*(.*)$/;
const GROUP_RE = /^(.*\S)\s*\(([^()]*)\)$/;
const ROOM_RE = /[А-ЯЁA-Z]?\d+[А-ЯЁа-яё]?/g;
const TIME_RE = /(\d{1,2}[:.]\d{2})\s*[–—-]\s*(\d{1,2}[:.]\d{2})/;

// Понятная пользователю ошибка чтения файла
export class ExcelError extends Error {}

const text = (value) => (value === null || value === undefined ? "" : String(value));

function normDay(value) {
  const s = text(value).trim().toLowerCase();
  const day = s.slice(0, 1).toUpperCase() + s.slice(1);
  return DAY_ORDER.includes(day) ? day : null;
}

const daySort = (name) => DAY_ORDER.indexOf(name);

// «5.2.1» раньше «10.1»
function naturalCompare(a, b) {
  const na = (a.match(/\d+/g) || []).map(Number);
  const nb = (b.match(/\d+/g) || []).map(Number);
  for (let i = 0; i < Math.min(na.length, nb.length); i++) {
    if (na[i] !== nb[i]) return na[i] - nb[i];
  }
  return na.length - nb.length || (a < b ? -1 : a > b ? 1 : 0);
}

// «ПРЕДМЕТ (ГРУППА)» -> [предмет, группа]. Скобка с «КИТ» — часть названия
export function splitSubject(value) {
  const s = value.trim();
  const m = s.match(GROUP_RE);
  if (m && !m[2].toUpperCase().includes("КИТ")) return [m[1].trim(), m[2].trim()];
  return [s, ""];
}

// Строка ячейки -> {teacher, subject, group, rooms} или null, если учителя нет
export function parseLine(raw) {
  const line = raw.trim();
  const dash = DASH_RE.exec(line);
  if (!dash) return null;
  const rest = line.slice(dash.index + dash[0].length).trim();
  const m = rest.match(TEACHER_RE);
  if (!m) return null;
  const teacher = m[1].replace(/\s+/g, " ").replaceAll(". ", ".").toUpperCase()
    .replace(/^(\S+?)\.?([А-ЯЁ]\.[А-ЯЁ]\.)$/, "$1 $2");
  const [subject, group] = splitSubject(line.slice(0, dash.index));
  return { teacher, subject, group, rooms: m[2].match(ROOM_RE) || [] };
}

function readSheet(XLSX, ws, rows, days, times) {
  if (!ws || !ws["!ref"]) return;
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const value = (r, c) => ws[XLSX.utils.encode_cell({ r, c })]?.v;
  let head = null;
  for (let r = range.s.r; r <= Math.min(range.e.r, 14) && !head; r++) {
    const cols = new Map();
    for (let c = range.s.c; c <= range.e.c; c++) {
      const v = value(r, c);
      if (v !== undefined && v !== null) cols.set(text(v).trim().toLowerCase(), c);
    }
    if (cols.has("день") && cols.has("№") && cols.has("время")) {
      head = { row: r, day: cols.get("день"), num: cols.get("№"), time: cols.get("время") };
    }
  }
  if (!head) return;
  const classes = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const v = value(head.row, c);
    if (v !== undefined && v !== null && ![head.day, head.num, head.time].includes(c)) {
      classes.push([c, text(v).trim()]);
    }
  }
  let day = null;
  for (let r = head.row + 1; r <= range.e.r; r++) {
    day = normDay(value(r, head.day)) || day;
    const rawNum = value(r, head.num);
    const period = Math.trunc(Number(rawNum));
    if (rawNum === undefined || rawNum === null || text(rawNum).trim() === "" || !Number.isFinite(period)) continue;
    if (!day) continue;
    if (!days.includes(day)) days.push(day);
    const m = text(value(r, head.time)).match(TIME_RE);
    const [start, end] = m ? [m[1], m[2]] : ["", ""];
    if (m && !times.has(period)) times.set(period, [start, end]);
    for (const [c, cl] of classes) {
      const v = value(r, c);
      if (v !== undefined && v !== null && text(v).trim()) {
        rows.push({ day, period, start, end, cl, text: text(v) });
      }
    }
  }
}

function readFile(XLSX, file) {
  let wb;
  try {
    wb = XLSX.read(file.data, { type: "array" });
  } catch (e) {
    throw new ExcelError(`Не удалось открыть файл как Excel (.xlsx): ${file.name}`);
  }
  const rows = [];
  const days = [];
  const times = new Map();
  wb.SheetNames.forEach((name, i) => {
    if (!wb.Workbook?.Sheets?.[i]?.Hidden) readSheet(XLSX, wb.Sheets[name], rows, days, times);
  });
  if (!days.length) {
    throw new ExcelError(`В файле не найдена таблица с колонками «День», «№», «Время»: ${file.name}`);
  }
  return { rows, days, times };
}

// Собирает расписание из одного или нескольких файлов {name, data: ArrayBuffer}
export function load(XLSX, files) {
  const sched = { days: [], teachers: new Map(), warnings: [], times: new Map(), dayFiles: new Map() };
  const perDay = new Map(); // один день из разных файлов — берём более поздний
  for (const file of files) {
    const { rows, days, times } = readFile(XLSX, file);
    for (const [period, value] of times) {
      if (!sched.times.has(period)) sched.times.set(period, value);
    }
    for (const day of days) {
      if (perDay.has(day)) sched.warnings.push(`${day} есть в нескольких файлах, взят «${file.name}».`);
      perDay.set(day, rows.filter((row) => row.day === day));
      sched.dayFiles.set(day, file.name);
    }
  }
  sched.days = [...perDay.keys()].sort((a, b) => daySort(a) - daySort(b));

  const merged = new Map();
  for (const day of sched.days) {
    for (const row of perDay.get(day)) {
      for (const line of row.text.split("\n")) {
        if (!line.trim()) continue;
        const parsed = parseLine(line);
        if (!parsed) {
          if (DASH_RE.test(line)) {
            sched.warnings.push(`Не разобрана строка (${row.day}, урок ${row.period}, ${row.cl}): ${line.trim()}`);
          }
          continue;
        }
        const key = JSON.stringify([parsed.teacher, row.day, row.period, parsed.subject]);
        let slot = merged.get(key);
        if (!slot) {
          slot = { day: row.day, period: row.period, start: row.start, end: row.end,
            subject: parsed.subject, classes: [], group: "", rooms: [] };
          merged.set(key, slot);
          if (!sched.teachers.has(parsed.teacher)) sched.teachers.set(parsed.teacher, []);
          sched.teachers.get(parsed.teacher).push(slot);
        }
        if (!slot.classes.includes(row.cl)) slot.classes.push(row.cl);
        const groups = slot.group ? slot.group.split(", ") : [];
        for (const g of parsed.group.split(", ")) {
          if (g && !groups.includes(g)) groups.push(g);
        }
        slot.group = groups.join(", ");
        for (const room of parsed.rooms) {
          if (!slot.rooms.includes(room)) slot.rooms.push(room);
        }
      }
    }
  }
  for (const slots of sched.teachers.values()) {
    for (const s of slots) s.classes.sort(naturalCompare);
    slots.sort((a, b) => daySort(a.day) - daySort(b.day) || a.period - b.period);
  }
  for (const teacher of teacherNames(sched)) {
    const seen = new Map();
    for (const s of sched.teachers.get(teacher)) {
      const key = `${s.day}|${s.period}`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(s);
    }
    for (const items of seen.values()) {
      if (items.length > 1) {
        sched.warnings.push(`Накладка: ${teacher}, ${items[0].day}, урок ${items[0].period}: `
          + items.map((x) => x.subject).join("; "));
      }
    }
  }
  if (!sched.teachers.size) {
    throw new ExcelError("В файлах не найдено ни одного учителя. "
      + "Ожидаются ячейки вида «ПРЕДМЕТ — ФАМИЛИЯ И.О. [КАБИНЕТ]».");
  }
  return sched;
}

export const teacherNames = (sched) => [...sched.teachers.keys()].sort();

export function slotsOf(sched, teacher, day = null) {
  return (sched.teachers.get(teacher) || []).filter((s) => day === null || s.day === day);
}
