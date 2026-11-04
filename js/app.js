// Интерфейс: выбор Excel, учителя и дня, предпросмотр и сохранение обоев.
import { dateFromFilename, greeting, wallpaperFilename } from "./names.js";
import { ExcelError, load, slotsOf, teacherNames } from "./parse.js";
import { loadAssets, renderDay, renderWeek, SHORT_DAYS } from "./render.js";

const WEEK = "Вся неделя";
const STORE_KEY = "oboi.names";
const INSTALL_KEY = "oboi.installHint";

const $ = (id) => document.getElementById(id);
const state = { sched: null, files: [], teacher: null, period: null, auto: "", blob: null, url: null, token: 0, timer: null };

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // не запомнили — обои важнее
  }
}

function showError(text) {
  $("error").textContent = text;
  $("error").hidden = !text;
}

function setNotes(lines) {
  const box = $("notes");
  box.replaceChildren();
  box.hidden = !lines.length;
  if (!lines.length) return;
  box.append("Замечания:");
  const list = document.createElement("ul");
  for (const line of lines) {
    const item = document.createElement("li");
    item.textContent = line;
    list.append(item);
  }
  box.append(list);
}

async function onFiles(fileList) {
  const picked = [...fileList];
  if (!picked.length) return;
  showError("");
  try {
    const files = await Promise.all(picked.map(async (f) => ({ name: f.name, data: await f.arrayBuffer() })));
    const sched = load(window.XLSX, files);
    Object.assign(state, { sched, files, teacher: null, period: sched.days[0] });
    const names = files.map((f) => f.name).join(", ");
    $("files").textContent = `${names}. Учителей: ${sched.teachers.size}. Дни: ${sched.days.join(", ")}.`;
    $("search").value = "";
    showPicker(true);
    fillTeachers();
    fillPeriods();
    $("teacher-section").hidden = false;
    $("options").hidden = true;
    $("result").hidden = true;
    setNotes(sched.warnings);
  } catch (e) {
    showError(e instanceof ExcelError ? e.message : `Не удалось прочитать файл: ${e.message}`);
  }
}

function showPicker(open) {
  $("teacher-pick").hidden = !open;
  $("teacher-chosen").hidden = open;
}

function fillTeachers() {
  const query = $("search").value.trim().toLowerCase();
  const found = teacherNames(state.sched).filter((t) => t.toLowerCase().includes(query));
  const list = $("teachers");
  list.replaceChildren();
  if (!found.length) {
    const none = document.createElement("li");
    none.className = "none";
    none.textContent = "Такой фамилии в файле нет";
    list.append(none);
  }
  for (const teacher of found) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = teacher;
    button.addEventListener("click", () => selectTeacher(teacher));
    item.append(button);
    list.append(item);
  }
}

function fillPeriods() {
  const box = $("periods");
  box.replaceChildren();
  for (const period of [...state.sched.days, WEEK]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = period === WEEK ? "Неделя" : SHORT_DAYS[period];
    button.setAttribute("aria-label", period);
    button.dataset.period = period;
    button.addEventListener("click", () => selectPeriod(period));
    box.append(button);
  }
}

function selectTeacher(teacher) {
  state.teacher = teacher;
  const [auto, sure] = greeting(teacher, slotsOf(state.sched, teacher));
  const saved = readStore(STORE_KEY, {})[teacher];
  state.auto = auto;
  $("greet").value = saved || auto;
  $("greet-note").hidden = Boolean(sure || saved);
  $("teacher-name").textContent = teacher;
  showPicker(false);
  $("options").hidden = false;
  $("result").hidden = false;
  $("status").textContent = "";
  selectPeriod(state.period);
}

const isWeek = () => state.period === WEEK;

function defaultDate() {
  const { sched, files, period } = state;
  if (isWeek()) {
    const first = files.map((f) => dateFromFilename(f.name)).find(Boolean);
    return first ? `по расписанию от ${first}` : "";
  }
  const name = sched.dayFiles.get(period);
  const oneDay = [...sched.dayFiles.values()].filter((x) => x === name).length === 1;
  return name && oneDay ? dateFromFilename(name) : "";
}

