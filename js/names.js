// Тексты на обоях: обращение к учителю, названия предметов, склонение «час».
// Правила совпадают с src/oboi/names.py; сверка — tests/test_web_parity.py.

const ACRONYMS = new Set(["ЕПН", "ЕНП", "ИЗО", "3Д", "ДНК", "ДВФУ", "МГУ", "БПЛА", "КИТ", "ОБЖ", "ОБЗР", "ИКТ", "ЕГЭ", "ОГЭ"]);

// внеурочные занятия не определяют «предмет» учителя
const NOT_MAIN = ["РАЗГОВОРЫ О ВАЖНОМ", "ТЬЮТОРСКИЙ", "КЛАССНЫЙ ЧАС", "РОССИЯ МОИ ГОРИЗОНТЫ", "ОРЛЯТА РОССИИ",
  "ИНДИВИДУАЛЬНЫЙ ПРОЕКТ", "ПРОЕКТНАЯ ДЕЯТЕЛЬНОСТЬ", "ДОП."];

// ключевое слово в названии предмета -> родительный падеж; порядок важен
const GENITIVE = [
  ["АНГЛ", "английского языка"], ["КИТАЙСК", "китайского языка"], ["(КИТ", "китайского языка"],
  ["ИНОСТРАН", "иностранного языка"],
  ["РУССК", "русского языка"], ["ЛИТЕРАТУРНОЕ ЧТЕНИЕ", "литературного чтения"], ["ЛИТЕРАТУР", "литературы"],
  ["ФИЗКУЛЬТУР", "физкультуры"], ["ФИЗИК", "физики"], ["ЕПН ФИЗИКА", "физики"],
  ["АЛГЕБР", "алгебры"], ["ГЕОМЕТРИ", "геометрии"], ["ВЕРОЯТНОСТЬ", "математики"], ["МАТЕМАТИ", "математики"],
  ["ИНФОРМАТИК", "информатики"], ["БИОЛОГИ", "биологии"], ["ХИМИ", "химии"], ["ГЕОГРАФИ", "географии"],
  ["ИСТОРИ", "истории"], ["ОБЩЕСТВОЗНАНИЕ", "обществознания"], ["МУЗЫК", "музыки"], ["ИЗО", "искусства"],
  ["РИТМИК", "ритмики"], ["ТРУД", "труда"], ["ОКРУЖАЮЩИЙ МИР", "окружающего мира"], ["3Д", "3D-моделирования"],
];

// \b в JavaScript не понимает кириллицу, поэтому фразы без границ слов
const ABBREV = [
  [/практикум по англ\. языку/gi, "Практикум англ."],
  [/практикум по математике/gi, "Практикум матем."],
  [/практикум по русскому языку/gi, "Практикум рус."],
  [/олимпиадная школа по/gi, "Олимп. школа по"],
  [/английский язык/gi, "Англ. яз."],
  [/русский язык/gi, "Рус. яз."],
  [/литературное чтение/gi, "Лит. чтение"],
  [/занимательная/gi, "Занимат."],
  [/вероятность и статистика/gi, "Вер. и стат."],
  [/второй иностранный/gi, "Второй ин."],
  [/тьюторский\/классный час/gi, "Кл. час"],
  [/проектная деятельность/gi, "Проект"],
  [/индивидуальный проект/gi, "Инд. проект"],
  [/математическое моделирование/gi, "Мат. модел."],
];

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа",
  "сентября", "октября", "ноября", "декабря"];

const capitalize = (s) => s.slice(0, 1).toUpperCase() + s.slice(1);

// «ВВЕДЕНИЕ В ЕПН ФИЗИКА» -> «Введение в ЕПН физика»; буквы из Excel не меняются
export function niceSubject(subject) {
  const out = subject.trim().split(/\s+/).map((word) => {
    const bare = word.replace(/^[().,]+|[().,]+$/g, "").toUpperCase();
    return ACRONYMS.has(bare) && bare !== "КИТ" ? word.toUpperCase() : word.toLowerCase();
  });
  return capitalize(out.join(" "));
}

// Короткое название для сетки недели
export function shortSubject(subject) {
  let text = niceSubject(subject);
  for (const [pattern, replacement] of ABBREV) text = text.replace(pattern, replacement);
  return capitalize(text);
}

export function hoursWord(n) {
  if (n % 10 === 1 && n % 100 !== 11) return "час";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "часа";
  return "часов";
}

// «ИВАНОВ И.И.» -> ["Иванов", "И.И."]
export function splitTeacher(teacher) {
  const i = teacher.indexOf(" ");
  const surname = i < 0 ? teacher : teacher.slice(0, i);
  const initials = i < 0 ? "" : teacher.slice(i + 1);
  return [surname.split("-").map((p) => capitalize(p.toLowerCase())).join("-"), initials];
}

// [фамилия в дательном падеже, уверены ли]. Пол по И.О. неизвестен — без догадок
export function surnameDative(surname) {
  const low = surname.toLowerCase();
  if (low === "ха" || low.length < 3) return [surname, true];
  if (/(ко|их|ых|[аеиоуыэюя]о|[еиэу])$/.test(low)) return [surname, true];
  if (/(ий|ый|ой)$/.test(low)) return [surname.slice(0, -2) + "ому", true];
  if (/(ая|яя)$/.test(low)) return [surname.slice(0, -2) + "ой", true];
  if (/(ова|ева|ёва|ина|ына)$/.test(low)) return [surname.slice(0, -1) + "ой", true];
  if (/(ов|ев|ёв|ин|ын)$/.test(low)) return [surname + "у", true];
  if (/[ая]$/.test(low)) return [surname.slice(0, -1) + "е", true];
  // на согласную: мужская склоняется, женская нет — решает человек
  return [surname, false];
}

// Родительный падеж самого частого «настоящего» предмета или пустая строка
export function mainSubjectGenitive(slots) {
  const counter = new Map();
  for (const s of slots) {
    const subject = s.subject.toUpperCase();
    if (NOT_MAIN.some((x) => subject.includes(x))) continue;
    const hit = GENITIVE.find(([key]) => subject.includes(key));
    if (hit) counter.set(hit[1], (counter.get(hit[1]) || 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [gen, count] of counter) {
    if (count > bestCount) [best, bestCount] = [gen, count];
  }
  return best;
}

// [обращение, уверены ли в склонении]
export function greeting(teacher, slots) {
  const [surname, initials] = splitTeacher(teacher);
  const [dative, sure] = surnameDative(surname);
  const gen = mainSubjectGenitive(slots);
  const who = gen ? `Профессору ${gen} ` : "Профессору ";
  return [`${who}${dative} ${initials}`.trim(), sure];
}

// «2 НОЯБРЯ .xlsx» -> «2 ноября»; если даты в имени нет — пустая строка
export function dateFromFilename(name) {
  const m = name.toLowerCase().match(new RegExp(`(\\d{1,2})\\s*(${MONTHS.join("|")})`));
  return m ? `${parseInt(m[1], 10)} ${m[2]}` : "";
}

export function wallpaperFilename(teacher, label) {
  const [surname, initials] = splitTeacher(teacher);
  return `${surname} ${initials} — ${label}.jpg`.replace(/[<>:"/\\|?*]/g, "_");
}
