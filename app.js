const state = { data: null, pages: [], filteredPages: [], mode: document.body?.dataset.page || 'today', currentPage: 1 };
const days = ['MON', 'TUES', 'WED', 'THURS', 'FRI'];
const slots = ['8-9AM', '9-10AM', '10-11AM', '11-12PM', '12-1PM', '1-2PM', '2-3PM', '3-4PM'];
const $ = (selector) => document.querySelector(selector);
const clean = (value) => value || '';
const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

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
    state.pages = (state.data.pages || []).map((page, index) => ({ ...page, _index: index }));
    populateFilters();
    applyFilters();
  } catch (error) {
    if ($('#viewSubtitle')) $('#viewSubtitle').textContent = 'Open this folder through a local web server to load the timetable data.';
    if ($('#scheduleGrid')) $('#scheduleGrid').innerHTML = '<div class="empty-state" style="display:block;grid-column:1/-1"><span>!</span><h3>Data could not be loaded</h3><p>Run a local server in the project folder, then refresh this page.</p></div>';
  }
}

function uniqueHeaders(key) {
  return [...new Set(state.pages.map((page) => page.header?.[key]).filter(Boolean))].sort();
}

function populateFilters() {
  const department = $('#department');
  const level = $('#level');
  uniqueHeaders('department').forEach((item) => department.add(new Option(item.replace(/^DEPARTMENT OF /, ''), item)));
  uniqueHeaders('level').forEach((item) => level.add(new Option(item, item)));
  days.forEach((day) => $('#dayFilter')?.add(new Option(day, day)));
  const semester = state.data.source?.semester;
  if (semester) $('#semesterFilter')?.add(new Option(semester, semester));
  if (state.mode === 'today' && $('#dayFilter')) $('#dayFilter').value = days[(new Date().getDay() + 6) % 7] || 'MON';
}

function isPractical(entry) { return /\(L\)|PRACTICAL|LAB/i.test(entry.course); }

function getVisibleEntries() {
  const day = $('#dayFilter')?.value || 'all';
  const session = $('#sessionFilter')?.value || 'all';
  return state.filteredPages.flatMap((page) => (page.timetable_entries || []).filter((entry) => {
    return (day === 'all' || entry.day === day) && (session === 'all' || (session === 'practical' ? isPractical(entry) : !isPractical(entry)));
  }));
}

function applyFilters() {
  const department = $('#department').value;
  const level = $('#level').value;
  const search = $('#search').value.trim().toLowerCase();
  const semester = $('#semesterFilter')?.value || 'all';
  state.filteredPages = state.pages.filter((page) => {
    const header = page.header || {};
    const entries = page.timetable_entries || [];
    const matchesSearch = !search || entries.some((entry) => `${entry.course} ${entry.title || ''}`.toLowerCase().includes(search));
    return (department === 'all' || header.department === department) && (level === 'all' || header.level === level) && (semester === 'all' || state.data.source?.semester === semester) && matchesSearch;
  });
  state.currentPage = 1;
  renderSummary();
  renderSchedule();
  renderCourses();
}