function selectPeriod(period) {
  state.period = period;
  showError("");
  for (const button of $("periods").children) {
    button.setAttribute("aria-pressed", String(button.dataset.period === period));
  }
  $("date-label").textContent = isWeek() ? "Подпись под обращением" : "Дата";
  $("date").value = defaultDate();
  const notes = [...state.sched.warnings];
  if (isWeek() && state.sched.days.length < 5) {
    notes.unshift(`В выбранных файлах есть только: ${state.sched.days.join(", ")}. На обоях будут только эти дни. `
      + "Для полной недели выберите файл со всеми днями или сразу несколько файлов.");
  }
  setNotes(notes);
  $("status").textContent = "";
  schedulePreview(0);
}

function schedulePreview(delay = 300) {
  clearTimeout(state.timer);
  $("save").disabled = true;
  state.timer = setTimeout(buildPreview, delay);
}

async function buildPreview() {
  const token = ++state.token;
  const { sched, teacher, period } = state;
  if (!teacher) return;
  const slots = slotsOf(sched, teacher, isWeek() ? null : period);
  $("preview").hidden = !slots.length;
  $("empty").hidden = Boolean(slots.length);
  if (!slots.length) {
    state.blob = null;
    return;
  }
  try {
    await loadAssets();
    if (token !== state.token) return;
    const canvas = $("canvas");
    const greet = $("greet").value.trim();
    const date = $("date").value;
    if (isWeek()) renderWeek(canvas, teacher, sched.days, slots, greet, date, sched.times);
    else renderDay(canvas, teacher, period, slots, greet, date, sched.times);
    const blob = await new Promise((resolve) => { canvas.toBlob(resolve, "image/jpeg", 0.92); });
    if (token !== state.token) return;
    if (!blob) throw new Error("браузер не смог создать картинку");
    if (state.url) URL.revokeObjectURL(state.url);
    state.blob = blob;
    state.url = URL.createObjectURL(blob);
    $("preview").src = state.url;
    $("save").disabled = false;
  } catch (e) {
    showError(`Не удалось построить обои: ${e.message}`);
  }
}

function rememberGreeting() {
  const greet = $("greet").value.trim();
  const saved = readStore(STORE_KEY, {});
  if (greet && (greet !== state.auto || state.teacher in saved)) {
    saved[state.teacher] = greet;
    writeStore(STORE_KEY, saved);
    $("greet-note").hidden = true;
  }
}

async function save() {
  if (!state.blob) return;
  const label = isWeek() ? "Неделя" : state.period;
  const name = wallpaperFilename(state.teacher, label);
  const file = new File([state.blob], name, { type: "image/jpeg" });
  rememberGreeting();
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      $("status").textContent = "";
    } catch (e) {
      if (e.name !== "AbortError") showError(`Не удалось открыть меню: ${e.message}`);
    }
    return;
  }
  const link = document.createElement("a");
  link.href = state.url;
  link.download = name;
  link.click();
  $("status").textContent = `Скачан файл: ${name}`;
}

function initInstallHint() {
  const iPhone = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installed = window.navigator.standalone === true;
  if (iPhone && !installed && !readStore(INSTALL_KEY, false)) $("install").hidden = false;
  $("install-close").addEventListener("click", () => {
    $("install").hidden = true;
    writeStore(INSTALL_KEY, true);
  });
}

$("file").addEventListener("change", (e) => {
  onFiles(e.target.files).finally(() => { e.target.value = ""; }); // чтобы тот же файл можно было выбрать снова
});
$("search").addEventListener("input", fillTeachers);
$("teacher-change").addEventListener("click", () => {
  showPicker(true);
  $("search").value = "";
  fillTeachers();
});
$("greet").addEventListener("input", () => schedulePreview());
$("date").addEventListener("input", () => schedulePreview());
$("save").addEventListener("click", save);
initInstallHint();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {}); // без него всё работает, но только с интернетом
}
