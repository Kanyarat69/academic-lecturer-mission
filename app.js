/**
 * Executive Dashboard Application Logic (app.js)
 * - จับคู่รหัสวิชา -> ชื่อวิชา จากข้อมูลในระบบ (และแผ่นงานอื่น) มาเติมให้อัตโนมัติเมื่อไฟล์พันธกิจไม่มีคอลัมน์ชื่อวิชา
 * - ตัดแถวสรุปท้ายตาราง (เช่น "รวมประมาณการค่าสอนทั้งสิ้น จำนวน", "บาท") ออกทั้งหมด และตรวจรหัสวิชาให้ต้องมีตัวเลขเสมอ
 * - คัดกรองเฉพาะ "อาจารย์พิเศษ" เท่านั้น (ตัดอาจารย์ประจำ และอาจารย์ประจำร่วมสอนออกทั้งหมด)
 * - จัดแนวหัวตารางกับข้อมูลในตารางสรุปประมาณการพันธกิจให้ตรงคอลัมน์ทุกช่อง พร้อมแยก "กลุ่มทฤษฎี (T)" และ "กลุ่มปฏิบัติ (L)"
 */

/* ==========================================================================
   1. GLOBAL STATE MANAGEMENT & CHART INSTANCES
   ========================================================================== */
const FACULTY_MISSION_LINKS = [
    {
        facultyName: 'คณะบัญชี',
        url: 'https://docs.google.com/spreadsheets/d/1UueLvkTS7gn6bNc-R_5P485A0-xA2Ily/edit?usp=drive_link&ouid=107080842240450113194&rtpof=true&sd=true',
        keywords: ['บัญชี', 'acc', 'act', 'fin', 'aud', 'tax']
    },
    {
        facultyName: 'คณะนิติศาสตร์',
        url: 'https://docs.google.com/spreadsheets/d/10loHRKiAlxuI1ilTyOta0Kzs7IKLK9nx/edit?usp=drive_link&ouid=107080842240450113194&rtpof=true&sd=true',
        keywords: ['นิติ', 'law', 'llb', 'llm']
    },
    {
        facultyName: 'คณะนิเทศศาสตร์',
        url: 'https://docs.google.com/spreadsheets/d/1xFh5QIyQHXhn5ILbNTuJ0vYQ6AwHV9ez/edit?usp=drive_link&ouid=107080842240450113194&rtpof=true&sd=true',
        keywords: ['นิเทศ', 'สื่อสาร', 'cmm', 'ocm', 'com', 'bca', 'dmc', 'pr', 'adv', 'jrn', 'flm', 'fdm', 'cpa']
    }
];

const STATE = {
    rawLecturerData: [],
    rawMissionData: [],
    filteredLecturerData: [],
    currentYearFilter: 'ALL',
    currentSemesterFilter: 'ALL',
    currentDegreeFilter: 'ALL',
    activeFaculty: 'ALL',
    selectedMajorFilter: 'ALL',
    courseSortField: 'lecturers',
    courseSortDir: 'desc',
    rosterPage: 1,
    rosterPageSize: 15,
    customOrgMap: JSON.parse(localStorage.getItem('custom_lecturer_orgs') || '{}')
};

const CHARTS = {
    yoyTrend: null,
    facultyHorizontal: null,
    semesterBar: null,
    facMajorLecturers: null,
    facWorkload: null
};

const chartDataLabelsPlugin = {
    id: 'chartDataLabelsPlugin',
    afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.data.datasets.forEach((dataset, datasetIndex) => {
            const meta = chart.getDatasetMeta(datasetIndex);
            meta.data.forEach((bar, index) => {
                const value = dataset.data[index];
                if (value > 0) {
                    ctx.save();
                    ctx.font = 'bold 11px Sarabun, sans-serif';
                    ctx.fillStyle = index === 0 ? '#C81E63' : '#13233D';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`${value.toLocaleString()} คน`, bar.x + 8, bar.y);
                    ctx.restore();
                }
            });
        });
    }
};

const verticalBarLabelsPlugin = {
    id: 'verticalBarLabelsPlugin',
    afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.data.datasets.forEach((dataset, datasetIndex) => {
            const meta = chart.getDatasetMeta(datasetIndex);
            meta.data.forEach((bar, index) => {
                const value = dataset.data[index];
                if (value !== null && value !== undefined && value > 0) {
                    ctx.save();
                    ctx.font = 'bold 11px Sarabun, sans-serif';
                    ctx.fillStyle = '#13233D';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(`${value.toLocaleString()}`, bar.x, bar.y - 4);
                    ctx.restore();
                }
            });
        });
    }
};

/* ==========================================================================
   2. DOM INITIALIZATION & SAFE EVENT BINDING
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    initTabNavigation();
    ensureMissionTableSplitHeaders();
    updateFilterStatusBadges();
});

function safeAddEventListener(id, eventType, handler) {
    const element = document.getElementById(id);
    if (element) element.addEventListener(eventType, handler);
}

function ensureMissionTableSplitHeaders() {
    const tbody = document.getElementById('mission-table-body');
    const table = tbody?.closest('table');
    if (!table) return;

    table.style.display = 'table';
    table.style.width = '100%';
    table.style.minWidth = '1120px';
    table.style.tableLayout = 'fixed';
    table.style.borderCollapse = 'collapse';

    let colgroup = table.querySelector('colgroup');
    if (!colgroup) {
        colgroup = document.createElement('colgroup');
        table.insertBefore(colgroup, table.firstChild);
    }
    colgroup.innerHTML = `
        <col style="width: 56px;">
        <col style="width: 190px;">
        <col style="width: 145px;">
        <col style="width: 225px;">
        <col style="width: 110px;">
        <col style="width: 85px;">
        <col style="width: 105px;">
        <col style="width: 105px;">
        <col style="width: 175px;">
    `;

    const thead = table.querySelector('thead');
    if (!thead) return;

    thead.innerHTML = `
        <tr>
            <th style="text-align:center;">ลำดับ</th>
            <th style="text-align:left;">ชื่ออาจารย์พิเศษ</th>
            <th style="text-align:left;">รหัสวิชา</th>
            <th style="text-align:left;">ชื่อวิชา</th>
            <th style="text-align:center;">ประเภทวิชา</th>
            <th style="text-align:center;">หน่วยกิต</th>
            <th style="text-align:center; background-color:#0f294a;">กลุ่มทฤษฎี (T)</th>
            <th style="text-align:center; background-color:#0f393b;">กลุ่มปฏิบัติ (L)</th>
            <th style="text-align:left;">หมายเหตุ</th>
        </tr>
    `;
}

function initEventListeners() {
    safeAddEventListener('btn-upload-excel', 'click', () => document.getElementById('excel-file-input')?.click());
    safeAddEventListener('excel-file-input', 'change', handleLecturerExcelUpload);

    safeAddEventListener('btn-upload-mission-excel', 'click', () => document.getElementById('mission-excel-file-input')?.click());
    safeAddEventListener('mission-excel-file-input', 'change', handleMissionExcelUpload);

    document.querySelectorAll('#year-filter-group .year-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const yearVal = e.currentTarget.getAttribute('data-year') || 'ALL';
            syncYearFilterUI(yearVal);
            STATE.currentYearFilter = yearVal;
            applyGlobalFilters();
        });
    });

    safeAddEventListener('global-semester-filter', 'change', (e) => {
        STATE.currentSemesterFilter = e.target.value;
        const facSemSelect = document.getElementById('fac-semester-select');
        if (facSemSelect) facSemSelect.value = STATE.currentSemesterFilter;
        applyGlobalFilters();
    });

    safeAddEventListener('global-degree-filter', 'change', (e) => {
        STATE.currentDegreeFilter = e.target.value;
        const facDegSelect = document.getElementById('fac-degree-select');
        if (facDegSelect) facDegSelect.value = STATE.currentDegreeFilter;
        applyGlobalFilters();
    });

    safeAddEventListener('faculty-dropdown-select', 'change', (e) => {
        STATE.activeFaculty = e.target.value;
        STATE.selectedMajorFilter = 'ALL';
        STATE.rosterPage = 1;
        renderFacultyTab();
    });

    safeAddEventListener('fac-year-select', 'change', (e) => {
        STATE.currentYearFilter = e.target.value;
        syncYearFilterUI(STATE.currentYearFilter);
        STATE.rosterPage = 1;
        applyGlobalFilters();
    });

    safeAddEventListener('fac-semester-select', 'change', (e) => {
        STATE.currentSemesterFilter = e.target.value;
        const globalSem = document.getElementById('global-semester-filter');
        if (globalSem) globalSem.value = STATE.currentSemesterFilter;
        STATE.rosterPage = 1;
        applyGlobalFilters();
    });

    safeAddEventListener('fac-degree-select', 'change', (e) => {
        STATE.currentDegreeFilter = e.target.value;
        const globalDeg = document.getElementById('global-degree-select');
        if (globalDeg) globalDeg.value = STATE.currentDegreeFilter;
        STATE.rosterPage = 1;
        applyGlobalFilters();
    });

    safeAddEventListener('btn-reset-faculty-filters', 'click', () => {
        STATE.activeFaculty = 'ALL';
        STATE.selectedMajorFilter = 'ALL';
        STATE.currentYearFilter = 'ALL';
        STATE.currentSemesterFilter = 'ALL';
        STATE.currentDegreeFilter = 'ALL';
        STATE.rosterPage = 1;

        syncYearFilterUI('ALL');
        const gSem = document.getElementById('global-semester-filter');
        const gDeg = document.getElementById('global-degree-filter');
        const fSem = document.getElementById('fac-semester-select');
        const fDeg = document.getElementById('fac-degree-select');
        const fDrop = document.getElementById('faculty-dropdown-select');
        const fCourseSearch = document.getElementById('fac-course-search');
        const fTableSearch = document.getElementById('fac-table-search');

        if (gSem) gSem.value = 'ALL';
        if (gDeg) gDeg.value = 'ALL';
        if (fSem) fSem.value = 'ALL';
        if (fDeg) fDeg.value = 'ALL';
        if (fDrop) fDrop.value = 'ALL';
        if (fCourseSearch) fCourseSearch.value = '';
        if (fTableSearch) fTableSearch.value = '';

        applyGlobalFilters();
    });

    safeAddEventListener('btn-clear-major-filter', 'click', () => {
        STATE.selectedMajorFilter = 'ALL';
        STATE.rosterPage = 1;
        renderFacultyTab();
    });

    safeAddEventListener('workload-metric-select', 'change', () => renderFacultyTab());
    safeAddEventListener('fac-course-search', 'input', () => renderFacultyTab());

    safeAddEventListener('fac-course-sort', 'change', (e) => {
        const val = e.target.value;
        if (val === 'code_asc') {
            STATE.courseSortField = 'code';
            STATE.courseSortDir = 'asc';
        } else if (val === 'name_asc') {
            STATE.courseSortField = 'name';
            STATE.courseSortDir = 'asc';
        } else {
            STATE.courseSortField = 'lecturers';
            STATE.courseSortDir = 'desc';
        }
        renderFacultyTab();
    });

    document.querySelectorAll('[data-course-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.getAttribute('data-course-sort');
            if (STATE.courseSortField === field) {
                STATE.courseSortDir = STATE.courseSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                STATE.courseSortField = field;
                STATE.courseSortDir = field === 'lecturers' ? 'desc' : 'asc';
            }
            const sortSelect = document.getElementById('fac-course-sort');
            if (sortSelect) {
                if (field === 'code' && STATE.courseSortDir === 'asc') sortSelect.value = 'code_asc';
                else if (field === 'name' && STATE.courseSortDir === 'asc') sortSelect.value = 'name_asc';
                else sortSelect.value = 'lecturers_desc';
            }
            renderFacultyTab();
        });
    });

    safeAddEventListener('fac-table-search', 'input', () => {
        STATE.rosterPage = 1;
        renderFacultyTab();
    });

    safeAddEventListener('fac-roster-sort', 'change', () => {
        STATE.rosterPage = 1;
        renderFacultyTab();
    });

    safeAddEventListener('fac-roster-page-size', 'change', (e) => {
        STATE.rosterPageSize = e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value, 10);
        STATE.rosterPage = 1;
        renderFacultyTab();
    });

    safeAddEventListener('btn-export-faculty-report', 'click', exportSelectedFacultyExcel);
    safeAddEventListener('btn-close-fac-lecturer-modal', 'click', closeFacultyLecturerModal);
    safeAddEventListener('btn-close-fac-lecturer-modal-footer', 'click', closeFacultyLecturerModal);

    safeAddEventListener('overview-table-year-filter', 'change', renderOverviewTable);
    safeAddEventListener('overview-table-semester-filter', 'change', renderOverviewTable);

    safeAddEventListener('lecturer-search-input', 'input', handleLecturerSearch);
    safeAddEventListener('btn-clear-search', 'click', () => {
        const input = document.getElementById('lecturer-search-input');
        if (input) input.value = '';
        handleLecturerSearch();
    });
    safeAddEventListener('lecturer-year-filter', 'change', handleLecturerSearch);
    safeAddEventListener('lecturer-semester-filter', 'change', handleLecturerSearch);

    safeAddEventListener('btn-open-edit-org', 'click', openEditOrgModal);
    safeAddEventListener('btn-close-edit-org', 'click', closeEditOrgModal);
    safeAddEventListener('btn-cancel-edit-org', 'click', closeEditOrgModal);
    safeAddEventListener('btn-save-org', 'click', saveEditOrg);

    safeAddEventListener('btn-presentation-mode', 'click', () => {
        document.getElementById('presentation-modal')?.classList.remove('hidden');
    });
    safeAddEventListener('btn-close-presentation', 'click', () => {
        document.getElementById('presentation-modal')?.classList.add('hidden');
    });

    safeAddEventListener('btn-export-csv', 'click', exportMainCSV);
    safeAddEventListener('btn-export-mission-csv', 'click', exportMissionCSV);
}

function syncYearFilterUI(yearVal) {
    document.querySelectorAll('#year-filter-group .year-filter-btn').forEach(b => {
        if (b.getAttribute('data-year') === yearVal) {
            b.classList.add('active', 'bg-navy', 'text-white');
            b.classList.remove('text-slate-600');
        } else {
            b.classList.remove('active', 'bg-navy', 'text-white');
            b.classList.add('text-slate-600');
        }
    });
    const facYearSelect = document.getElementById('fac-year-select');
    if (facYearSelect) facYearSelect.value = yearVal;
}

function initTabNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-tab');
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            tabContents.forEach(content => {
                if (content.id === target) {
                    content.classList.remove('hidden');
                    content.classList.add('block');
                } else {
                    content.classList.add('hidden');
                    content.classList.remove('block');
                }
            });

            if (target === 'tab-faculty') renderFacultyTab();
            if (target === 'tab-lecturer') handleLecturerSearch();
        });
    });
}

/* ==========================================================================
   3. DATA SANITIZATION, NORMALIZATION & MATCHING HELPERS
   ========================================================================== */