function renderSummary() {
  const pages = state.filteredPages;
  const entries = getVisibleEntries();
  const courseCodes = new Set(entries.map((entry) => entry.course?.replace(/\(.*/, '')));
  if ($('#pageCount')) $('#pageCount').textContent = pages.length;
  if ($('#classCount')) $('#classCount').textContent = entries.length;
  if ($('#courseCount')) $('#courseCount').textContent = courseCodes.size;
  if ($('#directoryCount')) $('#directoryCount').textContent = `${courseCodes.size} courses`;
  const selectedDepartment = $('#department').selectedOptions[0]?.textContent;
  const selectedLevel = $('#level').value !== 'all' ? ` · ${$('#level').value}` : '';
  if ($('#viewTitle')) $('#viewTitle').textContent = selectedDepartment === 'All departments' ? 'All timetables' : selectedDepartment;
  if ($('#viewSubtitle')) $('#viewSubtitle').textContent = `${selectedDepartment || 'All departments'}${selectedLevel} · ${state.data.source?.semester || 'Academic session'}`;
}

function renderSchedule() {
  const grid = $('#scheduleGrid');
  if (!grid) return;
  const isToday = state.mode === 'today';
  grid.innerHTML = isToday ? '' : `<div class="grid-cell grid-header">Day / time</div>${slots.map((slot) => `<div class="grid-cell grid-header">${slot}</div>`).join('')}`;
  const entries = getVisibleEntries();
  const visibleDays = isToday ? [$('#dayFilter').value] : ($('#dayFilter').value === 'all' ? days : [$('#dayFilter').value]);
  if (isToday) {
    const pageEntries = getVisibleEntries().slice((state.currentPage - 1) * 12, state.currentPage * 12);
    grid.classList.add('today-cards');
    grid.innerHTML = pageEntries.sort((a, b) => slots.indexOf(a.time) - slots.indexOf(b.time)).map((entry) => {
      const practical = isPractical(entry); const code = clean(entry.course);
      const pageIndex = state.filteredPages.findIndex((page) => (page.timetable_entries || []).includes(entry));
      const entryIndex = state.filteredPages[pageIndex].timetable_entries.indexOf(entry);
      return `<button class="class-card${practical ? ' practical' : ''}" data-page-index="${pageIndex}" data-entry-index="${entryIndex}"><span class="class-time">${escapeHtml(entry.time)}</span><span class="class-code">${escapeHtml(code)}</span><span class="class-name">${practical ? 'Practical session' : 'Lecture class'}</span></button>`;
    }).join('');
    $('#scheduleHeading').textContent = `${visibleDays[0]} classes`;
    $('#emptyState').hidden = entries.length > 0; grid.hidden = entries.length === 0; renderPagination(entries.length, 12); return;
  }
  grid.classList.remove('today-cards');
  const page = state.filteredPages[state.currentPage - 1];
  const pageEntries = page ? (page.timetable_entries || []) : [];
  visibleDays.forEach((day) => {
    grid.insertAdjacentHTML('beforeend', `<div class="grid-cell day-cell">${day}</div>`);
    slots.forEach((slot) => {
      const matches = pageEntries.filter((entry) => entry.day === day && entry.time === slot);
      const cards = matches.map((entry) => {
        const practical = isPractical(entry);
        const code = clean(entry.course);
        const pageIndex = state.filteredPages.findIndex((page) => (page.timetable_entries || []).includes(entry));
        const entryIndex = state.filteredPages[pageIndex].timetable_entries.indexOf(entry);
        return `<button class="class-card${practical ? ' practical' : ''}" data-page-index="${pageIndex}" data-entry-index="${entryIndex}" title="View ${escapeHtml(code)} details"><span class="class-code">${escapeHtml(code)}</span><span class="class-name">${practical ? 'Practical session' : 'Lecture class'}</span></button>`;
      }).join('');
      grid.insertAdjacentHTML('beforeend', `<div class="grid-cell class-cell">${cards}</div>`);
    });
  });
  $('#emptyState').hidden = entries.length > 0;
  grid.hidden = entries.length === 0;
  renderPagination(state.filteredPages.length, 1);
}

function renderCourses() {
  if (!$('#courseList')) return;
  const map = new Map();
  state.filteredPages.flatMap((page) => page.timetable_entries || []).forEach((entry) => {
    const code = entry.course?.replace(/\(.*/, '');
    if (code && !map.has(code)) map.set(code, entry.title || 'Course in timetable');
  });
  const courses = [...map.entries()].sort();
  const visibleCourses = courses.slice((state.currentPage - 1) * 24, state.currentPage * 24);
  $('#courseList').innerHTML = visibleCourses.map(([code, title]) => `<button class="course-item" data-course-code="${escapeHtml(code)}"><div><strong>${escapeHtml(code)}</strong><small>${escapeHtml(title)}</small></div><span>View details</span></button>`).join('');
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
  const normalizedCode = code.replace(/\(.*/, '').trim();
  const courseTable = (page.tables || []).find((table) => table.table_number === 3);
  return courseTable?.objects?.find((course) => course.CODE === normalizedCode) || null;
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
  $('#detailsCourseTitle').textContent = course?.COURSETITLE || 'Course session';
  $('#detailsGrid').innerHTML = details.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  $('#detailsNote').innerHTML = course ? `<strong>${escapeHtml(course.UNIT || '—')} unit course</strong><br>Instructor(s): ${escapeHtml(course['LECTURERS/INSTRUCTORS'] || 'Not listed in source data')}` : 'This session is listed in the official timetable source. Additional course information was not provided.';
  $('#detailsModal').hidden = false;
  $('#closeDetails').focus();
}

function closeDetails() { $('#detailsModal').hidden = true; }

$('#scheduleGrid')?.addEventListener('click', (event) => {
  const card = event.target.closest('.class-card');
  if (!card) return;
  const page = state.filteredPages[Number(card.dataset.pageIndex)];
  const entry = page?.timetable_entries?.[Number(card.dataset.entryIndex)];
  if (page && entry) openDetails(page, entry);
});

$('#courseList')?.addEventListener('click', (event) => {
  const card = event.target.closest('.course-item');
  if (!card) return;
  const code = card.dataset.courseCode;
  const match = state.filteredPages.flatMap((page) => (page.timetable_entries || []).map((entry) => ({ page, entry }))).find(({ entry }) => entry.course?.replace(/\(.*/, '') === code);
  if (match) openDetails(match.page, match.entry);
});

$('#closeDetails')?.addEventListener('click', closeDetails);
$('#detailsModal')?.addEventListener('click', (event) => { if (event.target.id === 'detailsModal') closeDetails(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDetails(); });

['department','level','dayFilter','sessionFilter','semesterFilter'].forEach((id) => document.getElementById(id)?.addEventListener('change', applyFilters));
$('#search')?.addEventListener('input', applyFilters);
$('#resetButton')?.addEventListener('click', () => { ['department','level','dayFilter','sessionFilter','semesterFilter'].forEach((id) => { const element = document.getElementById(id); if (element) element.value = 'all'; }); if ($('#search')) $('#search').value = ''; applyFilters(); });
$('#printButton')?.addEventListener('click', () => window.print());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
function initializeApp() {
  state.mode = document.body?.dataset.page || 'today';
  if (state.mode === 'about') ensureSharedControls();
  else loadData();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeApp);
else initializeApp();