const state = { data: null, pages: [], filteredPages: [], mode: document.body?.dataset.page || 'today', currentPage: 1 };
let days = [];
const $ = (selector) => document.querySelector(selector);
const clean = (value) => value || '';
const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const isValidEntry = (entry) => Boolean(entry?.day && entry?.time && entry?.course);
const dayAliases = { MONDAY: 'MON', TUES: 'TUES', TUE: 'TUES', TUESDAY: 'TUES', WEDNESDAY: 'WED', THUR: 'THURS', THU: 'THURS', THURS: 'THURS', THURSDAY: 'THURS', FRIDAY: 'FRI' };
const dayOrder = ['SUN', 'MON', 'TUES', 'WED', 'THURS', 'FRI', 'SAT'];
const normalizeDay = (day) => {
  const normalized = String(day || '').trim().toUpperCase();
  return Object.hasOwn(dayAliases, normalized) ? dayAliases[normalized] : normalized;
};
const dayIndex = (day) => {
  const index = dayOrder.indexOf(day);
  return index < 0 ? dayOrder.length : index;
};
const normalizeSearchText = (value) => String(value || '').toLowerCase().replace(/\s+/g, '');
const normalizeCourseCode = (value) => normalizeSearchText(String(value || '').replace(/\(.*/, ''));
const getTodayDay = () => dayOrder[new Date().getDay()];
const getSearchQuery = () => normalizeSearchText($('#search')?.value);
const getSelectedDay = () => getSearchQuery()
  ? 'all'
  : (state.mode === 'today' ? getTodayDay() : ($('#dayFilter')?.value || 'all'));
const courseRecordCode = (course) => course.CODE || course['COURSE CODE'] || course.CourseCode || course['Course Code'] || course.COURSECODE || course['COURSE/CODE'] || course.COURSE || course.CODES;
const courseRecordTitle = (course) => course.COURSETITLE || course['COURSE TITLE'] || course.CourseTitle || course['Course Title'] || course.COURSES;
const courseRecordUnits = (course) => course.UNIT || course.UNITS || course['CREDIT UNIT'] || course['CREDIT UNITS'] || course.CU || '';
const courseRecordInstructors = (course) => course['LECTURERS/INSTRUCTORS'] || course.LECTURERS || course.Lecturers || '';
const findCourseTitle = (page, code) => {
  const normalizedCode = normalizeCourseCode(code);
  const course = (page.tables || []).flatMap((table) => table.objects || [])
    .find((item) => normalizeCourseCode(courseRecordCode(item)) === normalizedCode && courseRecordTitle(item));
  return course ? courseRecordTitle(course) : '';
};
const matchesSearch = (entry, page) => {
  const search = getSearchQuery();
  if (!search) return true;
  const title = findCourseTitle(page, entry.course) || entry.title || '';
  return normalizeCourseCode(entry.course).includes(search) || normalizeSearchText(title).includes(search);
};

function ensureSharedControls() {
  if (!document.querySelector('link[rel="manifest"]')) document.head.insertAdjacentHTML('beforeend', '<link rel="manifest" href="manifest.webmanifest">');
  const header = $('.topbar');
  if (header && !$('#menuButton')) {
    header.insertAdjacentHTML('afterbegin', '<button class="menu-button" id="menuButton" aria-label="Open menu" aria-expanded="false">☰</button>');
  }
  if ($('.sidebar') && !$('#menuClose')) $('.sidebar').insertAdjacentHTML('afterbegin', '<button class="menu-close" id="menuClose" aria-label="Close menu">×</button>');
  if (!$('#pagination') && (state.mode === 'today' || state.mode === 'timetable' || state.mode === 'courses')) {
    const mount = $('#courseList')?.parentElement || $('#schedule') || $('.main-content');
    mount?.insertAdjacentHTML('afterend', '<div class="pagination" id="pagination" aria-label="Page navigation"></div>');
  }
  if (!$('#menuBackdrop')) document.body.insertAdjacentHTML('beforeend', '<div class="menu-backdrop" id="menuBackdrop" hidden></div>');
  const menuButton = $('#menuButton');
  const menuClose = $('#menuClose');
  const menuBackdrop = $('#menuBackdrop');
  if (menuButton && !menuButton.dataset.bound) {
    menuButton.dataset.bound = 'true';
    menuButton.addEventListener('click', () => { const open = !document.body.classList.contains('menu-open'); document.body.classList.toggle('menu-open', open); menuBackdrop.hidden = !open; menuButton.setAttribute('aria-expanded', String(open)); });
    menuBackdrop.addEventListener('click', () => { document.body.classList.remove('menu-open'); menuBackdrop.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); });
    menuClose?.addEventListener('click', () => { document.body.classList.remove('menu-open'); menuBackdrop.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); });
    document.querySelectorAll('.side-nav a').forEach((link) => link.addEventListener('click', () => { document.body.classList.remove('menu-open'); menuBackdrop.hidden = true; }));
  }
  const pagination = $('#pagination');
  if (pagination && !pagination.dataset.bound) {
    pagination.dataset.bound = 'true';
    pagination.addEventListener('click', (event) => {
      const button = event.target.closest('[data-page]');
      if (!button || button.disabled) return;
      state.currentPage += button.dataset.page === 'next' ? 1 : -1;
      renderSchedule(); renderCourses();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}

async function loadData() {
  try {
    ensureSharedControls();
    const response = await fetch('timetable_data.json');
    if (!response.ok) throw new Error('Unable to load timetable data');
    state.data = await response.json();
    state.pages = enrichPageLevels((state.data.pages || []).map((page, index) => ({
      ...page,
      _index: index,
      timetable_entries: (page.timetable_entries || []).map((entry) => ({ ...entry, day: normalizeDay(entry.day) }))
    })))
      .filter((page) => (page.timetable_entries || []).length > 0);
    const entries = state.pages.flatMap((page) => page.timetable_entries || []).filter(isValidEntry);
    days = [...new Set(entries.map((entry) => entry.day).filter(Boolean))]
      .sort((a, b) => dayIndex(a) - dayIndex(b) || a.localeCompare(b));
    populateFilters();
    applyFilters();
  } catch (error) {
    if ($('#viewSubtitle')) $('#viewSubtitle').textContent = 'Open this folder through a local web server to load the timetable data.';
    if ($('#scheduleGrid')) {
      $('#scheduleGrid').classList.remove('schedule-grid', 'today-cards');
      $('#scheduleGrid').innerHTML = '<div class="empty-state" style="display:block"><span>!</span><h3>Data could not be loaded</h3><p>Run a local server in the project folder, then refresh this page.</p></div>';
    }
  }
}

function uniqueHeaders(key) {
  return [...new Set(state.pages.map((page) => page.header?.[key]).filter(Boolean))].sort();
}

function normalizeDepartment(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .replace(/^DEPARTMENT OF /, '')
    .replace(/^DEPARTMENT /, '')
    .replace(/PRODCUTION/g, 'PRODUCTION')
    .replace(/TECNOLOGY/g, 'TECHNOLOGY');
}

function normalizeLevel(value) {
  return String(value || '').toUpperCase().replace(/\s+/g, ' ').trim().replace(/^(HND|ND)\s*(1|11|I|II)$/, (_, program, numeral) => `${program} ${numeral === '1' || numeral === 'I' ? 'I' : 'II'}`);
}

function pageLevel(page) {
  const headerLevel = normalizeLevel(page.header?.level);
  if (headerLevel) return headerLevel;
  const source = String(page.raw_text || '').slice(0, 1200).toUpperCase().replace(/\s+/g, ' ');
  const match = source.match(/\b(HND|ND)\s*(II|11|I|1)(?=[A-Z(]|$)/);
  return match ? normalizeLevel(`${match[1]} ${match[2]}`) : '';
}

function enrichPageLevels(pages) {
  let previousDepartment = '';
  let previousLevel = '';
  return pages.map((page) => {
    const department = normalizeDepartment(page.header?.department);
    const level = pageLevel(page) || (department === previousDepartment ? previousLevel : '');
    previousDepartment = department;
    previousLevel = level;
    return { ...page, _level: level };
  });
}

function departmentOptions() {
  const options = new Map();
  uniqueHeaders('department').forEach((department) => {
    const value = normalizeDepartment(department);
    if (!options.has(value)) options.set(value, value);
  });
  return [...options.entries()].sort((a, b) => a[1].localeCompare(b[1]));
}

function populateFilters() {
  const department = $('#department');
  const level = $('#level');
  departmentOptions().forEach(([value, label]) => department.add(new Option(label, value)));
  [...new Set(state.pages.map((page) => page._level).filter(Boolean))].sort().forEach((item) => level.add(new Option(item, item)));
  days.forEach((day) => $('#dayFilter')?.add(new Option(day, day)));
  const semester = state.data.source?.semester;
  if (semester) $('#semesterFilter')?.add(new Option(semester, semester));
  if (state.mode === 'today' && $('#dayFilter')) {
    const today = getTodayDay();
    if (!days.includes(today)) $('#dayFilter').add(new Option(today, today));
    $('#dayFilter').value = today;
    $('#dayFilter').disabled = true;
  }
}

function isPractical(entry) { return /\(L\)|PRACTICAL|LAB/i.test(entry.course); }

function getVisibleEntries() {
  const day = getSelectedDay();
  const session = getSearchQuery() ? 'all' : ($('#sessionFilter')?.value || 'all');
  return state.filteredPages.flatMap((page) => (page.timetable_entries || []).filter((entry) => {
    return isValidEntry(entry) && matchesSearch(entry, page) && (day === 'all' || entry.day === day) &&
      (session === 'all' || (session === 'practical' ? isPractical(entry) : !isPractical(entry)));
  }));
}

function getVisibleEntryRecords() {
  const day = getSelectedDay();
  const session = getSearchQuery() ? 'all' : ($('#sessionFilter')?.value || 'all');
  return state.filteredPages.flatMap((page, pageIndex) => (page.timetable_entries || []).map((entry, entryIndex) => ({
    page, pageIndex, entry, entryIndex
  })).filter(({ page, entry }) => isValidEntry(entry) &&
    matchesSearch(entry, page) &&
    (day === 'all' || entry.day === day) &&
    (session === 'all' || (session === 'practical' ? isPractical(entry) : !isPractical(entry)))));
}

function getTimeRange(time) {
  const parts = String(time || '').match(/\d{1,2}(?::\d{2})?/g);
  if (!parts || parts.length < 2) return null;
  const toTimetableHour = (part) => {
    const hour = Number.parseInt(part, 10);
    return hour >= 1 && hour <= 7 ? hour + 12 : hour;
  };
  const start = toTimetableHour(parts[0]);
  let end = toTimetableHour(parts[1]);
  if (end <= start) end += 12;
  return start >= 8 && start < 17 && end > start ? { start, end } : null;
}

function formatCourseLabel(page, entry) {
  const course = clean(entry.course).trim();
  const withType = course.match(/^([A-Z0-9]+)\s*\(([^)]+)\)$/i);
  if (withType) return `${withType[1]} (${withType[2].trim()})`;

  const code = course.replace(/\s*\([^)]*\).*$/, '').trim();
  const classTable = (page.tables || []).find((table) => table.table_number === 2);
  const classRecord = classTable?.objects?.find((item) => normalizeCourseCode(courseRecordCode(item)) === normalizeCourseCode(code));
  const classes = classRecord?.CLASSES;
  return classes ? `${code} (${classes})` : course;
}

function getBreakLabel(day) {
  return ['MON', 'TUES', 'WED', 'THURS', 'FRI'].includes(day) ? 'BREAK' : '';
}

function applyFilters() {
  const department = $('#department').value;
  const level = $('#level').value;
  const search = getSearchQuery();
  const semester = $('#semesterFilter')?.value || 'all';
  state.filteredPages = state.pages.filter((page) => {
    const header = page.header || {};
    const entries = (page.timetable_entries || []).filter(isValidEntry);
    const matchesPageSearch = !search || entries.some((entry) => matchesSearch(entry, page));
    return (search || department === 'all' || normalizeDepartment(header.department) === department) &&
      (search || level === 'all' || page._level === level) &&
      (semester === 'all' || state.data.source?.semester === semester) && matchesPageSearch;
  });
  state.currentPage = 1;
  renderSummary();
  renderSchedule();
  renderCourses();
}

function renderSummary() {
  const pages = state.filteredPages;
  const entries = getVisibleEntries();
  const courseCodes = new Set(entries.map((entry) => normalizeCourseCode(entry.course)));
  if ($('#pageCount')) $('#pageCount').textContent = pages.length;
  if ($('#classCount')) $('#classCount').textContent = entries.length;
  if ($('#courseCount')) $('#courseCount').textContent = courseCodes.size;
  if ($('#directoryCount')) $('#directoryCount').textContent = `${courseCodes.size} courses`;
  const selectedDepartment = $('#department').selectedOptions[0]?.textContent;
  const selectedLevel = $('#level').value !== 'all' ? ` · ${$('#level').value}` : '';
  if ($('#viewTitle')) $('#viewTitle').textContent = getSearchQuery() ? 'Search results' : selectedDepartment === 'All departments' ? 'All timetables' : selectedDepartment;
  if ($('#viewSubtitle')) $('#viewSubtitle').textContent = getSearchQuery()
    ? `All departments · All levels · ${state.data.source?.semester || 'Academic session'}`
    : `${selectedDepartment || 'All departments'}${selectedLevel} · ${state.data.source?.semester || 'Academic session'}`;
}

function renderSchedule() {
  const container = $('#scheduleGrid');
  if (!container) return;
  container.classList.remove('schedule-grid', 'today-cards');
  const isToday = state.mode === 'today';
  const isSearching = Boolean(getSearchQuery());
  const visibleRecords = getVisibleEntryRecords();
  const entries = isSearching
    ? visibleRecords
    : isToday
      ? visibleRecords.slice((state.currentPage - 1) * 12, state.currentPage * 12)
      : visibleRecords.filter(({ pageIndex }) => pageIndex === state.currentPage - 1);
  const daysToRender = isSearching
    ? dayOrder.filter((day) => visibleRecords.some(({ entry }) => entry.day === day))
    : isToday ? [getTodayDay()] : ($('#dayFilter')?.value || 'all') === 'all' ? ['MON', 'TUES', 'WED', 'THURS', 'FRI'] : [$('#dayFilter').value];
  const timeSlots = ['8-9AM', '9-10AM', '10-11AM', '11-12PM', '12-1PM', '1-2PM', '2-3PM', '3-4PM', '4-5PM'];
  const header = `<thead><tr><th scope="col">DAYS</th>${timeSlots.map((slot) => `<th scope="col">${slot}</th>`).join('')}</tr></thead>`;
  const body = daysToRender.map((day) => {
    const dayEntries = entries.map((record) => ({ ...record, range: getTimeRange(record.entry.time) }))
      .filter((record) => record.entry.day === day && record.range)
      .sort((a, b) => a.range.start - b.range.start);
    const cells = [];
    for (let slot = 0; slot < timeSlots.length;) {
      const startHour = slot + 8;
      const starting = dayEntries.filter((record) => record.range.start === startHour);
      if (starting.length) {
        const nextStart = dayEntries
          .filter((record) => record.range.start > startHour)
          .reduce((earliest, record) => Math.min(earliest, record.range.start), 17);
        const endHour = Math.min(
          17,
          nextStart,
          Math.max(...starting.map((record) => record.range.end))
        );
        const colspan = Math.max(1, endHour - startHour);
        const courses = starting.map(({ page, pageIndex, entry, entryIndex }) => {
          const label = escapeHtml(formatCourseLabel(page, entry));
          const department = normalizeDepartment(page.header?.department) || 'GENERAL';
          return `<button type="button" class="course-entry${isPractical(entry) ? ' practical' : ''}" data-page-index="${pageIndex}" data-entry-index="${entryIndex}" title="View ${escapeHtml(entry.course)} details">${label}${isSearching ? `<span class="course-department">${escapeHtml(department)}</span>` : ''}</button>`;
        }
        ).join('<br>');
        const breakLabel = slot <= 5 && slot + colspan > 5 ? getBreakLabel(day) : '';
        cells.push(`<td${colspan > 1 ? ` colspan="${colspan}"` : ''}${breakLabel ? ' class="has-break"' : ''}>${breakLabel ? `<span class="break-marker">${escapeHtml(breakLabel)}</span>` : ''}${courses}</td>`);
        slot += colspan;
        continue;
      }

      const breakLabel = slot === 5 ? getBreakLabel(day) : '';
      cells.push(`<td${breakLabel ? ' class="break-slot"' : ''}>${breakLabel ? `<span class="break-marker">${escapeHtml(breakLabel)}</span>` : ''}</td>`);
      slot += 1;
    }
    return `<tr><th scope="row">${day}</th>${cells.join('')}</tr>`;
  }).join('');

  container.innerHTML = `<table class="schedule-table">${header}<tbody>${body}</tbody></table>`;
  $('#scheduleHeading').textContent = isToday ? 'Weekly lecture schedule' : 'Lecture schedule';
  $('#emptyState').hidden = entries.length > 0;
  container.hidden = entries.length === 0;
  renderPagination(isSearching ? 1 : isToday ? visibleRecords.length : state.filteredPages.length, isToday ? 12 : 1);
}

function renderCourses() {
  if (!$('#courseList')) return;
  const map = new Map();
  state.filteredPages.flatMap((page) => (page.timetable_entries || [])
    .filter((entry) => isValidEntry(entry) && matchesSearch(entry, page))
    .map((entry) => ({ page, entry }))).forEach(({ page, entry }) => {
    const code = entry.course?.replace(/\(.*/, '').trim();
    const key = normalizeCourseCode(code);
    if (key && !map.has(key)) map.set(key, [code, findCourseTitle(page, entry.course) || entry.title || 'Course in timetable']);
  });
  const courses = [...map.values()].sort(([a], [b]) => a.localeCompare(b));
  const firstCourse = state.mode === 'courses' ? (state.currentPage - 1) * 24 : 0;
  const visibleCourses = courses.slice(firstCourse, firstCourse + 24);
  $('#courseList').innerHTML = courses.length
    ? visibleCourses.map(([code, title]) => `<button class="course-item" data-course-code="${escapeHtml(code)}"><div><strong>${escapeHtml(code)}</strong><small>${escapeHtml(title)}</small></div><span>View details</span></button>`).join('')
    : '<p class="course-empty">No courses found. Try another search or reset your filters.</p>';
  if (state.mode === 'courses') renderPagination(courses.length, 24);
}

function renderPagination(totalItems, pageSize) {
  const container = $('#pagination');
  if (!container) return;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (state.currentPage > totalPages) state.currentPage = totalPages;
  container.innerHTML = totalPages > 1 ? `<button class="page-button" data-page="prev" ${state.currentPage === 1 ? 'disabled' : ''}>Previous</button><span>Page ${state.currentPage} of ${totalPages}</span><button class="page-button" data-page="next" ${state.currentPage === totalPages ? 'disabled' : ''}>Next</button>` : '';
}

function findCourseDetails(page, code) {
  const normalizedCode = normalizeCourseCode(code);
  return (page.tables || []).flatMap((table) => table.objects || [])
    .find((course) => normalizeCourseCode(courseRecordCode(course)) === normalizedCode) || null;
}

function openDetails(page, entry) {
  const courseCode = clean(entry.course);
  const course = findCourseDetails(page, courseCode);
  const header = page.header || {};
  const details = [
    ['Day', entry.day], ['Time', entry.time], ['Department', header.department || 'All departments'],
    ['Level / class', header.level || 'General timetable'], ['Program / option', header.program_or_option || 'Not specified']
  ];
  $('#detailsTitle').textContent = courseCode;
  $('#detailsCourseTitle').textContent = (course && courseRecordTitle(course)) || 'Course session';
  $('#detailsGrid').innerHTML = details.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  $('#detailsNote').innerHTML = course ? `<strong>${escapeHtml(courseRecordUnits(course) || '—')} unit course</strong><br>Instructor(s): ${escapeHtml(courseRecordInstructors(course) || 'Not listed in source data')}` : 'This session is listed in the official timetable source. Additional course information was not provided.';
  $('#detailsModal').hidden = false;
  $('#closeDetails').focus();
}

function closeDetails() { $('#detailsModal').hidden = true; }

$('#scheduleGrid')?.addEventListener('click', (event) => {
  const course = event.target.closest('.course-entry');
  if (!course) return;
  const page = state.filteredPages[Number(course.dataset.pageIndex)];
  const entry = page?.timetable_entries?.[Number(course.dataset.entryIndex)];
  if (page && entry) openDetails(page, entry);
});

$('#courseList')?.addEventListener('click', (event) => {
  const card = event.target.closest('.course-item');
  if (!card) return;
  const code = card.dataset.courseCode;
  const match = state.filteredPages.flatMap((page) => (page.timetable_entries || []).map((entry) => ({ page, entry }))).find(({ entry }) => normalizeCourseCode(entry.course) === normalizeCourseCode(code));
  if (match) openDetails(match.page, match.entry);
});

$('#closeDetails')?.addEventListener('click', closeDetails);
$('#detailsModal')?.addEventListener('click', (event) => { if (event.target.id === 'detailsModal') closeDetails(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDetails(); });

['department','level','dayFilter','sessionFilter','semesterFilter'].forEach((id) => document.getElementById(id)?.addEventListener('change', applyFilters));
$('#search')?.addEventListener('input', applyFilters);
$('#resetButton')?.addEventListener('click', () => { ['department','level','dayFilter','sessionFilter','semesterFilter'].forEach((id) => { const element = document.getElementById(id); if (element) element.value = id === 'dayFilter' && state.mode === 'today' ? getTodayDay() : 'all'; }); if ($('#search')) $('#search').value = ''; applyFilters(); });
$('#printButton')?.addEventListener('click', () => window.print());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
function initializeApp() {
  state.mode = document.body?.dataset.page || 'today';
  if (state.mode === 'about') ensureSharedControls();
  else loadData();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeApp);
else initializeApp();