function cleanString(val) {
    return (val !== null && val !== undefined) ? String(val).replace(/\s+/g, ' ').trim() : '';
}

function escapeHTML(str) {
    return cleanString(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getColValue(row, keywords, excludeKeywords = []) {
    const keys = Object.keys(row).filter(k => {
        const cleanK = k.trim();
        return !excludeKeywords.some(ex => cleanK.includes(ex));
    });
    for (const kw of keywords) {
        const exactKey = keys.find(k => k.trim() === kw);
        if (exactKey && row[exactKey] !== '') return row[exactKey];
    }
    for (const kw of keywords) {
        const partialKey = keys.find(k => k.trim().includes(kw));
        if (partialKey && row[partialKey] !== '') return row[partialKey];
    }
    return '';
}

function normalizeSearchText(str) {
    return cleanString(str).toLowerCase().replace(/\s+/g, '');
}

function stripAcademicPrefix(name) {
    let s = cleanString(name).toLowerCase();
    s = s.replace(/^(ว่าที่\s*ร\.ต\.|ร\.ต\.|พ\.ต\.|พ\.ท\.|พ\.อ\.|ร\.อ\.|ร\.ท\.|ผศ\.ดร\.|รศ\.ดร\.|ศ\.ดร\.|ผศ\.|รศ\.|ศ\.|ดร\.|อ\.|อาจารย์|นางสาว|น\.ส\.|นาง|นาย|คุณ)\s*/g, '');
    s = s.replace(/^(ดร\.|อ\.)\s*/g, '');
    return s.replace(/\s+/g, '');
}

function isSummaryOrFooterRow(rowJoined) {
    const s = cleanString(rowJoined);
    if (!s) return true;
    const summaryKeywords = [
        'รวมทั้งสิ้น', 'รวมทั้งหมด', 'รวมประมาณการ', 'ค่าสอนทั้งสิ้น',
        'รวมค่าสอน', 'รวมเป็นเงิน', 'จำนวนเงิน', 'ยอดรวม',
        'การคิดพันธกิจ', 'อัตราค่าตอบแทน', 'ครูปฏิบัติการ',
        'เกณฑ์การคิด', 'หน่วยกิตชั่วโมง', 'ลงชื่อ', 'ผู้จัดทำ', 'ผู้ตรวจสอบ', 'อนุมัติ'
    ];
    if (summaryKeywords.some(kw => s.includes(kw))) return true;
    if (/^รวม\s/.test(s)) return true;
    return false;
}

function isValidCourseCodeValue(val) {
    const s = cleanString(val);
    if (!s || s === '-') return false;
    if (/^(บาท|รวม|จำนวน|ครั้ง|ชั่วโมง|คน|กลุ่ม|หน่วยกิต)$/i.test(s)) return false;
    if (!/[A-Z0-9]{2,6}\s*\d{2,7}/i.test(s) && !/^\d{5,8}/.test(s)) return false;
    return true;
}

function isInvalidOrHeaderLecturerName(name) {
    const s = cleanString(name);
    if (!s || s === '-') return true;
    if (/^\d+(\.\d+)?$/.test(s)) return true;
    if (s.length > 65) return true;
    if (/[=()*]/.test(s) && /\d/.test(s)) return true;

    const invalidPatterns = [
        'ชื่ออาจารย์', 'ชื่อ-สกุล', 'ชื่อ-นามสกุล', 'รายชื่ออาจารย์',
        'อาจารย์ประจำร่วมสอน', 'อาจารย์ประจำ', 'อาจารย์พิเศษ',
        'รวมทั้งสิ้น', 'รวมทั้งหมด', 'รวมประมาณการ', 'ค่าสอนทั้งสิ้น',
        'รวมค่าสอน', 'รวมเป็นเงิน', 'จำนวนเงิน', 'หมายเหตุ', 'ลำดับ', 'รายการ',
        'การคิดพันธกิจ', 'อัตราค่าตอบแทน', 'ชั่วโมงสอน', 'ครูปฏิบัติการ',
        'เกณฑ์การคิด', 'หน่วยกิตชั่วโมง', 'บาท', 'ครั้งสอน'
    ];
    return invalidPatterns.some(p => s.includes(p));
}

function classifyLecturerStatus(texts = []) {
    const joined = texts.map(t => cleanString(t)).filter(Boolean).join(' ');
    if (!joined) return 'UNKNOWN';

    if (
        joined.includes('เป็นอ.พิเศษ') ||
        joined.includes('เป็นอาจารย์พิเศษ') ||
        joined.includes('อาจารย์พิเศษ') ||
        /(?:^|\s)อ\.พิเศษ(?:\s|$)/.test(joined)
    ) {
        return 'SPECIAL';
    }

    if (
        joined.includes('อาจารย์ประจำร่วมสอน') ||
        joined.includes('อาจารย์ประจำ') ||
        joined.includes('พนักงานมหาวิทยาลัย') ||
        joined.includes('ข้าราชการ') ||
        /(?:^|\s)อ\.ประจำ(?:\s|$)/.test(joined)
    ) {
        return 'REGULAR';
    }

    return 'UNKNOWN';
}

function isInvalidCourseTitleValue(val) {
    const s = cleanString(val);
    if (!s || s === '-') return true;
    if (/^\d{1,3}(\.\d+)?$/.test(s)) return true;
    if (/^\/?\s*[A-Z]{2,5}\s*\d{2,7}(\s*\/\s*[A-Z]{2,5}\s*\d{2,7})*$/i.test(s)) return true;
    if (/^\d+\(\d+-\d+-\d+\)$/.test(s)) return true;
    if (/^(?:T\+)?[LA]\d{2,4}(\s*\/\s*[LA]\d{2,4})*$/i.test(s)) return true;
    if (/^T\d{2,4}(\s*\/\s*[LA]\d{2,4})*$/i.test(s)) return true;

    const nonCourseKeywords = [
        'อาจารย์พิเศษ', 'อาจารย์ประจำ', 'อาจารย์ประจำร่วมสอน', 'ผู้สอน',
        'วิชาปกติ', 'วิชาเลือก', 'วิชาบังคับ', 'บรรยาย', 'ปฏิบัติ',
        'ชื่อวิชา', 'ชื่อรายวิชา', 'รหัสวิชา', 'หมายเหตุ',
        'คุณวุฒิ', 'ป.ตรี', 'ป.โท', 'ป.เอก', 'ปริญญา',
        'edoc', 'คนท.', 'ลาออก', 'เป็นอ.พิเศษ', '(ใหม่', 'ใหม่ 2/', 'ใหม่ 1/',
        'ร่วมสอนกับ', 'สอนร่วมกับ', 'ครั้งสอน', 'อัตราค่าตอบแทน', 'บาท', 'รวมประมาณการ'
    ];
    return nonCourseKeywords.some(lbl => s.toLowerCase().includes(lbl.toLowerCase()));
}

/**
 * สร้างแผนที่จับคู่ "รหัสวิชา -> ชื่อวิชา" จากฐานข้อมูลอาจารย์พิเศษและรายการพันธกิจที่มีชื่อวิชาจริง
 */
function buildCourseTitleCatalog() {
    const map = new Map();

    const addEntry = (rawCode, rawTitle) => {
        const title = cleanString(rawTitle);
        if (isInvalidCourseTitleValue(title)) return;

        const codeStr = cleanString(rawCode).toUpperCase();
        if (!codeStr || codeStr === '-') return;

        const fullNorm = codeStr.replace(/\s+/g, '');
        if (!map.has(fullNorm)) {
            map.set(fullNorm, title);
        }

        // เก็บแยกแต่ละรหัสย่อยด้วย (กรณีรหัสเรียนร่วม เช่น FDM23467/ FDM206)
        codeStr.split('/').forEach(part => {
            const pNorm = part.replace(/\s+/g, '');
            if (pNorm && !map.has(pNorm)) {
                map.set(pNorm, title);
            }
        });
    };

    STATE.rawLecturerData.forEach(d => addEntry(d.courseCode, d.courseName));
    STATE.rawMissionData.forEach(m => addEntry(m.courseCode, m.courseName));

    return map;
}

/**
 * ค้นหาชื่อวิชาจากรหัสวิชาในแค็ตตาล็อก (คืนค่า '-' หากไม่พบ)
 */
function lookupCourseTitleByCode(courseCode, catalog) {
    if (!catalog || catalog.size === 0) return '-';
    const codeStr = cleanString(courseCode).toUpperCase();
    if (!codeStr || codeStr === '-') return '-';

    const fullNorm = codeStr.replace(/\s+/g, '');
    if (catalog.has(fullNorm)) {
        return catalog.get(fullNorm);
    }

    const parts = codeStr.split('/').map(p => p.replace(/\s+/g, '')).filter(Boolean);
    const foundTitles = [];
    parts.forEach(p => {
        if (catalog.has(p)) {
            const t = catalog.get(p);
            if (!foundTitles.includes(t)) foundTitles.push(t);
        }
    });

    return foundTitles.length > 0 ? foundTitles.join(' / ') : '-';
}

/**
 * เติมชื่อวิชาให้กับรายการพันธกิจที่ยังเป็น '-' โดยเทียบจากรหัสวิชาในระบบ
 */
function hydrateMissionCourseTitles() {
    if (!STATE.rawMissionData || STATE.rawMissionData.length === 0) return;
    const catalog = buildCourseTitleCatalog();
    STATE.rawMissionData.forEach(item => {
        if (!item.courseName || item.courseName === '-' || isInvalidCourseTitleValue(item.courseName)) {
            const resolved = lookupCourseTitleByCode(item.courseCode, catalog);
            item.courseName = resolved || '-';
        }
    });
}

function parseTheoryLabSections(rawSection) {
    const s = cleanString(rawSection);
    if (!s || s === '-') {
        return { theory: '-', lab: '-' };
    }

    const tlMatch = s.match(/^T\s*\+\s*L\s*(\d+)(?:\s*\/\s*(.+))?$/i);
    if (tlMatch) {
        const num = tlMatch[1];
        const coPart = tlMatch[2] ? `/ ${cleanString(tlMatch[2])}` : '';
        return {
            theory: `T${num}${coPart}`,
            lab: `L${num}${coPart}`
        };
    }

    if (/^T\s*\d+/i.test(s)) {
        return {
            theory: s.replace(/\s*\/\s*/g, '/ '),
            lab: '-'
        };
    }

    if (/^L\s*\d+/i.test(s)) {
        return {
            theory: '-',
            lab: s.replace(/\s*\/\s*/g, '/ ')
        };
    }

    return {
        theory: s.replace(/\s*\/\s*/g, '/ '),
        lab: '-'
    };
}

function extractCoLecturerNote(rowTexts = []) {
    for (const raw of rowTexts) {
        const txt = cleanString(raw);
        if (!txt) continue;
        const match = txt.match(/((?:ร่วมสอนกับ|สอนร่วมกับ|ร่วมสอนโดย|สอนร่วมโดย)\s*[^\n\r|;]+?)(?=\s*(?:จำนวน\s*\d+|อัตรา|หมายเหตุ|$))/i);
        if (match && match[1]) {
            return cleanString(match[1]);
        }
    }
    return '';
}

function isCoTeachingCourse(courseCode, section, rawType = '') {
    const codeStr = cleanString(courseCode);
    const secStr = cleanString(section);
    const typeStr = cleanString(rawType);
    if (typeStr.includes('เรียนร่วม')) return true;
    if (codeStr.includes('/')) return true;
    if (secStr.includes('/')) return true;
    return false;
}

function resolveFacultyMissionLink({ facultyName = '', courseCode = '', remark = '', sheetName = '' }) {
    const combinedText = `${facultyName} ${courseCode} ${remark} ${sheetName}`.toLowerCase();
    for (const item of FACULTY_MISSION_LINKS) {
        if (item.keywords.some(kw => combinedText.includes(kw))) {
            return {
                facultyLabel: item.facultyName,
                url: item.url
            };
        }
    }
    return {
        facultyLabel: facultyName || sheetName || '',
        url: ''
    };
}

function parseTermAndYear(semVal, yearVal, sheetName = '') {
    let parsedYear = null;
    let parsedSem = null;

    if (semVal instanceof Date && !isNaN(semVal)) {
        const d = new Date(semVal.getTime() + 12 * 3600 * 1000);
        const y = d.getUTCFullYear();
        const m = d.getUTCMonth() + 1;
        parsedYear = y < 2400 ? String(y + 543) : String(y);
        if (m === 2) parsedSem = '2';
        else if (m === 3) parsedSem = 'S';
        else parsedSem = '1';
    }

    const sStr = cleanString(semVal).toLowerCase();
    if (!parsedSem && sStr) {
        const isoMatch = sStr.match(/^(25[67]\d)-0?([123])-/);
        if (isoMatch) {
            parsedYear = isoMatch[1];
            parsedSem = isoMatch[2] === '3' ? 'S' : isoMatch[2];
        } else if (sStr.includes('/')) {
            const parts = sStr.split('/');
            const left = parts[0].trim();
            const right = parts[1].trim();
            if (left.includes('s') || left.includes('sum') || left === '3') parsedSem = 'S';
            else if (left === '2') parsedSem = '2';
            else parsedSem = '1';

            const yMatch = right.match(/(25[67]\d)/) || right.match(/^([67]\d)$/);
            if (yMatch) parsedYear = yMatch[1].length === 2 ? '25' + yMatch[1] : yMatch[1];
        } else {
            if (sStr === 's' || sStr.includes('sum') || sStr.includes('ฤดูร้อน') || sStr === '3') parsedSem = 'S';
            else if (sStr === '2' || sStr.includes('ภาค 2') || sStr.includes('2nd')) parsedSem = '2';
            else parsedSem = '1';
        }
    }

    if (!parsedYear) {
        const ySource = `${cleanString(yearVal)} ${cleanString(sheetName)}`;
        const beMatch = ySource.match(/25[67]\d/);
        if (beMatch) parsedYear = beMatch[0];
        else {
            const adMatch = ySource.match(/20[23]\d/);
            if (adMatch) parsedYear = String(parseInt(adMatch[0], 10) + 543);
            else {
                const shortMatch = ySource.match(/(?:^|\D)([67]\d)(?:\D|$)/);
                if (shortMatch) parsedYear = '25' + shortMatch[1];
            }
        }
    }

    return {
        year: parsedYear || 'ไม่ระบุปี',
        semester: parsedSem || '1'
    };
}

function cleanDegree(val) {
    const str = cleanString(val);
    if (!str) return 'ไม่ระบุคุณวุฒิ';

    const compact = str.replace(/\s+/g, '');
    const explicitUnknownValues = [
        '-', '–', '—', 'null', 'undefined', 'n/a', 'na', 'none',
        'ไม่ระบุ', 'ไม่ระบุคุณวุฒิ', 'ไม่ทราบ', 'ไม่ทราบคุณวุฒิ', 'ไม่มีข้อมูล', 'ว่าง'
    ];
    if (explicitUnknownValues.includes(compact.toLowerCase()) || explicitUnknownValues.includes(str.toLowerCase())) {
        return 'ไม่ระบุคุณวุฒิ';
    }

    if (str.includes('เอก') || str.includes('ดร.') || /ph\.?d/i.test(str) || /doctor/i.test(str)) return 'ปริญญาเอก';
    if (str.includes('โท') || str.includes('มหาบัณฑิต') || /master/i.test(str)) return 'ปริญญาโท';
    if (str.includes('ตรี') || str.includes('บัณฑิต') || /bachelor/i.test(str)) return 'ปริญญาตรี';
    return 'ไม่ระบุคุณวุฒิ';
}

function getDistinctLecturers(dataList) {
    const uniqueLecturerSet = new Set();
    dataList.forEach(item => {
        const cleanedName = cleanString(item.lecturerName);
        if (cleanedName && cleanedName !== '-' && cleanedName !== 'ไม่ระบุ') {
            uniqueLecturerSet.add(cleanedName);
        }
    });
    return Array.from(uniqueLecturerSet);
}

function normalizeCourseKey(courseCode, courseName = '') {
    const codeClean = cleanString(courseCode)
        .toUpperCase()
        .replace(/\s*\/\s*/g, ' / ');
    if (codeClean && codeClean !== '-') {
        return codeClean;
    }
    const nameClean = cleanString(courseName);
    return nameClean ? `NO_CODE::${nameClean}` : '';
}

function countDistinctCourses(dataList) {
    const courseSet = new Set();
    dataList.forEach(item => {
        const key = normalizeCourseKey(item.courseCode, item.courseName);
        if (key) courseSet.add(key);
    });
    return courseSet.size;
}

/* ==========================================================================
   4. EXCEL FILE PROCESSING (LECTURER & MISSION)
   ========================================================================== */
function handleLecturerExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            
            STATE.rawLecturerData = [];
            STATE.activeFaculty = 'ALL';
            STATE.selectedMajorFilter = 'ALL';
            STATE.rosterPage = 1;

            let targetSheets = [];
            if (workbook.SheetNames.includes('ข้อมูลอาจารย์ 3 ปี')) {
                targetSheets = ['ข้อมูลอาจารย์ 3 ปี'];
            } else {
                targetSheets = workbook.SheetNames.filter(name =>
                    !name.includes('สรุป') &&
                    !name.includes('Pivot') &&
                    !name.includes('รอลบ')
                );
            }

            targetSheets.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                if (!aoa || aoa.length === 0) return;

                let headerRowIdx = 0;
                for (let i = 0; i < Math.min(10, aoa.length); i++) {
                    const rowStr = aoa[i].join(' ');
                    if (rowStr.includes('ชื่อ-สกุล') || rowStr.includes('อาจารย์ผู้สอน') || rowStr.includes('คณะ')) {
                        headerRowIdx = i;
                        break;
                    }
                }

                const headers = aoa[headerRowIdx].map(h => cleanString(h));
                for (let r = headerRowIdx + 1; r < aoa.length; r++) {
                    const rowArr = aoa[r];
                    if (!rowArr || rowArr.length === 0) continue;

                    const rowObj = {};
                    headers.forEach((h, idx) => {
                        if (h) rowObj[h] = rowArr[idx];
                    });

                    const statusColVal = cleanString(getColValue(rowObj, ['ประเภทอาจารย์', 'สถานะ', 'ประเภทบุคลากร', 'ประเภท'], ['วิชา']));
                    if (classifyLecturerStatus([statusColVal]) === 'REGULAR') continue;

                    const lecturerName = cleanString(getColValue(rowObj, ['ชื่อ-สกุล', 'ชื่อ-นามสกุล', 'อาจารย์ผู้สอน', 'ชื่ออาจารย์'], ['ลำดับ', 'ที่']));
                    if (!lecturerName || lecturerName === '-' || lecturerName === 'ชื่อ-สกุล') continue;

                    const faculty = cleanString(getColValue(rowObj, ['คณะ/วิทยาลัย', 'คณะ', 'หน่วยงาน'])) || 'ไม่ระบุคณะ';
                    const major = cleanString(getColValue(rowObj, ['สาขาวิชา', 'สาขา'])) || 'ไม่ระบุสาขาวิชา';
                    const courseCode = cleanString(getColValue(rowObj, ['รหัสวิชา', 'Course Code']));
                    const courseName = cleanString(getColValue(rowObj, ['ชื่อวิชา', 'รายวิชา', 'Course Title']));

                    const rawSemCol = getColValue(rowObj, ['ภาคการศึกษา', 'ภาคเรียน', 'เทอม']);
                    const rawYearCol = getColValue(rowObj, ['ปีการศึกษา', 'ปี พ.ศ.', 'ปี']);
                    const { year, semester } = parseTermAndYear(rawSemCol, rawYearCol, sheetName);

                    const degree = cleanDegree(getColValue(rowObj, ['คุณวุฒิ', 'วุฒิการศึกษา', 'ระดับคุณวุฒิ']));
                    const creditRaw = cleanString(getColValue(rowObj, ['หน่วยกิต', 'Credit']));
                    const credit = parseFloat(creditRaw) || 0;
                    let org = cleanString(getColValue(rowObj, ['ชื่อหน่วยงาน', 'หน่วยงาน/สังกัด', 'สถานที่ทำงาน', 'สังกัด']));

                    if (STATE.customOrgMap[lecturerName]) {
                        org = STATE.customOrgMap[lecturerName];
                    }

                    STATE.rawLecturerData.push({
                        id: Math.random().toString(36).substring(2, 11),
                        lecturerName,
                        faculty,
                        major,
                        courseCode,
                        courseName,
                        year,
                        semester,
                        degree,
                        credit,
                        org: org || 'ไม่ระบุสังกัด'
                    });
                }
            });

            event.target.value = '';

            if (STATE.rawLecturerData.length > 0) {
                document.getElementById('data-empty-notice')?.classList.add('hidden');
                document.getElementById('btn-export-csv')?.classList.remove('hidden');
                hydrateMissionCourseTitles();
                populateFacultyDropdown();
                applyGlobalFilters();
                handleLecturerSearch();
                alert(`นำเข้าข้อมูลอาจารย์พิเศษสำเร็จ ${STATE.rawLecturerData.length.toLocaleString()} รายการสอน (${getDistinctLecturers(STATE.rawLecturerData).length.toLocaleString()} คนไม่ซ้ำ)`);
            } else {
                alert('ไม่พบข้อมูลอาจารย์พิเศษในไฟล์ Excel กรุณาตรวจสอบรูปแบบคอลัมน์');
            }
        } catch (err) {
            console.error(err);
            alert('เกิดข้อผิดพลาดในการอ่านไฟล์ Excel อาจารย์พิเศษ');
        }
    };
    reader.readAsArrayBuffer(file);
}

/**
 * อ่านไฟล์ประมาณการพันธกิจ:
 * - เอาเฉพาะอาจารย์พิเศษเท่านั้น (ตัดอาจารย์ประจำ และอาจารย์ประจำร่วมสอนออกทั้งหมด)
 * - ตัดแถวสรุปยอดท้ายตาราง (เช่น "รวมประมาณการค่าสอนทั้งสิ้น จำนวน", "บาท") ออกทั้งหมด
 * - ช่อง "ชื่อวิชา" อ่านจากคอลัมน์ชื่อวิชาในไฟล์ และหากไม่มีในไฟล์จะเทียบจากรหัสวิชาในระบบมาแสดงให้ (ถ้าไม่มีเลยแสดง "-")
 * - แยกกลุ่มเรียนเป็น "กลุ่มทฤษฎี (T)" และ "กลุ่มปฏิบัติ (L)"
 */
function handleMissionExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            
            STATE.rawMissionData = [];
            const recordMap = new Map();
            const facultyMissionLinkLookup = new Map();

            const knownSpecialLecturerSet = new Set(
                STATE.rawLecturerData.map(d => stripAcademicPrefix(d.lecturerName)).filter(Boolean)
            );

            const sheetLinkMap = new Map();
            workbook.SheetNames.forEach(sName => {
                const ws = workbook.Sheets[sName];
                if (!ws) return;
                const aoaTmp = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

                Object.keys(ws).forEach(addr => {
                    if (addr.startsWith('!')) return;
                    const cell = ws[addr];
                    const cellText = cleanString(cell?.v);
                    const hyperlinkTarget = cell?.l?.Target ? cleanString(cell.l.Target) : '';
                    const urlInTextMatch = cellText.match(/https?:\/\/[^\s)]+/i);
                    const foundUrl = hyperlinkTarget || (urlInTextMatch ? urlInTextMatch[0] : '');

                    if (foundUrl && /^https?:\/\//i.test(foundUrl)) {
                        if (!sheetLinkMap.has(sName)) {
                            sheetLinkMap.set(sName, foundUrl);
                        }
                        const decoded = XLSX.utils.decode_cell(addr);
                        const rowVals = aoaTmp[decoded.r] || [];
                        rowVals.forEach(rv => {
                            const txt = cleanString(rv);
                            if (txt && !/^https?:\/\//i.test(txt)) {
                                if (txt.includes('คณะ') || txt.includes('วิทยาลัย') || txt.includes('สาขา') || /\([A-Z]{2,5}\)/.test(txt)) {
                                    facultyMissionLinkLookup.set(normalizeSearchText(txt), foundUrl);
                                    const codeParen = txt.match(/\(([A-Z]{2,5})\)/);
                                    if (codeParen) {
                                        facultyMissionLinkLookup.set(codeParen[1].toLowerCase(), foundUrl);
                                    }
                                }
                            }
                        });
                    }
                });
            });

            const validSheets = workbook.SheetNames.filter(name =>
                !name.includes('Pivot') && !name.includes('รอลบ')
            );

            validSheets.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                if (!aoa || aoa.length === 0) return;

                let headerRowIdx = -1;
                let bestScore = 0;
                const headerSignals = ['ชื่อ', 'อาจารย์', 'ผู้สอน', 'รหัส', 'วิชา', 'หน่วยกิต', 'กลุ่ม', 'ประเภท', 'หมายเหตุ', 'ลำดับ'];

                for (let i = 0; i < Math.min(50, aoa.length); i++) {
                    const rowCells = aoa[i].map(c => cleanString(c));
                    const nonEmptyCells = rowCells.filter(Boolean);
                    if (nonEmptyCells.length < 2) continue;

                    let score = 0;
                    rowCells.forEach(cell => {
                        if (cell.length <= 40 && headerSignals.some(sig => cell.includes(sig))) {
                            score += 1;
                        }
                    });

                    if (score > bestScore && score >= 2) {
                        bestScore = score;
                        headerRowIdx = i;
                    }
                }

                if (headerRowIdx === -1) return;

                let dataStartRowIdx = headerRowIdx + 1;
                const row1 = aoa[headerRowIdx].map(h => cleanString(h));
                const row2 = (headerRowIdx + 1 < aoa.length) ? aoa[headerRowIdx + 1].map(h => cleanString(h)) : [];
                const row2HasSubHeaders = row2.some(c =>
                    ['รหัส', 'ชื่อวิชา', 'ชื่อรายวิชา', 'บรรยาย', 'ปฏิบัติ', 'กลุ่ม', 'หน่วยกิต', 'ทฤษฎี'].some(k => c.includes(k))
                ) && !row2.some(c => /[A-Z]{2,4}\d{3,6}/i.test(c));

                const maxCols = Math.max(row1.length, row2.length);
                const combinedHeaders = [];
                let lastTopHeader = '';
                for (let c = 0; c < maxCols; c++) {
                    const top = row1[c] || '';
                    if (top) lastTopHeader = top;
                    const sub = row2HasSubHeaders ? (row2[c] || '') : '';
                    if (row2HasSubHeaders && sub) {
                        combinedHeaders.push(top && top !== sub ? `${top} ${sub}` : (sub || lastTopHeader));
                    } else {
                        combinedHeaders.push(top);
                    }
                }
                if (row2HasSubHeaders) {
                    dataStartRowIdx = headerRowIdx + 2;
                }

                const findColIdx = (priorityKeywords, excludeKeywords = [], excludeIndices = []) => {
                    for (const kw of priorityKeywords) {
                        const idx = combinedHeaders.findIndex((h, i) =>
                            !excludeIndices.includes(i) &&
                            h === kw &&
                            !excludeKeywords.some(ex => h.includes(ex))
                        );
                        if (idx !== -1) return idx;
                    }
                    for (const kw of priorityKeywords) {
                        const idx = combinedHeaders.findIndex((h, i) =>
                            !excludeIndices.includes(i) &&
                            h.includes(kw) &&
                            !excludeKeywords.some(ex => h.includes(ex))
                        );
                        if (idx !== -1) return idx;
                    }
                    return -1;
                };

                let nameColIdx = findColIdx(
                    ['ชื่อ-สกุล', 'ชื่อ-นามสกุล', 'ชื่ออาจารย์', 'อาจารย์ผู้สอน', 'รายชื่ออาจารย์', 'ผู้รับผิดชอบ', 'ผู้สอน', 'อาจารย์', 'ชื่อ', 'Lecturer'],
                    ['ลำดับ', 'ที่', 'ประเภท', 'วิชา', 'คณะ', 'สาขา', 'หลักสูตร']
                );
                let codeColIdx = findColIdx(
                    ['รหัสวิชา', 'รหัสรายวิชา', 'รหัส', 'Course Code', 'Code'],
                    ['ชื่อ', 'หลักสูตร'],
                    [nameColIdx]
                );
                let courseNameColIdx = findColIdx(
                    ['ชื่อรายวิชา', 'ชื่อวิชา', 'รายวิชา', 'Course Title', 'Title'],
                    ['รหัส', 'ประเภท', 'ลักษณะ', 'อาจารย์', 'สกุล', 'หมายเหตุ', 'คุณวุฒิ'],
                    [nameColIdx, codeColIdx]
                );

                const sampleRows = aoa.slice(dataStartRowIdx, dataStartRowIdx + 25);
                for (let c = 0; c < maxCols; c++) {
                    const colValues = sampleRows.map(r => cleanString(r[c])).filter(Boolean);
                    if (codeColIdx === -1 && colValues.some(v => /^[A-Z]{2,4}\s*\d{3,6}/i.test(v))) {
                        codeColIdx = c;
                    }
                    if (nameColIdx === -1 && colValues.some(v => /^(อ\.|ผศ\.|รศ\.|ศ\.|ดร\.|ว่าที่|นาย|นาง|นางสาว)/.test(v))) {
                        nameColIdx = c;
                    }
                }

                let codeExtColIdx = -1;
                if (codeColIdx !== -1 && codeColIdx + 1 < maxCols) {
                    const nextColVals = sampleRows.map(r => cleanString(r[codeColIdx + 1])).filter(Boolean);
                    const looksLikeCodeExtension = nextColVals.length > 0 && nextColVals.every(v =>
                        /^\d{1,2}$/.test(v) || /^\/?\s*[A-Z]{2,5}\s*\d{2,7}/i.test(v)
                    );
                    if (looksLikeCodeExtension) {
                        codeExtColIdx = codeColIdx + 1;
                    }
                }

                const excludeBase = [nameColIdx, codeColIdx, codeExtColIdx, courseNameColIdx].filter(i => i !== -1);
                const lecturerStatusColIdx = findColIdx(['ประเภทอาจารย์', 'สถานะอาจารย์', 'สถานะผู้สอน', 'สถานะ', 'สังกัด'], ['วิชา'], excludeBase);
                const typeColIdx = findColIdx(['ประเภทวิชา', 'ลักษณะวิชา', 'ประเภท', 'Type'], ['อาจารย์'], excludeBase);
                const creditColIdx = findColIdx(['หน่วยกิต', 'จำนวนหน่วยกิต', 'Credit'], [], excludeBase);
                const sectionColIdx = findColIdx(['กลุ่มเรียน', 'หมู่เรียน', 'จำนวนกลุ่ม', 'กลุ่ม', 'Section', 'Sec'], [], excludeBase);
                const remarkColIdx = findColIdx(['หมายเหตุ', 'ลิงก์', 'ลิงค์', 'รายละเอียด', 'คำอธิบาย', 'Remark', 'Link'], [], excludeBase);
                const facultyColIdx = findColIdx(['คณะ', 'คณะ/วิทยาลัย', 'หน่วยงาน', 'สาขา', 'Faculty'], [], excludeBase);

                const hasStatusColumnInSheet = aoa.slice(dataStartRowIdx, dataStartRowIdx + 60).some(r => {
                    const rowStatus = classifyLecturerStatus(r.map(c => cleanString(c)));
                    return rowStatus === 'SPECIAL' || rowStatus === 'REGULAR';
                });

                let lastValidLecturer = '';
                let lastValidLecturerIsSpecial = false;
                let currentSectionZone = 'UNKNOWN';

                for (let r = dataStartRowIdx; r < aoa.length; r++) {
                    const rowArr = aoa[r];
                    if (!rowArr || rowArr.length === 0) continue;

                    const rowJoined = rowArr.map(c => cleanString(c)).filter(Boolean).join(' ');
                    if (isSummaryOrFooterRow(rowJoined)) {
                        lastValidLecturer = '';
                        lastValidLecturerIsSpecial = false;
                        continue;
                    }

                    const rawCodeCell = codeColIdx !== -1 ? cleanString(rowArr[codeColIdx]) : '';

                    if (!rawCodeCell && (rowJoined.includes('อาจารย์ประจำ') || rowJoined.includes('อาจารย์พิเศษ'))) {
                        const zoneStatus = classifyLecturerStatus([rowJoined]);
                        if (zoneStatus === 'REGULAR' || zoneStatus === 'SPECIAL') {
                            currentSectionZone = zoneStatus;
                        }
                        lastValidLecturer = '';
                        lastValidLecturerIsSpecial = false;
                        continue;
                    }

                    const rawNameVal = nameColIdx !== -1 ? cleanString(rowArr[nameColIdx]) : '';
                    let courseCode = rawCodeCell;
                    const codeExt = codeExtColIdx !== -1 ? cleanString(rowArr[codeExtColIdx]) : '';

                    if (courseCode && courseCode !== '-' && codeExt && codeExt !== '-') {
                        if (/^\d{1,2}$/.test(codeExt)) {
                            courseCode = `${courseCode}${codeExt}`;
                        } else if (/^\/?\s*[A-Z]{2,5}\s*\d{2,7}/i.test(codeExt)) {
                            const normalizedExt = codeExt.startsWith('/') ? codeExt : `/ ${codeExt}`;
                            courseCode = `${courseCode}${normalizedExt}`.replace(/\s*\/\s*/g, '/ ');
                        }
                    }

                    let courseName = (courseNameColIdx !== -1 && courseNameColIdx !== codeColIdx && courseNameColIdx !== codeExtColIdx)
                        ? cleanString(rowArr[courseNameColIdx])
                        : '';

                    if (isInvalidCourseTitleValue(courseName)) {
                        courseName = '';
                    }

                    if (courseCode && !courseName) {
                        const splitMatch = courseCode.match(/^([A-Z]{2,4}\s*\d{3,7}(?:\s*\/\s*[A-Z]{2,4}\s*\d{3,7})?)\s*[-:]?\s*(.+)$/i);
                        if (splitMatch && !isInvalidCourseTitleValue(splitMatch[2])) {
                            courseCode = splitMatch[1].trim();
                            courseName = splitMatch[2].trim();
                        }
                    }

                    const hasValidCode = isValidCourseCodeValue(courseCode);
                    if (!hasValidCode) {
                        lastValidLecturer = '';
                        lastValidLecturerIsSpecial = false;
                        continue;
                    }

                    const statusColVal = lecturerStatusColIdx !== -1 ? cleanString(rowArr[lecturerStatusColIdx]) : '';
                    const rowStatus = classifyLecturerStatus([statusColVal, ...rowArr]);

                    let lecturerName = rawNameVal;
                    let isSpecialLecturer = false;

                    if (isInvalidOrHeaderLecturerName(lecturerName)) {
                        if (!rawNameVal && hasValidCode && lastValidLecturer) {
                            lecturerName = lastValidLecturer;
                            isSpecialLecturer = (rowStatus === 'REGULAR') ? false : lastValidLecturerIsSpecial;
                        } else {
                            lastValidLecturer = '';
                            lastValidLecturerIsSpecial = false;
                            continue;
                        }
                    } else {
                        if (rowStatus === 'REGULAR') {
                            isSpecialLecturer = false;
                        } else if (rowStatus === 'SPECIAL') {
                            isSpecialLecturer = true;
                        } else if (currentSectionZone === 'REGULAR') {
                            isSpecialLecturer = false;
                        } else if (currentSectionZone === 'SPECIAL') {
                            isSpecialLecturer = true;
                        } else if (knownSpecialLecturerSet.size > 0) {
                            const stripped = stripAcademicPrefix(lecturerName);
                            isSpecialLecturer = knownSpecialLecturerSet.has(stripped);
                        } else if (!hasStatusColumnInSheet) {
                            isSpecialLecturer = true;
                        }

                        lastValidLecturer = lecturerName;
                        lastValidLecturerIsSpecial = isSpecialLecturer;
                    }

                    if (!isSpecialLecturer) {
                        continue;
                    }

                    const rawType = typeColIdx !== -1 ? cleanString(rowArr[typeColIdx]) : '';
                    const credit = creditColIdx !== -1 ? cleanString(rowArr[creditColIdx]) : '';
                    const section = sectionColIdx !== -1 ? cleanString(rowArr[sectionColIdx]) : '';
                    const rowFaculty = facultyColIdx !== -1 ? cleanString(rowArr[facultyColIdx]) : '';

                    const { theory: theorySection, lab: labSection } = parseTheoryLabSections(section);

                    const rawRemark = remarkColIdx !== -1 ? cleanString(rowArr[remarkColIdx]) : '';
                    const coLecturerNote = extractCoLecturerNote([rawRemark, ...rowArr]);

                    const isCoTeaching = isCoTeachingCourse(courseCode, section, rawType);
                    const finalCourseType = isCoTeaching ? 'วิชาเรียนร่วม' : (rawType || 'วิชาปกติ');

                    let missionLink = '';
                    if (remarkColIdx !== -1) {
                        const remarkCellAddr = XLSX.utils.encode_cell({ r, c: remarkColIdx });
                        const remarkCellObj = sheet[remarkCellAddr];
                        if (remarkCellObj?.l?.Target && /^https?:\/\//i.test(remarkCellObj.l.Target)) {
                            missionLink = cleanString(remarkCellObj.l.Target);
                        }
                    }

                    if (!missionLink) {
                        const urlMatch = rawRemark.match(/https?:\/\/[^\s)]+/i);
                        if (urlMatch) {
                            missionLink = urlMatch[0];
                        } else {
                            for (let c = 0; c < rowArr.length; c++) {
                                const cAddr = XLSX.utils.encode_cell({ r, c });
                                const cObj = sheet[cAddr];
                                if (cObj?.l?.Target && /^https?:\/\//i.test(cObj.l.Target)) {
                                    missionLink = cleanString(cObj.l.Target);
                                    break;
                                }
                                const vStr = cleanString(rowArr[c]);
                                const mUrl = vStr.match(/https?:\/\/[^\s)]+/i);
                                if (mUrl) {
                                    missionLink = mUrl[0];
                                    break;
                                }
                            }
                        }
                    }

                    let matchedFacultyName = rowFaculty;
                    if (!matchedFacultyName && lecturerName) {
                        const foundLect = STATE.rawLecturerData.find(d =>
                            stripAcademicPrefix(d.lecturerName) === stripAcademicPrefix(lecturerName)
                        );
                        if (foundLect) matchedFacultyName = foundLect.faculty;
                    }

                    const mappedFacultyLink = resolveFacultyMissionLink({
                        facultyName: matchedFacultyName,
                        courseCode,
                        remark: rawRemark,
                        sheetName
                    });

                    if (!missionLink) {
                        if (mappedFacultyLink.url) {
                            missionLink = mappedFacultyLink.url;
                        } else {
                            const checkContext = `${rowFaculty} ${rawRemark} ${sheetName}`;
                            const parenMatch = checkContext.match(/\(([A-Z]{2,5})\)/);
                            if (parenMatch && facultyMissionLinkLookup.has(parenMatch[1].toLowerCase())) {
                                missionLink = facultyMissionLinkLookup.get(parenMatch[1].toLowerCase());
                            } else if (rowFaculty && facultyMissionLinkLookup.has(normalizeSearchText(rowFaculty))) {
                                missionLink = facultyMissionLinkLookup.get(normalizeSearchText(rowFaculty));
                            } else if (sheetLinkMap.has(sheetName)) {
                                missionLink = sheetLinkMap.get(sheetName);
                            }
                        }
                    }

                    const finalFacultyName = mappedFacultyLink.facultyLabel || matchedFacultyName || sheetName;

                    const newRecord = {
                        lecturerName: lecturerName || '-',
                        coLecturerNote: coLecturerNote || '',
                        courseCode: courseCode.replace(/\s*\/\s*/g, '/ '),
                        courseName: courseName || '-',
                        type: finalCourseType,
                        isCoTeaching,
                        credit: credit || '-',
                        section: section || '-',
                        theorySection,
                        labSection,
                        missionLink: missionLink || '',
                        facultyName: finalFacultyName
                    };

                    const normLect = stripAcademicPrefix(newRecord.lecturerName) || normalizeSearchText(newRecord.lecturerName);
                    const normSec = normalizeSearchText(newRecord.section);
                    const normCred = normalizeSearchText(newRecord.credit);
                    const normCode = normalizeSearchText(newRecord.courseCode);

                    const dedupKey = (normSec && normSec !== '-')
                        ? `${normLect}||SEC:${normSec}||CRED:${normCred}`
                        : `${normLect}||CODE:${normCode}||CRED:${normCred}`;

                    if (recordMap.has(dedupKey)) {
                        const existing = recordMap.get(dedupKey);
                        if (newRecord.courseCode.length > existing.courseCode.length && newRecord.courseCode !== '-') {
                            existing.courseCode = newRecord.courseCode;
                        }
                        if (existing.courseName === '-' && newRecord.courseName !== '-') {
                            existing.courseName = newRecord.courseName;
                        }
                        if (!existing.coLecturerNote && newRecord.coLecturerNote) {
                            existing.coLecturerNote = newRecord.coLecturerNote;
                        }
                        if (newRecord.isCoTeaching) {
                            existing.isCoTeaching = true;
                            existing.type = 'วิชาเรียนร่วม';
                        }
                        if (!existing.missionLink && newRecord.missionLink) {
                            existing.missionLink = newRecord.missionLink;
                        }
                        if (!existing.facultyName && newRecord.facultyName) {
                            existing.facultyName = newRecord.facultyName;
                        }
                    } else {
                        recordMap.set(dedupKey, newRecord);
                    }
                }
            });

            STATE.rawMissionData = Array.from(recordMap.values()).map((rec, idx) => ({
                no: idx + 1,
                ...rec
            }));

            // เติมชื่อวิชาจากฐานข้อมูลอาจารย์พิเศษและแผ่นงานอื่นให้ตรงตามรหัสวิชา
            hydrateMissionCourseTitles();

            event.target.value = '';

            updateFilterStatusBadges();
            handleLecturerSearch();

            if (STATE.rawMissionData.length > 0) {
                alert(`นำเข้าข้อมูลประมาณการพันธกิจ (เฉพาะอาจารย์พิเศษ) สำเร็จ ${STATE.rawMissionData.length.toLocaleString()} รายการ`);
            } else {
                alert('ไม่พบข้อมูลอาจารย์พิเศษในไฟล์ประมาณการพันธกิจ กรุณาตรวจสอบข้อมูลในไฟล์');
            }
        } catch (err) {
            console.error(err);
            alert('เกิดข้อผิดพลาดในการอ่านไฟล์ประมาณการพันธกิจ');
        }
    };
    reader.readAsArrayBuffer(file);
}

/* ==========================================================================
   5. GLOBAL FILTERS & MASTER DATASET RE-COMPUTATION
   ========================================================================== */
function getFilteredMasterData({ includeFaculty = true, includeMajor = true } = {}) {
    return STATE.rawLecturerData.filter(item => {
        const matchYear = (STATE.currentYearFilter === 'ALL') || (item.year === STATE.currentYearFilter);
        const matchSemester = (STATE.currentSemesterFilter === 'ALL') || (item.semester === STATE.currentSemesterFilter);
        const matchDegree = (STATE.currentDegreeFilter === 'ALL') || (cleanDegree(item.degree) === STATE.currentDegreeFilter);
        const matchFaculty = !includeFaculty || (STATE.activeFaculty === 'ALL') || (item.faculty === STATE.activeFaculty);
        const matchMajor = !includeMajor || (STATE.selectedMajorFilter === 'ALL') || (item.major === STATE.selectedMajorFilter);
        return matchYear && matchSemester && matchDegree && matchFaculty && matchMajor;
    });
}

function applyGlobalFilters() {
    STATE.filteredLecturerData = getFilteredMasterData({ includeFaculty: false, includeMajor: false });

    updateFilterStatusBadges();
    renderOverviewKPIs();
    renderOverviewCharts();
    renderOverviewTable();
    renderFacultyDegreeSummaryTable();
    renderFacultyTab();
    populateSearchYearFilter();
    handleLecturerSearch();
}

function updateFilterStatusBadges() {
    const distinctLecturers = getDistinctLecturers(STATE.filteredLecturerData);
    
    const setElemText = (id, text) => {
        const elem = document.getElementById(id);
        if (elem) elem.textContent = text;
    };

    setElemText('filter-status-rows', `${STATE.filteredLecturerData.length.toLocaleString()} รายการสอน`);
    setElemText('filter-status-lecturers', `${distinctLecturers.length.toLocaleString()} อาจารย์ (ไม่ซ้ำ)`);
    setElemText('filter-status-missions', `${STATE.rawMissionData.length.toLocaleString()} รายการพันธกิจ`);

    setElemText('pres-total-lecturers', distinctLecturers.length.toLocaleString());
    setElemText('pres-total-rows', getDistinctLecturers(STATE.filteredLecturerData.filter(d => d.degree === 'ปริญญาตรี')).length.toLocaleString());
    setElemText('pres-total-faculties', getDistinctLecturers(STATE.filteredLecturerData.filter(d => d.degree === 'ปริญญาโท')).length.toLocaleString());
    setElemText('pres-total-courses', getDistinctLecturers(STATE.filteredLecturerData.filter(d => d.degree === 'ปริญญาเอก')).length.toLocaleString());
}

/* ==========================================================================
   6. EXECUTIVE OVERVIEW (TAB 1)
   ========================================================================== */
function renderOverviewKPIs() {
    const totalDistinct = getDistinctLecturers(STATE.filteredLecturerData).length;
    const bachDistinct = getDistinctLecturers(STATE.filteredLecturerData.filter(d => d.degree === 'ปริญญาตรี')).length;
    const masterDistinct = getDistinctLecturers(STATE.filteredLecturerData.filter(d => d.degree === 'ปริญญาโท')).length;
    const docDistinct = getDistinctLecturers(STATE.filteredLecturerData.filter(d => d.degree === 'ปริญญาเอก')).length;

    const setKpiText = (id, val) => {
        const elem = document.getElementById(id);
        if (elem) elem.textContent = val.toLocaleString();
    };

    setKpiText('kpi-total-lecturers', totalDistinct);
    setKpiText('kpi-bachelor-degree', bachDistinct);
    setKpiText('kpi-master-degree', masterDistinct);
    setKpiText('kpi-doctor-degree', docDistinct);
}

function renderOverviewCharts() {
    const totalLecturers = getDistinctLecturers(STATE.filteredLecturerData).length;

    const setElemText = (id, text) => {
        const elem = document.getElementById(id);
        if (elem) elem.textContent = text;
    };

    setElemText('degree-total-headcount', totalLecturers.toLocaleString());

    const trendBaseData = STATE.rawLecturerData.filter(item => {
        const matchSemester = (STATE.currentSemesterFilter === 'ALL') || (item.semester === STATE.currentSemesterFilter);
        const matchDegree = (STATE.currentDegreeFilter === 'ALL') || (cleanDegree(item.degree) === STATE.currentDegreeFilter);
        return matchSemester && matchDegree;
    });

    const years = ['2566', '2567', '2568'];
    const yoyData = years.map(y => getDistinctLecturers(trendBaseData.filter(d => d.year === y)).length);

    const trendCanvas = document.getElementById('chart-yoy-trend');
    if (trendCanvas) {
        if (CHARTS.yoyTrend) CHARTS.yoyTrend.destroy();
        CHARTS.yoyTrend = new Chart(trendCanvas, {
            type: 'bar',
            data: {
                labels: years.map(y => `ปี ${y}`),
                datasets: [{
                    label: 'จำนวนอาจารย์พิเศษ (คนไม่ซ้ำ)',
                    data: yoyData,
                    backgroundColor: years.map(y => STATE.currentYearFilter === y ? '#C81E63' : '#234876'),
                    borderRadius: 8,
                    barThickness: 48
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` จำนวนอาจารย์: ${ctx.raw.toLocaleString()} คน` } }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#F1F5F9' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    const docCount = getDistinctLecturers(STATE.filteredLecturerData.filter(d => d.degree === 'ปริญญาเอก')).length;
    const masterCount = getDistinctLecturers(STATE.filteredLecturerData.filter(d => d.degree === 'ปริญญาโท')).length;
    const bachCount = getDistinctLecturers(STATE.filteredLecturerData.filter(d => d.degree === 'ปริญญาตรี')).length;
    const otherCount = getDistinctLecturers(
        STATE.filteredLecturerData.filter(d => cleanDegree(d.degree) === 'ไม่ระบุคุณวุฒิ')
    ).length;

    const getPct = (val) => totalLecturers > 0 ? ((val / totalLecturers) * 100).toFixed(1) : '0';

    const updateDegreeUI = (barId, countId, pctId, count) => {
        const pct = getPct(count);
        setElemText(countId, count.toLocaleString());
        setElemText(pctId, `${pct}%`);
        const bar = document.getElementById(barId);
        if (bar) {
            bar.style.width = `${pct}%`;
            bar.textContent = count > 0 ? `${pct}%` : '';
        }
    };

    updateDegreeUI('bar-degree-doc', 'stat-doc-count', 'stat-doc-pct', docCount);
    updateDegreeUI('bar-degree-master', 'stat-master-count', 'stat-master-pct', masterCount);
    updateDegreeUI('bar-degree-bach', 'stat-bach-count', 'stat-bach-pct', bachCount);
    updateDegreeUI('bar-degree-other', 'stat-other-count', 'stat-other-pct', otherCount);

    const facLecturerMap = {};
    STATE.filteredLecturerData.forEach(d => {
        if (!facLecturerMap[d.faculty]) facLecturerMap[d.faculty] = new Set();
        facLecturerMap[d.faculty].add(d.lecturerName);
    });

    const sortedFacs = Object.keys(facLecturerMap)
        .map(fac => ({ name: fac, count: facLecturerMap[fac].size }))
        .sort((a, b) => b.count - a.count);

    const horizontalCanvas = document.getElementById('chart-faculty-horizontal');
    if (horizontalCanvas) {
        if (CHARTS.facultyHorizontal) CHARTS.facultyHorizontal.destroy();
        CHARTS.facultyHorizontal = new Chart(horizontalCanvas, {
            type: 'bar',
            data: {
                labels: sortedFacs.map(f => f.name),
                datasets: [{
                    label: 'จำนวนอาจารย์พิเศษ (คน)',
                    data: sortedFacs.map(f => f.count),
                    backgroundColor: sortedFacs.map((_, i) => i === 0 ? '#C81E63' : '#234876'),
                    borderRadius: 6,
                    barThickness: 16
                }]
            },
            plugins: [chartDataLabelsPlugin],
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { right: 60 } },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` จำนวนอาจารย์: ${ctx.raw.toLocaleString()} คน` } }
                },
                scales: {
                    x: { beginAtZero: true, grid: { color: '#F1F5F9' } },
                    y: { grid: { display: false }, ticks: { font: { family: 'Sarabun', size: 11 } } }
                }
            }
        });
    }

    const sem1 = STATE.filteredLecturerData.filter(d => d.semester === '1').length;
    const sem2 = STATE.filteredLecturerData.filter(d => d.semester === '2').length;
    const semS = STATE.filteredLecturerData.filter(d => d.semester === 'S').length;

    const semCanvas = document.getElementById('chart-semester-bar');
    if (semCanvas) {
        if (CHARTS.semesterBar) CHARTS.semesterBar.destroy();
        CHARTS.semesterBar = new Chart(semCanvas, {
            type: 'bar',
            data: {
                labels: ['ภาคเรียนที่ 1', 'ภาคเรียนที่ 2', 'ภาคฤดูร้อน (Summer)'],
                datasets: [{
                    label: 'จำนวนรายการสอน',
                    data: [sem1, sem2, semS],
                    backgroundColor: ['#13233D', '#C81E63', '#CF8A22'],
                    borderRadius: 8,
                    barThickness: 65
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => ` จำนวนรายการสอน: ${ctx.raw.toLocaleString()} รายการ` } }
                },
                scales: { y: { beginAtZero: true } }
            }
        });
    }
}

function renderOverviewTable() {
    const selectedYear = document.getElementById('overview-table-year-filter')?.value || 'ALL';
    const selectedSem = document.getElementById('overview-table-semester-filter')?.value || 'ALL';

    const dataset = STATE.rawLecturerData.filter(d => {
        const mY = (selectedYear === 'ALL') || (d.year === selectedYear);
        const mS = (selectedSem === 'ALL') || (d.semester === selectedSem);
        return mY && mS;
    });

    const lecturerMap = {};
    dataset.forEach(item => {
        if (!lecturerMap[item.lecturerName]) {
            lecturerMap[item.lecturerName] = {
                name: item.lecturerName,
                count: 0,
                years: new Set(),
                semesters: new Set(),
                faculty: item.faculty,
                major: item.major,
                org: item.org
            };
        }
        lecturerMap[item.lecturerName].count += 1;
        lecturerMap[item.lecturerName].years.add(item.year);
        lecturerMap[item.lecturerName].semesters.add(item.semester);
    });

    const lecturerList = Object.values(lecturerMap).sort((a, b) => b.count - a.count);
    const badge = document.getElementById('overview-table-badge');
    if (badge) badge.textContent = `แสดง ${lecturerList.length.toLocaleString()} คน`;

    const tbody = document.getElementById('overview-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (lecturerList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">ไม่พบข้อมูลตามเงื่อนไขตัวกรองในตาราง</td></tr>`;
        return;
    }

    lecturerList.forEach((l, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition';
        tr.innerHTML = `
            <td class="text-center font-bold text-slate-400">${idx + 1}</td>
            <td class="font-bold text-ink">${escapeHTML(l.name)}</td>
            <td>${escapeHTML(l.faculty)}</td>
            <td>${escapeHTML(l.major)}</td>
            <td class="text-center font-bold text-rose bg-rose-tint/20">${l.count} วิชา</td>
            <td class="text-center">${Array.from(l.semesters).sort().join(', ')}</td>
            <td class="text-center">${Array.from(l.years).sort().join(', ')}</td>
            <td class="text-slate-600">${escapeHTML(l.org)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderFacultyDegreeSummaryTable() {
    const facultyPivot = {};

    STATE.filteredLecturerData.forEach(d => {
        if (!facultyPivot[d.faculty]) {
            facultyPivot[d.faculty] = {
                bach: new Set(),
                master: new Set(),
                doc: new Set(),
                other: new Set(),
                totalSet: new Set()
            };
        }

        const entry = facultyPivot[d.faculty];
        entry.totalSet.add(d.lecturerName);

        const normalizedDeg = cleanDegree(d.degree);
        if (normalizedDeg === 'ปริญญาเอก') entry.doc.add(d.lecturerName);
        else if (normalizedDeg === 'ปริญญาโท') entry.master.add(d.lecturerName);
        else if (normalizedDeg === 'ปริญญาตรี') entry.bach.add(d.lecturerName);
        else entry.other.add(d.lecturerName);
    });

    const tbody = document.getElementById('faculty-degree-summary-body');
    const tfoot = document.getElementById('faculty-degree-summary-foot');
    if (!tbody || !tfoot) return;

    tbody.innerHTML = '';

    const sumBach = new Set();
    const sumMaster = new Set();
    const sumDoc = new Set();
    const sumOther = new Set();
    const sumTotal = new Set();

    const sortedFacs = Object.keys(facultyPivot).sort((a, b) => a.localeCompare(b, 'th'));

    if (sortedFacs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400">ยังไม่มีข้อมูลสำหรับการสรุปรายคณะ</td></tr>`;
        tfoot.innerHTML = '';
        return;
    }

    sortedFacs.forEach(fac => {
        const row = facultyPivot[fac];
        row.bach.forEach(x => sumBach.add(x));
        row.master.forEach(x => sumMaster.add(x));
        row.doc.forEach(x => sumDoc.add(x));
        row.other.forEach(x => sumOther.add(x));
        row.totalSet.forEach(x => sumTotal.add(x));

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 font-medium';
        tr.innerHTML = `
            <td class="font-bold text-ink">${escapeHTML(fac)}</td>
            <td class="text-center bg-slate-50">${row.bach.size}</td>
            <td class="text-center bg-slate-50">${row.master.size}</td>
            <td class="text-center bg-slate-50">${row.doc.size}</td>
            <td class="text-center bg-slate-50">${row.other.size}</td>
            <td class="text-center font-bold text-rose bg-rose-tint/20">${row.totalSet.size}</td>
        `;
        tbody.appendChild(tr);
    });

    tfoot.innerHTML = `
        <tr>
            <td class="p-3">รวมอาจารย์พิเศษทั้งหมด (ไม่ซ้ำคน)</td>
            <td class="text-center">${sumBach.size}</td>
            <td class="text-center">${sumMaster.size}</td>
            <td class="text-center">${sumDoc.size}</td>
            <td class="text-center">${sumOther.size}</td>
            <td class="text-center text-rose-light text-sm">${sumTotal.size}</td>
        </tr>
    `;
}

/* ==========================================================================
   7. FACULTY DEEP-DIVE (TAB 2)
   ========================================================================== */
function populateFacultyDropdown() {
    const facSet = new Set(STATE.rawLecturerData.map(d => d.faculty));
    const select = document.getElementById('faculty-dropdown-select');
    if (select) {
        select.innerHTML = '<option value="ALL">ทุกคณะ (ทั้งหมดในระบบ)</option>';
        Array.from(facSet).sort((a, b) => a.localeCompare(b, 'th')).forEach(fac => {
            const opt = document.createElement('option');
            opt.value = fac;
            opt.textContent = fac;
            select.appendChild(opt);
        });
        select.value = STATE.activeFaculty;
    }
}

function renderFacultyPills(baseData) {
    const container = document.getElementById('faculty-pill-container');
    const dropdown = document.getElementById('faculty-dropdown-select');
    if (!container) return;

    const facultyMajorMap = {};
    baseData.forEach(d => {
        if (!facultyMajorMap[d.faculty]) {
            facultyMajorMap[d.faculty] = new Set();
        }
        facultyMajorMap[d.faculty].add(d.major);
    });

    const faculties = Object.keys(facultyMajorMap).sort((a, b) => a.localeCompare(b, 'th'));

    if (STATE.activeFaculty !== 'ALL' && !facultyMajorMap[STATE.activeFaculty]) {
        STATE.activeFaculty = 'ALL';
        STATE.selectedMajorFilter = 'ALL';
    }
    if (dropdown) dropdown.value = STATE.activeFaculty;

    const totalMajorsAll = faculties.reduce((sum, fac) => sum + facultyMajorMap[fac].size, 0);

    container.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = `faculty-pill-btn ${STATE.activeFaculty === 'ALL' ? 'active' : ''}`;
    allBtn.innerHTML = `
        <span>ทุกคณะ</span>
        <span class="pill-count">${totalMajorsAll.toLocaleString()} สาขา</span>
    `;
    allBtn.addEventListener('click', () => {
        STATE.activeFaculty = 'ALL';
        STATE.selectedMajorFilter = 'ALL';
        STATE.rosterPage = 1;
        renderFacultyTab();
    });
    container.appendChild(allBtn);

    faculties.forEach(fac => {
        const majorCount = facultyMajorMap[fac].size;
        const isActive = STATE.activeFaculty === fac;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `faculty-pill-btn ${isActive ? 'active' : ''}`;
        btn.innerHTML = `
            <span>${escapeHTML(fac)}</span>
            <span class="pill-count">${majorCount.toLocaleString()} สาขา</span>
        `;
        btn.addEventListener('click', () => {
            STATE.activeFaculty = fac;
            STATE.selectedMajorFilter = 'ALL';
            STATE.rosterPage = 1;
            renderFacultyTab();
        });
        container.appendChild(btn);
    });
}

function renderFacultyTab() {
    const termDegreeData = getFilteredMasterData({ includeFaculty: false, includeMajor: false });
    renderFacultyPills(termDegreeData);

    const facultyScopedData = getFilteredMasterData({ includeFaculty: true, includeMajor: false });

    const availableMajors = new Set(facultyScopedData.map(d => d.major));
    if (STATE.selectedMajorFilter !== 'ALL' && !availableMajors.has(STATE.selectedMajorFilter)) {
        STATE.selectedMajorFilter = 'ALL';
    }

    const detailScopedData = getFilteredMasterData({ includeFaculty: true, includeMajor: true });

    const scopeBadge = document.getElementById('fac-active-scope-badge');
    if (scopeBadge) {
        const facText = STATE.activeFaculty === 'ALL' ? 'ทุกคณะ' : STATE.activeFaculty;
        const yearText = STATE.currentYearFilter === 'ALL' ? 'ปี 2566–2568' : `ปี ${STATE.currentYearFilter}`;
        const semText = STATE.currentSemesterFilter === 'ALL'
            ? 'ทุกภาคการศึกษา'
            : (STATE.currentSemesterFilter === 'S' ? 'Summer' : `ภาค ${STATE.currentSemesterFilter}`);
        scopeBadge.textContent = `ขอบเขต: ${facText} · ${yearText} · ${semText}`;
    }

    const majorPill = document.getElementById('selected-major-filter-pill');
    const majorNameEl = document.getElementById('selected-major-name');
    if (majorPill && majorNameEl) {
        if (STATE.selectedMajorFilter !== 'ALL') {
            majorPill.classList.remove('hidden');
            majorPill.classList.add('inline-flex');
            majorNameEl.textContent = STATE.selectedMajorFilter;
        } else {
            majorPill.classList.add('hidden');
            majorPill.classList.remove('inline-flex');
        }
    }

    renderFacultyKPICards(detailScopedData);
    const majorStatsList = buildMajorStats(facultyScopedData);
    renderMajorAnalysisSection(majorStatsList);
    renderWorkloadAnalysisSection(majorStatsList);
    renderCourseAnalysisSection(detailScopedData);
    renderIndividualWorkloadSection(detailScopedData);
    renderFacultyLecturerRoster(detailScopedData);
}

function renderFacultyKPICards(dataset) {
    const distinctLecturers = getDistinctLecturers(dataset).length;
    const distinctMajors = new Set(dataset.map(d => `${d.faculty}||${d.major}`)).size;
    const distinctCourses = countDistinctCourses(dataset);
    const totalRecords = dataset.length;

    const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setTxt('fac-kpi-lecturers', distinctLecturers.toLocaleString());
    setTxt('fac-kpi-majors', distinctMajors.toLocaleString());
    setTxt('fac-kpi-courses', distinctCourses.toLocaleString());
    setTxt('fac-kpi-records', totalRecords.toLocaleString());
}

function buildMajorStats(facultyDataset) {
    const map = {};

    facultyDataset.forEach(item => {
        const key = STATE.activeFaculty === 'ALL'
            ? `${item.major} (${item.faculty})`
            : item.major;

        if (!map[key]) {
            map[key] = {
                displayLabel: key,
                rawMajor: item.major,
                faculty: item.faculty,
                records: []
            };
        }
        map[key].records.push(item);
    });

    return Object.values(map).map(entry => ({
        displayLabel: entry.displayLabel,
        rawMajor: entry.rawMajor,
        faculty: entry.faculty,
        distinctLecturers: getDistinctLecturers(entry.records).length,
        distinctCourses: countDistinctCourses(entry.records),
        totalRecords: entry.records.length
    }));
}

function renderMajorAnalysisSection(majorStatsList) {
    const sortedByLecturers = [...majorStatsList].sort((a, b) =>
        b.distinctLecturers - a.distinctLecturers || a.displayLabel.localeCompare(b.displayLabel, 'th')
    );

    const badge = document.getElementById('fac-major-table-count');
    if (badge) badge.textContent = `${sortedByLecturers.length.toLocaleString()} สาขา`;

    const canvas = document.getElementById('chart-fac-major-lecturers');
    const wrapper = document.getElementById('chart-fac-major-lecturers-wrapper');
    if (canvas && wrapper) {
        if (CHARTS.facMajorLecturers) CHARTS.facMajorLecturers.destroy();

        const labels = sortedByLecturers.map(m => m.displayLabel);
        const dataVals = sortedByLecturers.map(m => m.distinctLecturers);
        const minWidth = Math.max(480, labels.length * 76);
        wrapper.style.minWidth = `${minWidth}px`;

        const maxVal = Math.max(...dataVals, 1);
        CHARTS.facMajorLecturers = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'จำนวนอาจารย์พิเศษ (คนไม่ซ้ำ)',
                    data: dataVals,
                    backgroundColor: sortedByLecturers.map(m =>
                        STATE.selectedMajorFilter === m.rawMajor ? '#0284C7' : '#234876'
                    ),
                    borderRadius: 6,
                    maxBarThickness: 42
                }]
            },
            plugins: [verticalBarLabelsPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (_, elements) => {
                    if (elements && elements.length > 0) {
                        const idx = elements[0].index;
                        const clickedMajor = sortedByLecturers[idx]?.rawMajor;
                        if (clickedMajor) {
                            STATE.selectedMajorFilter = (STATE.selectedMajorFilter === clickedMajor) ? 'ALL' : clickedMajor;
                            STATE.rosterPage = 1;
                            renderFacultyTab();
                        }
                    }
                },
                layout: { padding: { top: 24, right: 12, left: 6 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` อาจารย์พิเศษ: ${ctx.raw.toLocaleString()} คน (ไม่ซ้ำ)`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        suggestedMax: maxVal + Math.ceil(maxVal * 0.2),
                        ticks: { precision: 0, font: { family: 'Sarabun', size: 11 } },
                        grid: { color: '#EEF2F8' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { family: 'Sarabun', size: 11, weight: '600' },
                            color: '#13233D',
                            maxRotation: 35,
                            minRotation: 0
                        }
                    }
                }
            }
        });
    }

    const tbody = document.getElementById('fac-major-summary-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (sortedByLecturers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-slate-400">ไม่พบข้อมูลสาขาวิชาตามเงื่อนไขตัวกรอง</td></tr>`;
        return;
    }

    sortedByLecturers.forEach(m => {
        const isSelected = STATE.selectedMajorFilter === m.rawMajor;
        const tr = document.createElement('tr');
        tr.className = `clickable-row ${isSelected ? 'selected-major-row' : ''}`;
        tr.title = 'คลิกเพื่อกรองรายละเอียดเฉพาะสาขาวิชานี้';
        tr.innerHTML = `
            <td class="col-wrap font-semibold text-ink">
                ${escapeHTML(m.displayLabel)}
                ${isSelected ? '<span class="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-sky-600 text-white">กำลังเลือก</span>' : ''}
            </td>
            <td class="text-center font-bold text-navy">${m.distinctLecturers.toLocaleString()}</td>
            <td class="text-center font-semibold text-sky-700">${m.distinctCourses.toLocaleString()}</td>
            <td class="text-center font-semibold text-emerald-700">${m.totalRecords.toLocaleString()}</td>
        `;
        tr.addEventListener('click', () => {
            STATE.selectedMajorFilter = (STATE.selectedMajorFilter === m.rawMajor) ? 'ALL' : m.rawMajor;
            STATE.rosterPage = 1;
            renderFacultyTab();
        });
        tbody.appendChild(tr);
    });
}

function renderWorkloadAnalysisSection(majorStatsList) {
    const metricSelect = document.getElementById('workload-metric-select');
    const selectedMetric = metricSelect ? metricSelect.value : 'records';

    const sortedByWorkload = [...majorStatsList].sort((a, b) => {
        if (selectedMetric === 'courses') {
            return b.distinctCourses - a.distinctCourses || b.totalRecords - a.totalRecords;
        }
        return b.totalRecords - a.totalRecords || b.distinctCourses - a.distinctCourses;
    });

    const titleEl = document.getElementById('workload-chart-title');
    const subTitleEl = document.getElementById('workload-chart-subtitle');
    let metricUnit = 'รายการ';
    let metricLabel = 'จำนวนรายการสอน';
    let barColor = '#059669';

    if (selectedMetric === 'courses') {
        metricUnit = 'วิชา';
        metricLabel = 'จำนวนรายวิชาที่เปิดสอน';
        barColor = '#0284C7';
    }

    if (titleEl) titleEl.textContent = `กราฟเปรียบเทียบ${metricLabel}แยกตามสาขาวิชา`;
    if (subTitleEl) subTitleEl.textContent = `ตัวชี้วัด: ${metricLabel} (${metricUnit}) · เรียงจากมากไปน้อย`;

    const canvas = document.getElementById('chart-fac-workload');
    const wrapper = document.getElementById('chart-fac-workload-wrapper');
    if (canvas && wrapper) {
        if (CHARTS.facWorkload) CHARTS.facWorkload.destroy();

        const labels = sortedByWorkload.map(m => m.displayLabel);
        const values = sortedByWorkload.map(m =>
            selectedMetric === 'courses' ? m.distinctCourses : m.totalRecords
        );

        const minWidth = Math.max(480, labels.length * 76);
        wrapper.style.minWidth = `${minWidth}px`;
        const maxVal = Math.max(...values, 1);

        CHARTS.facWorkload = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: metricLabel,
                    data: values,
                    backgroundColor: barColor,
                    borderRadius: 6,
                    maxBarThickness: 42
                }]
            },
            plugins: [verticalBarLabelsPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 24, right: 12, left: 6 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${metricLabel}: ${ctx.raw.toLocaleString()} ${metricUnit}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        suggestedMax: maxVal + Math.ceil(maxVal * 0.2),
                        ticks: { precision: 0, font: { family: 'Sarabun', size: 11 } },
                        grid: { color: '#EEF2F8' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { family: 'Sarabun', size: 11, weight: '600' },
                            color: '#13233D',
                            maxRotation: 35,
                            minRotation: 0
                        }
                    }
                }
            }
        });
    }

    const tbody = document.getElementById('fac-workload-ranking-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (sortedByWorkload.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-slate-400">ไม่พบข้อมูลภาระงานสอนตามเงื่อนไขตัวกรอง</td></tr>`;
        return;
    }

    sortedByWorkload.forEach((m, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-center font-bold ${idx < 3 ? 'text-navy' : 'text-slate-400'}">${idx + 1}</td>
            <td class="col-wrap font-semibold text-ink">${escapeHTML(m.displayLabel)}</td>
            <td class="text-center font-semibold text-sky-700">${m.distinctCourses.toLocaleString()}</td>
            <td class="text-center font-bold text-emerald-700 bg-emerald-50/40">${m.totalRecords.toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderCourseAnalysisSection(dataset) {
    const searchQuery = cleanString(document.getElementById('fac-course-search')?.value || '').toLowerCase();
    const courseMap = {};

    dataset.forEach(item => {
        const normCode = normalizeCourseKey(item.courseCode, item.courseName);
        if (!normCode) return;

        if (!courseMap[normCode]) {
            courseMap[normCode] = {
                displayCode: normCode.startsWith('NO_CODE::') ? 'ไม่ระบุรหัสวิชา' : normCode,
                courseName: cleanString(item.courseName) || 'ไม่ระบุชื่อรายวิชา',
                majors: new Set(),
                lecturers: new Set(),
                recordCount: 0
            };
        }

        const entry = courseMap[normCode];
        if (entry.courseName === 'ไม่ระบุชื่อรายวิชา' && cleanString(item.courseName)) {
            entry.courseName = cleanString(item.courseName);
        }
        entry.majors.add(item.major);
        entry.lecturers.add(item.lecturerName);
        entry.recordCount += 1;
    });

    let courseList = Object.values(courseMap);

    if (searchQuery) {
        courseList = courseList.filter(c =>
            c.displayCode.toLowerCase().includes(searchQuery) ||
            c.courseName.toLowerCase().includes(searchQuery) ||
            Array.from(c.majors).some(m => m.toLowerCase().includes(searchQuery))
        );
    }

    const dir = STATE.courseSortDir === 'asc' ? 1 : -1;
    courseList.sort((a, b) => {
        if (STATE.courseSortField === 'code') {
            return a.displayCode.localeCompare(b.displayCode, 'th') * dir;
        }
        if (STATE.courseSortField === 'name') {
            return a.courseName.localeCompare(b.courseName, 'th') * dir;
        }
        return (a.lecturers.size - b.lecturers.size) * dir || a.displayCode.localeCompare(b.displayCode, 'th');
    });

    const badge = document.getElementById('fac-course-table-badge');
    if (badge) badge.textContent = `${courseList.length.toLocaleString()} รายวิชา`;

    const tbody = document.getElementById('fac-course-analysis-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (courseList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">ไม่พบข้อมูลรายวิชาตามเงื่อนไขที่เลือก</td></tr>`;
        return;
    }

    courseList.forEach((c, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-center font-bold text-slate-400">${idx + 1}</td>
            <td class="font-bold text-navy">${escapeHTML(c.displayCode)}</td>
            <td class="col-wrap font-semibold text-ink">${escapeHTML(c.courseName)}</td>
            <td class="col-wrap text-slate-600">${escapeHTML(Array.from(c.majors).join(', '))}</td>
            <td class="text-center font-bold text-sky-700 bg-sky-50/40">${c.lecturers.size.toLocaleString()} คน</td>
            <td class="text-center font-semibold text-emerald-700">${c.recordCount.toLocaleString()} รายการ</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderIndividualWorkloadSection(dataset) {
    const lecturerMap = {};
    dataset.forEach(item => {
        if (!lecturerMap[item.lecturerName]) {
            lecturerMap[item.lecturerName] = {
                name: item.lecturerName,
                majors: new Set(),
                courses: new Set(),
                records: []
            };
        }
        const entry = lecturerMap[item.lecturerName];
        entry.majors.add(item.major);

        const cCode = cleanString(item.courseCode);
        const cName = cleanString(item.courseName);
        const courseFull = [cCode, cName].filter(Boolean).join(' - ') || 'ไม่ระบุรายวิชา';
        entry.courses.add(courseFull);
        entry.records.push(item);
    });

    const lecturerList = Object.values(lecturerMap).map(l => ({
        name: l.name,
        majors: Array.from(l.majors),
        courses: Array.from(l.courses),
        distinctCourseCount: countDistinctCourses(l.records),
        recordCount: l.records.length
    })).sort((a, b) =>
        b.recordCount - a.recordCount ||
        b.distinctCourseCount - a.distinctCourseCount ||
        a.name.localeCompare(b.name, 'th')
    );

    const badge = document.getElementById('fac-individual-count-badge');
    if (badge) badge.textContent = `${lecturerList.length.toLocaleString()} อาจารย์`;

    const tbody = document.getElementById('fac-lecturer-groups-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (lecturerList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">ไม่พบข้อมูลอาจารย์ตามเงื่อนไขตัวกรอง</td></tr>`;
        return;
    }

    lecturerList.forEach((l, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'clickable-row';
        tr.title = 'คลิกเพื่อดูรายละเอียดรายบุคคล';
        tr.innerHTML = `
            <td class="text-center font-bold text-slate-400">${idx + 1}</td>
            <td class="font-bold text-navy underline decoration-dotted">${escapeHTML(l.name)}</td>
            <td class="col-wrap">${escapeHTML(l.majors.join(', '))}</td>
            <td class="col-wrap text-xs text-ink">${l.courses.map(c => escapeHTML(c)).join('<br>')}</td>
            <td class="text-center font-semibold text-sky-700">${l.distinctCourseCount.toLocaleString()} วิชา</td>
            <td class="text-center font-bold text-emerald-700 bg-emerald-50/40">${l.recordCount.toLocaleString()} รายการ</td>
        `;
        tr.addEventListener('click', () => openFacultyLecturerModal(l.name, dataset));
        tbody.appendChild(tr);
    });
}

function renderFacultyLecturerRoster(dataset) {
    const searchInput = document.getElementById('fac-table-search');
    const searchText = cleanString(searchInput ? searchInput.value : '').toLowerCase();
    const sortBy = document.getElementById('fac-roster-sort')?.value || 'name_asc';

    const map = {};
    dataset.forEach(d => {
        if (!map[d.lecturerName]) {
            map[d.lecturerName] = {
                name: d.lecturerName,
                majors: new Set(),
                degree: d.degree || 'ไม่ระบุคุณวุฒิ',
                org: d.org || 'ไม่ระบุสังกัด',
                courses: new Set(),
                records: []
            };
        }
        map[d.lecturerName].majors.add(d.major);
        const courseLabel = [cleanString(d.courseCode), cleanString(d.courseName)].filter(Boolean).join(' - ');
        if (courseLabel) map[d.lecturerName].courses.add(courseLabel);
        map[d.lecturerName].records.push(d);
    });

    let rosterList = Object.values(map);

    if (searchText) {
        rosterList = rosterList.filter(l =>
            l.name.toLowerCase().includes(searchText) ||
            l.org.toLowerCase().includes(searchText) ||
            Array.from(l.majors).some(m => m.toLowerCase().includes(searchText)) ||
            Array.from(l.courses).some(c => c.toLowerCase().includes(searchText))
        );
    }

    rosterList.sort((a, b) => {
        if (sortBy === 'major_asc') {
            return Array.from(a.majors).join(', ').localeCompare(Array.from(b.majors).join(', '), 'th');
        }
        if (sortBy === 'degree_asc') {
            return a.degree.localeCompare(b.degree, 'th');
        }
        if (sortBy === 'courses_desc') {
            return b.courses.size - a.courses.size || a.name.localeCompare(b.name, 'th');
        }
        return a.name.localeCompare(b.name, 'th');
    });

    const totalCount = rosterList.length;
    const countBadge = document.getElementById('fac-roster-count-badge');
    if (countBadge) countBadge.textContent = `พบ ${totalCount.toLocaleString()} คน`;

    const tbody = document.getElementById('faculty-lecturer-table-body');
    const pageInfo = document.getElementById('fac-roster-page-info');
    const pageButtons = document.getElementById('fac-roster-page-buttons');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (totalCount === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">ไม่พบรายชื่ออาจารย์ตามเงื่อนไขที่ค้นหา</td></tr>`;
        if (pageInfo) pageInfo.textContent = 'แสดง 0 - 0 จากทั้งหมด 0 คน';
        if (pageButtons) pageButtons.innerHTML = '';
        return;
    }

    const pageSize = STATE.rosterPageSize === 'ALL' ? totalCount : STATE.rosterPageSize;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    if (STATE.rosterPage > totalPages) STATE.rosterPage = totalPages;

    const startIdx = (STATE.rosterPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, totalCount);
    const pageSlice = rosterList.slice(startIdx, endIdx);

    pageSlice.forEach((l, idx) => {
        const globalIdx = startIdx + idx + 1;
        const tr = document.createElement('tr');
        tr.className = 'clickable-row';
        tr.title = 'คลิกชื่ออาจารย์เพื่อดูรายละเอียดรายบุคคล';
        tr.innerHTML = `
            <td class="text-center font-bold text-slate-400">${globalIdx}</td>
            <td class="font-bold text-navy underline decoration-dotted">${escapeHTML(l.name)}</td>
            <td class="col-wrap">${escapeHTML(Array.from(l.majors).join(', '))}</td>
            <td><span class="px-2 py-0.5 text-[11px] rounded bg-slate-100 text-ink font-semibold">${escapeHTML(l.degree)}</span></td>
            <td class="text-slate-600 col-wrap">${escapeHTML(l.org)}</td>
            <td class="text-xs text-slate-700 col-wrap">${Array.from(l.courses).map(c => escapeHTML(c)).join('<br>') || 'ไม่มีข้อมูล'}</td>
        `;
        tr.addEventListener('click', () => openFacultyLecturerModal(l.name, dataset));
        tbody.appendChild(tr);
    });

    if (pageInfo) {
        pageInfo.textContent = `แสดง ${(startIdx + 1).toLocaleString()} - ${endIdx.toLocaleString()} จากทั้งหมด ${totalCount.toLocaleString()} คน`;
    }

    if (pageButtons) {
        pageButtons.innerHTML = '';
        if (totalPages > 1) {
            const createBtn = (label, targetPage, disabled = false, active = false) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.disabled = disabled;
                btn.className = `px-2.5 py-1 rounded-lg font-bold font-disp transition ${
                    active
                        ? 'bg-navy text-white'
                        : disabled
                            ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                            : 'bg-white border border-line text-ink hover:bg-slate-100'
                }`;
                btn.textContent = label;
                if (!disabled && !active) {
                    btn.addEventListener('click', () => {
                        STATE.rosterPage = targetPage;
                        renderFacultyLecturerRoster(dataset);
                    });
                }
                return btn;
            };

            pageButtons.appendChild(createBtn('ก่อนหน้า', STATE.rosterPage - 1, STATE.rosterPage === 1));

            const startPage = Math.max(1, STATE.rosterPage - 2);
            const endPage = Math.min(totalPages, STATE.rosterPage + 2);
            for (let p = startPage; p <= endPage; p++) {
                pageButtons.appendChild(createBtn(String(p), p, false, p === STATE.rosterPage));
            }

            pageButtons.appendChild(createBtn('ถัดไป', STATE.rosterPage + 1, STATE.rosterPage === totalPages));
        }
    }
}

function openFacultyLecturerModal(lecturerName, scopedDataset) {
    const records = scopedDataset.filter(d => d.lecturerName === lecturerName);
    if (records.length === 0) return;

    const primary = records[0];
    const distinctMajors = new Set(records.map(r => r.major));
    const distinctCourses = countDistinctCourses(records);

    const setTxt = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    setTxt('fac-modal-avatar', lecturerName.charAt(0));
    setTxt('fac-modal-name', lecturerName);
    setTxt('fac-modal-degree', primary.degree || 'ไม่ระบุคุณวุฒิ');

    const orgEl = document.getElementById('fac-modal-org');
    if (orgEl) {
        orgEl.innerHTML = `<i class="fa-solid fa-building-user mr-1"></i>สังกัด: ${escapeHTML(primary.org || 'ไม่ระบุสังกัด')}`;
    }

    setTxt('fac-modal-majors-count', `${distinctMajors.size.toLocaleString()} สาขา`);
    setTxt('fac-modal-courses-count', `${distinctCourses.toLocaleString()} วิชา`);
    setTxt('fac-modal-records-count', `${records.length.toLocaleString()} รายการ`);

    const tbody = document.getElementById('fac-modal-courses-body');
    if (tbody) {
        tbody.innerHTML = '';
        records.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHTML(r.year)}</td>
                <td>${r.semester === 'S' ? 'Summer' : `ภาค ${escapeHTML(r.semester)}`}</td>
                <td class="col-wrap">${escapeHTML(r.major)}</td>
                <td class="font-bold text-navy">${escapeHTML(r.courseCode || '-')}</td>
                <td class="col-wrap font-semibold text-ink">${escapeHTML(r.courseName || 'ไม่ระบุชื่อรายวิชา')}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    document.getElementById('faculty-lecturer-detail-modal')?.classList.remove('hidden');
}

function closeFacultyLecturerModal() {
    document.getElementById('faculty-lecturer-detail-modal')?.classList.add('hidden');
}

function exportSelectedFacultyExcel() {
    const dataset = getFilteredMasterData({ includeFaculty: true, includeMajor: true });
    if (dataset.length === 0) {
        alert('ไม่พบข้อมูลในขอบเขตที่เลือกสำหรับส่งออก');
        return;
    }

    const rows = dataset.map((d, idx) => ({
        'ลำดับ': idx + 1,
        'ชื่อ-สกุล อาจารย์': d.lecturerName,
        'คณะ/วิทยาลัย': d.faculty,
        'สาขาวิชา': d.major,
        'ปีการศึกษา': d.year,
        'ภาคการศึกษา': d.semester === 'S' ? 'Summer' : `ภาค ${d.semester}`,
        'ระดับคุณวุฒิ': d.degree,
        'รหัสวิชา': d.courseCode || '-',
        'ชื่อรายวิชา': d.courseName || '-',
        'หน่วยงาน/สังกัด': d.org
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Faculty_DeepDive');

    const safeFac = STATE.activeFaculty === 'ALL' ? 'ทุกคณะ' : STATE.activeFaculty.replace(/[\\/:*?"<>|]/g, '_');
    const safeYear = STATE.currentYearFilter === 'ALL' ? '2566-2568' : STATE.currentYearFilter;
    XLSX.writeFile(wb, `วิเคราะห์รายคณะ_${safeFac}_ปี${safeYear}.xlsx`);
}

/* ==========================================================================
   8. SEARCH ENGINE & LECTURER MISSION (TAB 3)
   ========================================================================== */
function populateSearchYearFilter() {
    const yearSet = new Set(STATE.rawLecturerData.map(d => d.year));
    const select = document.getElementById('lecturer-year-filter');
    if (!select) return;

    const prevVal = select.value || 'ALL';
    select.innerHTML = '<option value="ALL">ทุกปีการศึกษา</option>';
    Array.from(yearSet).sort().forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = `ปีการศึกษา ${y}`;
        select.appendChild(opt);
    });
    if (Array.from(yearSet).includes(prevVal)) {
        select.value = prevVal;
    }
}

function isQueryMatchRecord(queryRaw, name, courseCode = '', courseName = '') {
    const qNoSpace = normalizeSearchText(queryRaw);
    const qNoPrefix = stripAcademicPrefix(queryRaw);

    const nNoSpace = normalizeSearchText(name);
    const nNoPrefix = stripAcademicPrefix(name);
    const cCodeNoSpace = normalizeSearchText(courseCode);
    const cNameNoSpace = normalizeSearchText(courseName);

    if (nNoSpace.includes(qNoSpace)) return true;
    if (qNoPrefix && nNoPrefix.includes(qNoPrefix)) return true;
    if (cCodeNoSpace && cCodeNoSpace.includes(qNoSpace)) return true;
    if (cNameNoSpace && cNameNoSpace.includes(qNoSpace)) return true;

    return false;
}

function handleLecturerSearch() {
    const searchInput = document.getElementById('lecturer-search-input');
    const query = cleanString(searchInput ? searchInput.value : '');
    const selYear = document.getElementById('lecturer-year-filter')?.value || 'ALL';
    const selSem = document.getElementById('lecturer-semester-filter')?.value || 'ALL';

    const profileCard = document.getElementById('lecturer-profile-card');
    const searchTbody = document.getElementById('lecturer-search-table-body');
    const resultCount = document.getElementById('search-result-count');

    if (!query) {
        profileCard?.classList.add('hidden');
        if (searchTbody) {
            searchTbody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-8 text-center text-muted">
                        <i class="fa-solid fa-user-check text-3xl mb-2 text-slate-300 block"></i>
                        <p>กรุณากรอกชื่ออาจารย์ในช่องค้นหาด้านบน เพื่อเรียกดูประวัติการสอน</p>
                    </td>
                </tr>`;
        }
        if (resultCount) resultCount.textContent = 'พบ 0 รายการ';
        renderMissionTable(STATE.rawMissionData);
        return;
    }

    const effectiveYear = selYear !== 'ALL' ? selYear : STATE.currentYearFilter;
    const effectiveSem = selSem !== 'ALL' ? selSem : STATE.currentSemesterFilter;

    const matches = STATE.rawLecturerData.filter(d => {
        const matchText = isQueryMatchRecord(query, d.lecturerName, d.courseCode, d.courseName);
        const matchY = (effectiveYear === 'ALL') || (d.year === effectiveYear);
        const matchS = (effectiveSem === 'ALL') || (d.semester === effectiveSem);
        return matchText && matchY && matchS;
    });

    const missionMatches = STATE.rawMissionData.filter(m =>
        isQueryMatchRecord(query, m.lecturerName, m.courseCode, m.courseName)
    );

    if (resultCount) resultCount.textContent = `พบ ${matches.length} รายการ`;

    if (searchTbody) {
        searchTbody.innerHTML = '';
        if (matches.length === 0) {
            const anyYearMatches = STATE.rawLecturerData.filter(d =>
                isQueryMatchRecord(query, d.lecturerName, d.courseCode, d.courseName)
            );
            if (anyYearMatches.length > 0) {
                const availYears = Array.from(new Set(anyYearMatches.map(d => d.year))).sort().join(', ');
                searchTbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-amber-700 font-semibold">ไม่พบประวัติการสอนในปีที่เลือก (พบข้อมูลของอาจารย์ท่านนี้ในปีการศึกษา: ${escapeHTML(availYears)})</td></tr>`;
            } else {
                searchTbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400">ไม่พบประวัติการสอนตรงตามคำค้นหา</td></tr>`;
            }
        } else {
            matches.forEach(m => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHTML(m.year)}</td>
                    <td>${m.semester === 'S' ? 'Summer' : `ภาคเรียนที่ ${escapeHTML(m.semester)}`}</td>
                    <td>${escapeHTML(m.faculty)}</td>
                    <td>${escapeHTML(m.major)}</td>
                    <td class="font-bold text-ink">${escapeHTML(m.courseCode)} - ${escapeHTML(m.courseName)}</td>
                    <td class="text-center font-bold text-rose">${m.credit}</td>
                `;
                searchTbody.appendChild(tr);
            });
        }
    }

    if (matches.length > 0 || missionMatches.length > 0) {
        profileCard?.classList.remove('hidden');

        const setElemText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        const displayName = matches.length > 0 ? matches[0].lecturerName : missionMatches[0].lecturerName;
        const displayDegree = matches.length > 0 ? matches[0].degree : 'ข้อมูลจากไฟล์พันธกิจ';
        const displayOrg = matches.length > 0 ? matches[0].org : 'ไม่ระบุสังกัด';

        setElemText('profile-name', displayName);
        setElemText('profile-avatar-initial', displayName.charAt(0));
        setElemText('profile-degree-badge', displayDegree);

        const pOrg = document.getElementById('profile-org');
        if (pOrg) pOrg.innerHTML = `<i class="fa-solid fa-building-user mr-1.5"></i>สังกัด: ${escapeHTML(displayOrg)}`;

        const lectCourses = STATE.rawLecturerData.filter(d => stripAcademicPrefix(d.lecturerName) === stripAcademicPrefix(displayName));
        const totalCreds = lectCourses.reduce((acc, c) => acc + c.credit, 0);
        const facCount = new Set(lectCourses.map(c => c.faculty)).size;

        setElemText('profile-total-courses', `${lectCourses.length} รายการ`);
        setElemText('profile-total-credits', `${totalCreds} หน่วยกิต`);
        setElemText('profile-faculties-count', `${facCount} คณะ`);
        setElemText('profile-mission-courses', `${missionMatches.length} วิชา`);
    } else {
        profileCard?.classList.add('hidden');
    }

    renderMissionTable(missionMatches.length > 0 ? missionMatches : STATE.rawMissionData);
}

function renderMissionTable(dataList) {
    ensureMissionTableSplitHeaders();

    const tbody = document.getElementById('mission-table-body');
    const kpiCourses = document.getElementById('mission-kpi-courses');
    const coTeachingCount = dataList.filter(d => d.isCoTeaching || d.type === 'วิชาเรียนร่วม').length;
    if (kpiCourses) {
        kpiCourses.textContent = coTeachingCount > 0
            ? `รวม ${dataList.length} รายวิชา (เฉพาะอาจารย์พิเศษ · วิชาเรียนร่วม ${coTeachingCount} รายการ)`
            : `รวม ${dataList.length} รายวิชา (เฉพาะอาจารย์พิเศษ)`;
    }
    if (!tbody) return;

    tbody.innerHTML = '';

    if (dataList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="py-8 text-center text-muted">
                    <i class="fa-solid fa-folder-open text-3xl mb-2 text-slate-300 block"></i>
                    <p>ยังไม่มีข้อมูลประมาณการพันธกิจของอาจารย์พิเศษ (กรุณานำเข้าไฟล์ Excel ประมาณการพันธกิจ)</p>
                </td>
            </tr>`;
        return;
    }

    dataList.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50';

        const isCoTeach = item.isCoTeaching || item.type === 'วิชาเรียนร่วม';
        const typeBadgeClass = isCoTeach
            ? 'px-2 py-0.5 text-[11px] rounded bg-amber-100 text-amber-800 font-bold border border-amber-200'
            : 'px-2 py-0.5 text-[11px] rounded bg-purple-50 text-purple-700 font-semibold';

        const lecturerCellHTML = item.coLecturerNote
            ? `<div class="font-bold text-ink">${escapeHTML(item.lecturerName)}</div>
               <div class="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 text-[11px] font-semibold">
                   <i class="fa-solid fa-user-group text-[10px]"></i>
                   <span>${escapeHTML(item.coLecturerNote)}</span>
               </div>`
            : `<span class="font-bold text-ink">${escapeHTML(item.lecturerName)}</span>`;

        const linkLabel = item.facultyName && item.facultyName !== '-'
            ? `ลิงก์พันธกิจ (${escapeHTML(item.facultyName)})`
            : 'เปิดลิงก์ไฟล์พันธกิจ';

        const remarkHTML = item.missionLink
            ? `<a href="${escapeHTML(item.missionLink)}" target="_blank" rel="noopener noreferrer"
                  class="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 hover:text-sky-900 underline">
                   <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                   <span>${linkLabel}</span>
               </a>`
            : `<span class="text-slate-400">-</span>`;

        tr.innerHTML = `
            <td style="text-align:center;" class="font-bold text-slate-400">${idx + 1}</td>
            <td style="text-align:left; word-break:break-word;">${lecturerCellHTML}</td>
            <td style="text-align:left; word-break:break-word;" class="font-bold text-navy">${escapeHTML(item.courseCode)}</td>
            <td style="text-align:${item.courseName === '-' ? 'center' : 'left'}; word-break:break-word;" class="${item.courseName === '-' ? 'text-slate-400' : 'text-ink font-medium'}">${escapeHTML(item.courseName)}</td>
            <td style="text-align:center;"><span class="${typeBadgeClass}">${escapeHTML(item.type)}</span></td>
            <td style="text-align:center;" class="font-bold text-rose">${escapeHTML(item.credit)}</td>
            <td style="text-align:center; background-color:rgba(240,249,255,0.65);" class="font-bold text-sky-800">${escapeHTML(item.theorySection || '-')}</td>
            <td style="text-align:center; background-color:rgba(236,253,245,0.65);" class="font-bold text-emerald-800">${escapeHTML(item.labSection || '-')}</td>
            <td style="text-align:left; word-break:break-word;">${remarkHTML}</td>
        `;
        tbody.appendChild(tr);
    });
}

/* ==========================================================================
   9. MODAL & EDIT ACTIONS
   ========================================================================== */
function openEditOrgModal() {
    const name = document.getElementById('profile-name')?.textContent;
    if (!name || name === 'อาจารย์...') return;

    const inputName = document.getElementById('edit-org-lecturer-name');
    const inputOrg = document.getElementById('edit-org-input');

    if (inputName) inputName.value = name;
    if (inputOrg) inputOrg.value = STATE.customOrgMap[name] || '';
    
    document.getElementById('edit-org-modal')?.classList.remove('hidden');
}

function closeEditOrgModal() {
    document.getElementById('edit-org-modal')?.classList.add('hidden');
}

function saveEditOrg() {
    const name = document.getElementById('edit-org-lecturer-name')?.value;
    const newOrg = cleanString(document.getElementById('edit-org-input')?.value);

    if (name && newOrg) {
        STATE.customOrgMap[name] = newOrg;
        localStorage.setItem('custom_lecturer_orgs', JSON.stringify(STATE.customOrgMap));

        STATE.rawLecturerData.forEach(item => {
            if (item.lecturerName === name) item.org = newOrg;
        });

        closeEditOrgModal();
        applyGlobalFilters();
        handleLecturerSearch();
        alert(`อัปเดตข้อมูลสังกัดของคุณ ${name} เรียบร้อยแล้ว`);
    }
}

/* ==========================================================================
   10. EXPORT EXCEL & CSV UTILITIES
   ========================================================================== */
function exportMainCSV() {
    if (STATE.filteredLecturerData.length === 0) return;
    
    let csvContent = "\uFEFFอาจารย์ผู้สอน,ปีการศึกษา,ภาคเรียน,คุณวุฒิ,คณะ,สาขาวิชา,รหัสวิชา,ชื่อวิชา,หน่วยกิต,สังกัด\n";
    STATE.filteredLecturerData.forEach(d => {
        csvContent += `"${d.lecturerName}","${d.year}","${d.semester}","${d.degree}","${d.faculty}","${d.major}","${d.courseCode}","${d.courseName}","${d.credit}","${d.org}"\n`;
    });

    downloadBlob(csvContent, 'Lecturer_Workload_Report.csv', 'text/csv;charset=utf-8;');
}

function exportMissionCSV() {
    if (STATE.rawMissionData.length === 0) return;

    let csvContent = "\uFEFFลำดับ,ชื่ออาจารย์พิเศษ,ผู้สอนร่วม,รหัสวิชา,ชื่อวิชา,ประเภทวิชา,หน่วยกิต,กลุ่มทฤษฎี (T),กลุ่มปฏิบัติ (L),หมายเหตุ (ลิงก์พันธกิจ)\n";
    STATE.rawMissionData.forEach((m, idx) => {
        csvContent += `"${idx + 1}","${m.lecturerName}","${m.coLecturerNote || '-'}","${m.courseCode}","${m.courseName}","${m.type}","${m.credit}","${m.theorySection || '-'}","${m.labSection || '-'}","${m.missionLink || '-'}"\n`;
    });

    downloadBlob(csvContent, 'Mission_Estimation_Special_Lecturers.csv', 'text/csv;charset=utf-8;');
}

function exportFilteredExcel(degree) {
    let subset = STATE.filteredLecturerData;
    let degreeTitle = 'รวมอาจารย์พิเศษทุกระดับคุณวุฒิ';

    if (degree !== 'ALL') {
        subset = subset.filter(d => cleanDegree(d.degree) === degree);
        degreeTitle = degree === 'ไม่ระบุคุณวุฒิ' ? 'กลุ่มไม่ระบุคุณวุฒิ' : `ระดับ${degree}`;
    }

    if (subset.length === 0) {
        alert('ไม่พบข้อมูลตามระดับคุณวุฒิที่เลือกในระบบ');
        return;
    }

    const uniqueLecturers = getDistinctLecturers(subset);
    const totalTeachingRecords = subset.length;

    const summaryData = [
        { 'หัวข้อสรุปการนับ': 'ประเภทรายงาน', 'จำนวน/รายละเอียด': degreeTitle },
        { 'หัวข้อสรุปการนับ': 'ปีการศึกษาที่เลือก', 'จำนวน/รายละเอียด': STATE.currentYearFilter === 'ALL' ? 'ปี 2566 - 2568' : `ปี ${STATE.currentYearFilter}` },
        { 'หัวข้อสรุปการนับ': 'ภาคเรียนที่เลือก', 'จำนวน/รายละเอียด': STATE.currentSemesterFilter === 'ALL' ? 'ทุกภาคการศึกษา' : (STATE.currentSemesterFilter === 'S' ? 'ภาคฤดูร้อน' : `ภาคเรียนที่ ${STATE.currentSemesterFilter}`) },
        { 'หัวข้อสรุปการนับ': 'จำนวนอาจารย์พิเศษรวม (ไม่ซ้ำคน)', 'จำนวน/รายละเอียด': uniqueLecturers.length },
        { 'หัวข้อสรุปการนับ': 'จำนวนรายการสอนทั้งหมด', 'จำนวน/รายละเอียด': totalTeachingRecords },
        { 'หัวข้อสรุปการนับ': 'หลักเกณฑ์การนับ', 'จำนวน/รายละเอียด': 'นับชื่อ-สกุลอาจารย์ที่ไม่ซ้ำกัน โดยอาจารย์ 1 คนที่สอนหลายคณะหรือหลายรายวิชาจะนับเป็น 1 คน' }
    ];

    const lecturerRecordMap = new Map();
    subset.forEach(d => {
        const name = cleanString(d.lecturerName);
        if (!name) return;
        lecturerRecordMap.set(name, (lecturerRecordMap.get(name) || 0) + 1);
    });

    const detailData = subset.map((d, index) => {
        const name = cleanString(d.lecturerName);
        return {
            'ลำดับที่': index + 1,
            'ชื่อ-สกุล อาจารย์': d.lecturerName,
            'คณะ/วิทยาลัย': d.faculty,
            'สาขาวิชา': d.major,
            'จำนวนรายการสอน': lecturerRecordMap.get(name) || 0,
            'ภาคการศึกษา': d.semester,
            'ปีการศึกษา': d.year,
            'คุณวุฒิ': d.degree,
            'หน่วยงาน/สังกัด': d.org,
            'รหัสวิชา': d.courseCode,
            'ชื่อรายวิชา': d.courseName,
            'หน่วยกิต': d.credit
        };
    });

    const wb = XLSX.utils.book_new();

    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 55 }, { wch: 65 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary_สรุปตัวเลข');

    const wsDetail = XLSX.utils.json_to_sheet(detailData);
    wsDetail['!cols'] = [
        { wch: 8 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, 
        { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, 
        { wch: 30 }, { wch: 14 }, { wch: 32 }, { wch: 10 }
    ];
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Lecturer_Details');

    const safeDegree = degree === 'ALL' ? 'ทุกระดับ' : degree;
    const safeYear = STATE.currentYearFilter === 'ALL' ? '2566-2568' : STATE.currentYearFilter;
    const fileName = `รายงานอาจารย์พิเศษ_${safeDegree}_ปี${safeYear}.xlsx`;

    XLSX.writeFile(wb, fileName);
}

function exportFacultyDegreeExcel() {
    const facultyPivot = {};

    STATE.filteredLecturerData.forEach(d => {
        if (!facultyPivot[d.faculty]) {
            facultyPivot[d.faculty] = {
                bach: new Set(),
                master: new Set(),
                doc: new Set(),
                other: new Set(),
                totalSet: new Set()
            };
        }

        const entry = facultyPivot[d.faculty];
        entry.totalSet.add(d.lecturerName);

        const normalizedDeg = cleanDegree(d.degree);
        if (normalizedDeg === 'ปริญญาเอก') entry.doc.add(d.lecturerName);
        else if (normalizedDeg === 'ปริญญาโท') entry.master.add(d.lecturerName);
        else if (normalizedDeg === 'ปริญญาตรี') entry.bach.add(d.lecturerName);
        else entry.other.add(d.lecturerName);
    });

    const rows = Object.keys(facultyPivot).sort().map(fac => ({
        'คณะ / วิทยาลัย': fac,
        'ปริญญาตรี (คน)': facultyPivot[fac].bach.size,
        'ปริญญาโท (คน)': facultyPivot[fac].master.size,
        'ปริญญาเอก (คน)': facultyPivot[fac].doc.size,
        'ไม่ระบุคุณวุฒิ (คน)': facultyPivot[fac].other.size,
        'รวมอาจารย์พิเศษทั้งหมด (คน)': facultyPivot[fac].totalSet.size
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Faculty_Degree_Summary');
    XLSX.writeFile(wb, 'Faculty_Degree_Summary_Report.xlsx');
}

function downloadBlob(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
