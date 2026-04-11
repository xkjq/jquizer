/**********************************************************************
*  Javascript SBA/EMQ/etc... question thing
*

*  This program is free software: you can redistribute it and/or modify
*  it under the terms of the GNU General Public License as published by
*  the Free Software Foundation, either version 3 of the License, or
*  (at your option) any later version.

*  This program is distributed in the hope that it will be useful,
*  but WITHOUT ANY WARRANTY; without even the implied warranty of
*  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
*  GNU General Public License for more details.

*  You should have received a copy of the GNU General Public License
*  along with this program.  If not, see <http://www.gnu.org/licenses/>.
*********************************************************************/
//Versions
// import * as loadQuestion from "./loadQuestion.js"
// import * as dicomViewer from "./dicomViewer.js"

var quiz_version = "0.1";

var fix_broken_question_formatting = true;

var default_question_set = "questions/default";


// Settings
var auto_load_previous_answers = true;
var rebuild_score_list_on_answer = true;

var trucate_score_list_at = 20;
var show_all_scores = false;

// Global object store of all the questions currently loaded hashed by
// a unique identifier
var questions = {};

// Array of the questions that match the currenty filters
let filtered_questions = [];

// Object which stores the inverse of the filtered questions array
// Allows the lookup of a questions hash by its current number.
var hash_n_map = {};

// Exam mode hash map
var exam_hash_n_map = {};

// uid of the currently loaded question
let current_question_uid = 0;

var search_string = false;
var search_metadata_only = false;

var show_answered_questions = true;
var show_only_flagged_questions = false;

// let questions_answered = 0;
// let questions_correct = 0;

var last_answered_question = false;

var min_colour_diff = 0.6;

let store = false;

// Initialize global exam result variables
window.viewing_past_results = false;
window.past_exam_id = null;

// Exam mode variables
let exam_mode = false;
let exam_questions = [];
let exam_questions_data = {}; // Separate storage for exam question data
let exam_answers = {};
let exam_start_time = null;
let exam_end_time = null;
let exam_timer_interval = null;
window.current_exam_id = null;
let exam_review_mode = false;
let exam_time_per_question = 1.5;
let current_exam_question_index = 0;

var db = new Dexie("user_interface");
db.version(1).stores({
  element_position: "[type+element],x,y",
  answers: "qid,date,type,score,max_score,other",
  flagged: "&qid",
  exams: "&id,date,num_questions,time_per_question,selection_method,questions,answers,score,cached_questions",
  cached_questions: "&qid,source"
});

db.open().then(() => {
  // Check if cached_questions table exists
  if (!db.cached_questions) {
    console.warn('cached_questions table missing, resetting database');
    return Dexie.delete('user_interface').then(() => {
      console.log('Database deleted. Reloading page...');
      window.location.reload();
    });
  }
}).catch(error => {
  console.error('Database open error:', error);
  // If we get an upgrade error or constraint error, try to delete and recreate the database
  if (error.name === 'UpgradeError' || 
      error.name === 'ConstraintError' ||
      error.name === 'VersionError' ||
      error.message.includes('Dexie specification of currently installed DB version is missing') ||
      error.message.includes('Index named') && error.message.includes('already exists')) {
    console.warn('Database upgrade failed. Attempting to reset database...');
    return Dexie.delete('user_interface').then(() => {
      console.log('Database deleted. Reloading page...');
      window.location.reload();
    });
  }
  throw error;
});

// Exam state persistence functions
function saveExamState() {
  if (!exam_mode || !window.current_exam_id) return;
  
  try {
    localStorage.setItem('active_exam_id', window.current_exam_id);
    
    // Update the current exam record with session state
    db.exams.update(window.current_exam_id, {
      current_question_index: current_exam_question_index,
      last_updated: new Date().toISOString()
    }).then(updated => {
      if (updated === 0) {
        console.warn('saveExamState: No exam record found to update for ID:', window.current_exam_id);
      }
    }).catch(err => {
      console.warn('Failed to save exam session state:', err);
    });
  } catch (err) {
    console.warn('Failed to save exam state:', err);
  }
}

function deactivateAllExamSessions() {
  try {
    localStorage.removeItem('active_exam_id');
  } catch (err) {
    console.warn('Failed to clear active exam ID:', err);
  }
}

function restoreExamState() {
  try {
    const activeExamId = localStorage.getItem('active_exam_id');
    if (!activeExamId) return Promise.resolve(false);
    
    return db.exams.get(activeExamId).then(exam => {
      if (!exam) {
        localStorage.removeItem('active_exam_id');
        return false;
      }
      
      // Load cached questions for reproducibility
      if (exam.cached_questions) {
        exam_questions_data = {}; // Clear any previous exam data
        exam.cached_questions.forEach(cached => {
          exam_questions_data[cached.id] = cached.data;
        });
      }
      
      // Restore exam state
      exam_mode = true;
      exam_review_mode = false; // Active sessions are never in review mode
      exam_questions = exam.questions;
      exam_answers = exam.answers || {};
      window.current_exam_id = exam.id;
      exam_time_per_question = exam.time_per_question;
      current_exam_question_index = exam.current_question_index || 0;
      
      // Calculate remaining time
      const startTime = new Date(exam.date);
      const totalTimeMs = exam.num_questions * exam.time_per_question * 60 * 1000;
      const elapsedMs = Date.now() - startTime.getTime();
      const remainingMs = Math.max(0, totalTimeMs - elapsedMs);
      
      exam_start_time = new Date(Date.now() - elapsedMs); // Adjust start time so timer shows correct remaining time
      exam_end_time = new Date(Date.now() + remainingMs);
      
      // Rebuild hash map
      exam_hash_n_map = {};
      exam_questions.forEach((qid, index) => {
        exam_hash_n_map[qid] = index;
      });
      
      return true;
    }).catch(err => {
      console.warn('Failed to restore exam state:', err);
      localStorage.removeItem('active_exam_id');
      return false;
    });
  } catch (err) {
    console.warn('Failed to restore exam state:', err);
    localStorage.removeItem('active_exam_id');
    return Promise.resolve(false);
  }
}

function clearExamState() {
  try {
    localStorage.removeItem('active_exam_id');
  } catch (err) {
    console.warn('Failed to clear active exam ID:', err);
  }
  
  if (window.current_exam_id) {
    // Clear session state from the current exam record
    db.exams.update(window.current_exam_id, {
      current_question_index: undefined,
      last_updated: undefined
    }).catch(err => {
      console.warn('Failed to clear exam session state:', err);
    });
  }
}

// Helper: fetch a resource as text and try to parse JSON leniently.
// Returns a Promise that resolves with the parsed object, and calls
// successCallback(parsed, 'success') if provided. If parsing fails the
// failCallback is called and the promise is rejected.
function fetchJsonLenient(url, successCallback, failCallback) {
  return new Promise(function (resolve, reject) {
    $.ajax({ url: url, dataType: 'text', cache: false })
      .done(function (raw) {
        var parsed = null;
        // 1) Try direct parse
        try {
          parsed = JSON.parse(raw);
        } catch (e1) {
          // 2) Strip any injected <script>...</script> blocks and try again
          try {
            var withoutScripts = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').trim();
            parsed = JSON.parse(withoutScripts);
          } catch (e2) {
            // 3) Fallback: extract the first {...} or [...] chunk and try to parse that
            try {
              var objMatch = raw.match(/\{[\s\S]*\}/);
              var arrMatch = raw.match(/\[[\s\S]*\]/);
              var candidate = objMatch ? objMatch[0] : (arrMatch ? arrMatch[0] : null);
              if (candidate) parsed = JSON.parse(candidate);
            } catch (e3) {
              parsed = null;
            }
          }
        }

        if (parsed !== null) {
          if (typeof successCallback === 'function') {
            try { successCallback(parsed, 'success'); } catch (err) { console.error('successCallback error', err); }
          }
          resolve(parsed);
        } else {
          if (typeof failCallback === 'function') try { failCallback(); } catch (err) { console.error('failCallback error', err); }
          reject(new Error('Failed to parse JSON from ' + url));
        }
      })
      .fail(function (jqxhr, status, err) {
        if (typeof failCallback === 'function') try { failCallback(); } catch (err2) { console.error('failCallback error', err2); }
        reject(new Error('Request failed for ' + url + ' : ' + status));
      });
  });
}

window.db = db;

window.element_positions = {
  //rapid: { "answer-block": { x: 0, y: 0 } }
};

// Load saved UI element positions into local memory
db.element_position.each(data => {
  if (data == undefined) {
    return;
  }

  // Create object / dict as required
  if (!window.element_positions.hasOwnProperty(data.type)) {
    window.element_positions[data.type] = {};
  }
  if (!window.element_positions[data.type].hasOwnProperty(data.element)) {
    window.element_positions[data.type][data.element] = {};
  }

  window.element_positions[data.type][data.element] = { x: data.x, y: data.y };
}).catch(error => {
  console.warn('Error loading element positions from database:', error);
});

var remote_store = false;
var remote_store_synced = false;
var remote_data = {};

var control_pressed = false;

// Settings regarding labelling questions
var similarity_limit = 0.8;

var image_viewer = "cornerstone";

var preload_images = 5;

// This function handles any unhandled promise rejections
const globalPromiseRejectionHandler = (event) => {
  console.log('Unhandled promise ', event);
  console.log('Unhandled promise rejection reason: ', event.reason);
  alert("Unhandled promised. This probably means your database is out of date and no valid upgrade path is found (you will probably need to clear site data)")
}

// Here we assign our handler to the corresponding global, window property
window.onunhandledrejection = globalPromiseRejectionHandler;

function loadExtraQuestionsCallback(i) {
  return function (e) {
    loadExtraQuestions(i);
    saveLoadedQuestionSet(i);
    $("#options").slideUp("slow");
  };
}

async function buildQuestionList(data, textStatus) {
  console.log("Building question list", data);
  let list = data["questions"];
  list.sort();

  // Ensure the container is empty and add a small live-filter input
  const $container = $("#extra-questions");
  $container.empty();

  $container.append("<h3>Load extra questions</h3>");

  $container.append(
    $(document.createElement('input')).attr({
      type: 'text',
      id: 'extra-questions-filter',
      placeholder: 'Filter packets',
      'aria-label': 'Filter packets'
    }).css({ width: '100%', margin: '6px 0', padding: '6px', boxSizing: 'border-box' })
  );

  // Each packet gets its own row; show a status badge if already cached
  for (let key in list) {
    const f = list[key];
    const displayName = f.replace(/_/g, ' ');

    const $row = $(document.createElement('div')).addClass('question-load-row');

    const $btn = $(document.createElement('button'))
      .attr({ type: 'button', class: 'question-load-button', title: displayName, 'data-source': f })
      .text(displayName);

    const $status = $(document.createElement('span')).addClass('packet-status').text('');
    const $delete = $(document.createElement('button')).attr({'data-source': f}).addClass('packet-delete').text('Unload').css({marginLeft: '8px', fontSize: '12px', display: 'none'});

    // Click handler sets loading state then calls the loader
    const handler = loadExtraQuestionsCallback("questions/" + f);
    $btn.click(function (e) {
      try { $btn.prop('disabled', true); } catch (err) {}
      $status.removeClass('loaded').text('Loading...');
      try { handler(e); } catch (err) { console.warn('load handler failed', err); }
    });

    // Delete cached packet handler (best-effort)
    $delete.click(function () {
      if (!confirm('Delete cached questions for "' + displayName + '"?')) return;
      db.cached_questions.where('source').equals(f).toArray().then(cachedQuestions => {
        const qidsToRemove = cachedQuestions.map(cq => cq.qid);
        return db.cached_questions.where('source').equals(f).delete().then(() => {
          qidsToRemove.forEach(qid => delete questions[qid]);
          filtered_questions = filtered_questions.filter(qid => !qidsToRemove.includes(qid));
          // Refresh UI
          updatePacketRowStatuses();
          setUpFilters();
          buildActiveScoreList();
          toastr.info('Deleted cached questions from ' + displayName);
        });
      }).catch(err => {
        console.warn('Failed to delete cached questions for', f, err);
        toastr.error('Failed to delete cached questions for ' + displayName);
      });
    });

    // Keep $delete as a sibling of $status so .text()/.empty() on $status can never remove it
    $row.append($btn).append($status).append($delete);
    $container.append($row);
    // refresh unload button count for this packet
    try { updateUnloadCount(f); } catch (e) { /* ignore */ }
  }

  // Wire up a live filter for the add-packet / extra-questions rows
  $(document).off('input', '#extra-questions-filter');
  $(document).on('input', '#extra-questions-filter', function () {
    const q = ($(this).val() || '').toLowerCase().trim();
    $container.find('.question-load-row').each(function () {
      const txt = ($(this).find('.question-load-button').text() || '').toLowerCase();
      if (q === '' || txt.indexOf(q) !== -1) {
        $(this).show();
      } else {
        $(this).hide();
      }
    });
  });

  // Update all packet row statuses from the DB
  updatePacketRowStatuses();
}

// Update the UI status for packet rows based on what is cached in IndexedDB
function updatePacketRowStatuses() {
  // Best-effort: if cached_questions store missing, skip
  if (!Array.isArray(db.tables)) return;
  const hasCachedTable = db.tables.find(t => t.name === 'cached_questions');
  if (!hasCachedTable) return;

  db.cached_questions.toArray().then(all => {
    const sources = {};
    all.forEach(cq => {
      sources[cq.source] = (sources[cq.source] || 0) + 1;
    });

    $('.question-load-button').each(function () {
      const $btn = $(this);
      const src = $btn.attr('data-source');
      const $row = $btn.closest('.question-load-row');
      const $status = $row.find('.packet-status');
      const $delete = $row.find('.packet-delete');
      if (sources[src]) {
        $status.addClass('loaded').text('');
        $btn.addClass('loaded-packet').prop('disabled', false);
        $delete.show();
        try { updateUnloadCount(src); } catch (e) {}
      } else {
        $status.removeClass('loaded').text('');
        $btn.removeClass('loaded-packet');
        $delete.hide();
        try { updateUnloadCount(src); } catch (e) {}
      }
    });
  }).catch(err => {
    console.warn('updatePacketRowStatuses failed', err);
  });
}

// Mark a specific packet row as loaded (show unload button and clear loading text)
function markPacketLoaded(source) {
  try {
    const $btn = $(".question-load-button[data-source='" + source + "']");
    if ($btn.length === 0) return;
    const $row = $btn.closest('.question-load-row');
    const $status = $row.find('.packet-status');
    const $delete = $row.find('.packet-delete');
    // Clear loading text and show the unload button (which is a sibling, not a child)
    $status.removeClass('loading').text('');
    $btn.prop('disabled', false);
    $delete.show();
  } catch (e) { console.warn('markPacketLoaded failed', e); }
}

function markPacketFailed(source) {
  try {
    const $btn = $(".question-load-button[data-source='" + source + "']");
    if ($btn.length === 0) return;
    const $row = $btn.closest('.question-load-row');
    const $status = $row.find('.packet-status');
    const $delete = $row.find('.packet-delete');
    $status.removeClass('loading').text('');
    $btn.prop('disabled', false);
    // hide unload since load failed
    if ($delete.length) $delete.hide();
  } catch (e) { console.warn('markPacketFailed failed', e); }
}

// Update the unload button label with the number of questions cached for a source
function updateUnloadCount(source) {
  try {
    if (!Array.isArray(db.tables) || !db.tables.find(t => t.name === 'cached_questions')) return;
    db.cached_questions.where('source').equals(source).count().then(cnt => {
      const $delete = $(".packet-delete[data-source='" + source + "']");
      if ($delete.length === 0) return;
      if (cnt > 0) {
        $delete.text('Unload (' + cnt + ')');
      } else {
        $delete.text('Unload');
      }
    }).catch(err => {
      console.warn('updateUnloadCount failed', err);
    });
  } catch (e) { console.warn('updateUnloadCount error', e); }
}



function loadExtraQuestions(q) {
  const source = q.split('/')[1];
  
  // First, try to load from cache for immediate display
  db.cached_questions.where('source').equals(source).toArray().then(cachedQuestions => {
    if (cachedQuestions.length > 0) {
      const data = {};
      cachedQuestions.forEach(cq => data[cq.qid] = cq.data);
      loadData(data, null).then(() => {
        // clear loading indicators and mark this packet loaded in the UI
        try { markPacketLoaded(source); } catch (e) {}
      }); // Don't re-cache
      toastr.info("Loaded " + cachedQuestions.length + " questions from cache");
      
      // Try to update cache in background
      fetchJsonLenient(q, function(newData) {
        loadData(newData, source).then(() => { try { markPacketLoaded(source); } catch (e) {} }); // This will cache the new data
      }, function() {
        // Network failed, but we have cache
        try { markPacketFailed(source); } catch (e) {}
      }).catch(function() { try { markPacketFailed(source); } catch (e) {} });
    } else {
      // No cache, fetch from network
      fetchJsonLenient(q, function(data) {
        loadData(data, source).then(() => { try { markPacketLoaded(source); } catch (e) {} });
        toastr.info(Object.size(data) + " questions loaded");
      }, function() {
        try { markPacketFailed(source); } catch (e) {}
        toastr.warning("Unable to load questions<br/><br/>Perhaps you wish to try loading them manually?");
      }).catch(function() { try { markPacketFailed(source); } catch (e) {} });
    }
  }).catch(() => {
    // Cache query failed, try network
    fetchJsonLenient(q, function(data) {
      loadData(data, source).then(() => { try { markPacketLoaded(source); } catch (e) {} });
      toastr.info(Object.size(data) + " questions loaded");
    }, function() {
      try { markPacketFailed(source); } catch (e) {}
      toastr.warning("Unable to load questions<br/><br/>Perhaps you wish to try loading them manually?");
    }).catch(function() { try { markPacketFailed(source); } catch (e) {} });
  });
}

async function loadData(data, source) {
  console.log('loadData: start');
  $.extend(questions, data);
  // Store individual questions in cache
  if (source) {
    // If the DB doesn't have the cached_questions store (older DB schema),
    // avoid attempting to write and surface a clear warning. Use db.tables
    // (provided by Dexie) to detect available stores.
    const hasCachedTable = Array.isArray(db.tables) && db.tables.find(t => t.name === 'cached_questions');
    if (!hasCachedTable) {
      console.warn('cached_questions store not present in IndexedDB, skipping caching for source:', source);
      try { toastr.warning('Local cache store missing; skipping question caching for this session.'); } catch (err) {}
    } else {
      for (let qid in data) {
        try {
          await db.cached_questions.put({qid: qid, source: source, data: data[qid], last_updated: new Date()});
        } catch (e) {
          console.warn('Failed to cache question', qid, e);
          // If the underlying error indicates the object store is missing, attempt
          // to recover by deleting the DB and reloading so the correct schema is created.
          try {
            const msg = String(e && e.message || '');
            if (/not a known object store name/i.test(msg) || /object store/i.test(msg)) {
              console.warn('Detected missing object store in IndexedDB; attempting database reset');
              try { toastr.warning('Local IndexedDB appears corrupted or out-of-date. Clearing local DB and reloading to recover.'); } catch (err) {}
              try { await Dexie.delete('user_interface'); } catch (delErr) { console.warn('Failed to delete DB during recovery', delErr); }
              // Reload the page to recreate DB with proper schema
              window.location.reload();
              return;
            }
          } catch (inner) { /* ignore recovery errors */ }
        }
      }
      // Refresh packet row statuses
      updatePacketRowStatuses();
    }
  }
  // Ensure filters and filtered_questions are fully loaded before building the score list
  try {
    await setUpFilters();
  } catch (e) {
    // If setUpFilters doesn't return a promise for some reason, fall back to calling it without await
    try { setUpFilters(); } catch (err) { console.warn('setUpFilters failed', err); }
  }

  await buildActiveScoreList();
  console.log('loadData: buildActiveScoreList completed');
}

// Expose loadData to non-module scripts (some legacy scripts like fileload.js
// expect this function on the global window object)
window.loadData = loadData;

/**
 * Load answers/flagged data from a file into the local DB.
 * fileload.js calls this on file load. Provide a minimal, resilient
 * implementation so the legacy file loader works when `s.js` is loaded
 * as a module.
 */
async function loadAnswersAndFeedback(obj) {
  if (!obj) return;

  try {
    if (Array.isArray(obj.answers)) {
      for (const a of obj.answers) {
        // Use put so existing entries are updated or created
        await db.answers.put(a);
      }
    }

    if (Array.isArray(obj.flagged_questions)) {
      for (const f of obj.flagged_questions) {
        // Accept either an object with qid or a primitive
        const qid = f && (f.qid || f);
        if (qid !== undefined) {
          await db.flagged.put({ qid: qid });
        }
      }
    }

    // Refresh UI to reflect newly loaded answers/flags
    loadFilters();
    buildActiveScoreList();
    toastr.info("Answers loaded.");
  } catch (err) {
    console.error("Error loading answers:", err);
    toastr.warning("Unable to load answers file.");
  }
}

// Expose for legacy callers
window.loadAnswersAndFeedback = loadAnswersAndFeedback;

var detectTap;
$(document).off('touchstart').on('touchstart', function () {
  detectTap = true; // Detects all touch events
});
$(document).off('touchmove').on('touchmove', function () {
  detectTap = false; // Excludes the scroll events from touch events
});

$(document).ready(function () {
  // TODO: conside switching the following all to indexdb
  // Load lawnchair store
  // ereader
  store = new Lawnchair({ adapter: "dom", name: "jquiz" }, function (store) { });

  //Populate version info
  $("#version-info").text("version: " + quiz_version);

  toastr.options.positionClass = "toast-bottom-right";

  $("#loading").addClass("show");
  // Ensure the score control is disabled by default until questions are loaded
  try {
    const $scoreToggleInit = $("#score-toggle");
    $scoreToggleInit.addClass('disabled');
    $scoreToggleInit.find('button').prop('disabled', true).attr('aria-disabled', 'true');
    console.log('score-toggle initialised as disabled');
  } catch (e) {
    console.warn('Unable to initialise score-toggle disabled state', e);
  }

    // FONT SIZE: apply persisted or default font size and wire controls
    (function () {
      try {
        const key = 'jquizer-font-size';
        const root = document.documentElement;
        const range = document.getElementById('font-size-range');
        const presets = document.querySelectorAll('.font-size-preset');

        function applySize(px) {
          if (!px) return;
          root.style.setProperty('--base-font-size', px + 'px');
          // update numeric readout if present
          try {
            const el = document.getElementById('font-size-value');
            if (el) el.textContent = String(px) + 'px';
          } catch (e) {}
        }

        // Initialize from storage
        try {
          const saved = localStorage.getItem(key);
          const initial = saved ? parseInt(saved, 10) : null;
          if (initial) applySize(initial);
          // If range exists set its value from saved or computed
          if (range) {
            const computed = parseInt(getComputedStyle(root).getPropertyValue('--base-font-size')) || 16;
            range.value = initial || computed || 16;
            range.addEventListener('input', function (e) {
              const v = parseInt(e.target.value, 10);
              applySize(v);
              try { localStorage.setItem(key, String(v)); } catch (err) {}
            });
            // Set initial readout
            try { const rEl = document.getElementById('font-size-value'); if (rEl) rEl.textContent = String(range.value) + 'px'; } catch (e) {}
          }

          if (presets && presets.length) {
            presets.forEach(function (b) {
              b.addEventListener('click', function () {
                const s = parseInt(b.getAttribute('data-size'), 10);
                applySize(s);
                if (range) range.value = s;
                try { localStorage.setItem(key, String(s)); } catch (err) {}
              });
            });
          }
        } catch (e) {
          console.warn('Font size init failed', e);
        }
      } catch (e) {
        // ignore if DOM not ready or elements missing
      }
    })();

    // PAGE WIDTH: apply persisted or default page width (percent of viewport) and wire controls
    ;(function () {
      try {
        const key = 'jquizer-content-width-percent';
        const root = document.documentElement;
        const range = document.getElementById('page-width-range');
        const presets = document.querySelectorAll('.page-width-preset');

        function applyWidthPercent(pct) {
          if (!pct) return;
          // clamp and coerce to integer
          let n = parseInt(pct, 10);
          if (isNaN(n)) return;
          if (n < 20) n = 20;
          if (n > 200) n = 200;
          root.style.setProperty('--content-width-percent', String(n));
          // update numeric readout if present
          try {
            const el = document.getElementById('page-width-value');
            if (el) el.textContent = String(n) + '%';
          } catch (e) {}
        }

        // Initialize from storage
        try {
          const saved = localStorage.getItem(key);
          const initial = saved ? parseInt(saved, 10) : null;
          if (initial) applyWidthPercent(initial);
          if (range) {
            const computed = parseInt(getComputedStyle(root).getPropertyValue('--content-width-percent')) || 80;
            range.value = initial || computed || 80;
            range.addEventListener('input', function (e) {
              const v = parseInt(e.target.value, 10);
              applyWidthPercent(v);
              try { localStorage.setItem(key, String(v)); } catch (err) {}
            });
            // Set initial readout
            try { const pEl = document.getElementById('page-width-value'); if (pEl) pEl.textContent = String(range.value) + '%'; } catch (e) {}
          }

          if (presets && presets.length) {
            presets.forEach(function (b) {
              b.addEventListener('click', function () {
                const s = parseInt(b.getAttribute('data-percent'), 10);
                applyWidthPercent(s);
                if (range) range.value = s;
                try { localStorage.setItem(key, String(s)); } catch (err) {}
              });
            });
          }
        } catch (e) {
          console.warn('Page width init failed', e);
        }
      } catch (e) {
        // ignore if DOM not ready or elements missing
      }
    })();
  // Ensure the question-details control is disabled by default until a question is open
  try {
    const $qToggleInit = $("#question-details-toggle");
    $qToggleInit.addClass('disabled');
    $qToggleInit.find('button').prop('disabled', true).attr('aria-disabled', 'true');
    console.log('question-details-toggle initialised as disabled');
  } catch (e) {
    console.warn('Unable to initialise question-details-toggle disabled state', e);
  }

  // Hotkeys: allow quick access to main toggles using Alt+<key>
  // Alt+O: Options, Alt+S: Score, Alt+T: Stats, Alt+Q: Question details
  // Alt+G: Goto/Search, Alt+A: About
  document.addEventListener('keydown', function (ev) {
    try {
      // Ignore when typing into inputs, textareas, selects or contenteditable regions
      // but allow hotkeys if the focused element is inside the exam panel so
      // Alt+E / Alt+X can open/close the exam panel even when its inputs are focused.
      const tg = ev.target;
      if (!tg) return;
      const tag = (tg.tagName || '').toUpperCase();
      // Allow hotkeys when focus is inside common panels so Alt+key still
      // toggles the panel even if an input there has focus (e.g. search, exam).
      const allowedPanels = '#exam-menu, #search-menu, #options, #question-details, #exam-results-modal';
      const isInsideAllowedPanel = (typeof tg.closest === 'function' && tg.closest(allowedPanels)) ? true : false;
      if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tg.isContentEditable) && !isInsideAllowedPanel) return;

      // We use Alt+key to avoid interfering with common letter keys
      if (!ev.altKey || ev.ctrlKey || ev.metaKey) return;

      const key = (ev.key || '').toLowerCase();
      const mapping = {
        'o': '#filter-toggle button',
        's': '#score-toggle button',
        't': '#stats-toggle button',
        'q': '#question-details-toggle a, #question-details-toggle button',
        'g': '#search-toggle-button',
        'e': '#exam-toggle-button',
        'x': '#exam-toggle-button',
        'a': '#about-toggle a, #about-toggle button'
      };

      const sel = mapping[key];
      if (!sel) return;
      const el = document.querySelector(sel);
      if (!el) return;
      ev.preventDefault();
      // Let the toggle button handle open/close for both Alt+E and Alt+X
      // For accessibility, attempt to focus then click
      try { el.focus && el.focus(); } catch (e) {}
      try { el.click && el.click(); } catch (e) { console.warn('Hotkey click failed', e); }
    } catch (e) {
      // swallow errors from hotkey handler
    }
  });

  fetchJsonLenient("questions/question_list", buildQuestionList, function () {
    toastr.warning(
      "Unable to load questions list<br/><br/>Perhaps you wish to try loading them manually?"
    );
    console.log("Unable to load question list");
  }).catch(function () { /* ignore */ });

  // Load cached questions into the system
  db.cached_questions.toArray().then(cached => {
    if (cached.length > 0) {
      const data = {};
      cached.forEach(cq => data[cq.qid] = cq.data);
      loadData(data, null); // Don't cache again
      toastr.info("Loaded " + cached.length + " cached questions");
    }
  }).catch(err => {
    console.warn('Error loading cached questions', err);
  });

  $("#loading").removeClass("show");

  $("#filter-toggle").off('click').on('click', function () {
    $("#options").slideToggle("slow");
  });

  // Dedicated close button handler: stop propagation and explicitly close options
  $(".hide-options-button").on('click', function (e) {
    console.log('hide-options-button clicked');
    e.stopPropagation();
    $("#options").slideUp("slow");
    try { $("#filter-toggle button").focus(); } catch (err) { /* ignore */ }
  });

  $("#question-details-toggle").off('click').on('click', function () {
    const container = $("#question-details-toggle");
    if (container.hasClass('disabled')) {
      toastr.info('No question open');
      return;
    }
    $("#question-details").slideToggle("slow");
  });

  // Prevent any anchor inside the question-details-toggle from doing anything while disabled
  $(document).on('click', '#question-details-toggle a', function (e) {
    const container = $(this).closest('#question-details-toggle');
    if (container.hasClass('disabled')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  });

  // Gapps removed: hide remote-server button and disable handler
  $("#load-remote-server-button").remove();

  $("#score-toggle").off('click').on('click', function () {
    const container = $("#score-toggle");
    if (container.hasClass('disabled')) {
      toastr.info('No questions loaded');
      return;
    }
    // Toggle the score panel and persist the visible state in localStorage
    $("#score").slideToggle("slow", function () {
      try {
        const visible = $(this).is(":visible");
        localStorage.setItem('score_open', visible ? '1' : '0');
      } catch (e) {
        console.warn('Unable to persist score_open', e);
      }
    });
  });

  $("#about-toggle, #about-close").off('click').on('click', function () {
    $("#about").slideToggle("slow");
  });
  // Stats dialog handlers
  $("#stats-toggle").off('click').on('click', function () {
    $("#stats").slideToggle("slow");
    // build stats each time to reflect current answers
    buildStatsBySpecialty();
  });
  $("#stats-close").off('click').on('click', function () {
    $("#stats").slideToggle("slow");
  });

  $("#goto-question-button").off('click').on('click', function () {
    let val = $("#goto-question-input").val();
    if (val && !isNaN(val)) {
      loadQuestion(parseInt($("#goto-question-input").val()) - 1);
      $("#goto-question-input").blur();
      // Close the search/goto overlay so the user returns to the question view
      try {
        $("#search-menu").removeClass('show').attr('aria-hidden', 'true');
      } catch (e) { /* ignore */ }
    } else {
      toastr.warning("Invalid question.");
    }
  });

  $("#goto-question-hide-button").off('click').on('click', function () {
    //duplicate stuff....
    let val = $("#goto-question-input").val();
    if (val && !isNaN(val)) {
      loadQuestion(parseInt($("#goto-question-input").val()) - 1);
      $("#goto-question-input").blur();
    } else {
      toastr.warning("Invalid question.");
    }
    $("#goto-question-input").blur();
    // Ensure the search/goto overlay is closed after navigating
    try {
      $("#search-menu").removeClass('show').attr('aria-hidden', 'true');
    } catch (e) { /* ignore */ }
  });

  $("#search-button").off('click').on('click', function () {
    startSearch($("#search-input").val());
    $("#search-input").blur();
  });

  $("#create-exam-button").off('click').on('click', function () {
    createExam();
  });

  $("#delete-answers-button").off('click').on('click', function () {
    resetAnswers();
  });

  $("#save-answers-button").off('click').on('click', function () {
    saveAnswersAsFile();
  });

  $("#unload-questions-button").off('click').on('click', function () {
    if (confirm('Clear all cached questions from all sources? This will remove them from both cache and memory.')) {
      // Get all cached questions
      db.cached_questions.toArray().then(allCached => {
        if (allCached.length === 0) {
          toastr.info('No cached questions to clear');
          return;
        }
        
        const qidsToRemove = allCached.map(cq => cq.qid);
        
        // Clear all cached questions from IndexedDB
        db.cached_questions.clear().then(() => {
          // Also remove from memory
          qidsToRemove.forEach(qid => {
            delete questions[qid];
          });
          
          // Update filtered_questions to remove deleted questions
          filtered_questions = filtered_questions.filter(qid => !qidsToRemove.includes(qid));
          
          // Reset current question if it was deleted
          if (qidsToRemove.includes(current_question_uid)) {
            current_question_uid = filtered_questions.length > 0 ? filtered_questions[0] : 0;
          }
          
          toastr.info('Cleared all ' + allCached.length + ' cached questions from all sources');
          updatePacketRowStatuses(); // Refresh packet row statuses
          
          // Rebuild UI if questions were removed
          if (qidsToRemove.length > 0) {
            setUpFilters();
            buildActiveScoreList();
            // If current question was deleted, load the first available question
            if (filtered_questions.length > 0 && !questions[current_question_uid]) {
              loadQuestion(filtered_questions[0]);
            }
          }
        });
      });
    }
  });

  $("#reset-app-button").off('click').on('click', function () {
    resetApp();
  });

  $("#answers-file").off('change').on('change', handleAnswersFileSelect);

  $("#questions-file").off('change').on('change', handleQuestionsFileSelect);

  progress = document.querySelector(".percent");

  $(document).off('keydown').on('keydown', keyDownHandler);
  $(document).off('keyup').on('keyup', keyUpHandler);

  // Normalize score list items that may have inline background-color styles
  // Convert inline background-color into a border color and remove the background
  function normalizeScoreListInlineColors() {
    try {
      const root = document.querySelector('#score-list');
      if (!root) return;
      const items = root.querySelectorAll('li');
      items.forEach(function (li) {
        // Prefer inline style if present, otherwise computed style
        let bg = li.style.backgroundColor || getComputedStyle(li).backgroundColor;
        if (!bg) return;
        // ignore explicit transparent values
        if (bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return;

        // Apply the color to the border and remove the inline background so our CSS shows through
        try {
          // Force border color/width/style with important to take precedence over other rules
          li.style.setProperty('border-color', bg, 'important');
          li.style.setProperty('border-style', 'dashed', 'important');
          li.style.setProperty('border-width', '2px', 'important');
          // Clear any background fill (force transparent)
          li.style.setProperty('background-color', 'transparent', 'important');
          li.style.setProperty('background-image', 'none', 'important');

          // Ensure text remains visible on the console background
          const rootFg = getComputedStyle(document.documentElement).getPropertyValue('--console-fg') || '';
          if (rootFg) li.style.setProperty('color', rootFg.trim(), 'important');
        } catch (e) {
          // Fallback to non-important assignments if setProperty fails
          li.style.borderColor = bg;
          li.style.backgroundColor = 'transparent';
          li.style.backgroundImage = 'none';
          try {
            const rootFg = getComputedStyle(document.documentElement).getPropertyValue('--console-fg') || '';
            if (rootFg) li.style.color = rootFg.trim();
          } catch (e2) { /* ignore */ }
        }
      });
    } catch (e) {
      console.warn('normalizeScoreListInlineColors failed', e);
    }
  }

  // Run once on DOM ready and watch for score-list updates
  document.addEventListener('DOMContentLoaded', function () {
    // Restore exam state if there was an active exam
    restoreExamState().then(examRestored => {
      if (examRestored) {
        // If exam was restored, start the timer and load the current question
        startExamTimer();
        // Load the current question that was being viewed
        loadExamQuestion(current_exam_question_index);
        toastr.info('Exam session restored');
      }
    }).catch(err => {
      console.warn('Failed to restore exam state on page load:', err);
    });
    
    normalizeScoreListInlineColors();
    const scoreList = document.querySelector('#score-list');
    if (!scoreList) return;
    const mo = new MutationObserver(function () {
      normalizeScoreListInlineColors();
    });
    mo.observe(scoreList, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  });

  //$.getJSON("../sbas/question/json/all", loadData).fail(function(jqxhr, textStatus, error) {
  // Autoload removed - questions loaded on demand
      $("#loading").removeClass("show");

      $("#filter-toggle").off('click').on('click', function () {
        $("#options").slideToggle("slow");
      });

      $("#question-details-toggle").off('click').on('click', function () {
        const container = $("#question-details-toggle");
        if (container.hasClass('disabled')) {
          toastr.info('No question open');
          return;
        }
        $("#question-details").slideToggle("slow");
      });

      // Prevent any anchor inside the question-details-toggle from doing anything while disabled
      $(document).on('click', '#question-details-toggle a', function (e) {
        const container = $(this).closest('#question-details-toggle');
        if (container.hasClass('disabled')) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      });

      // Gapps removed: hide remote-server button and disable handler
      $("#load-remote-server-button").remove();

      $("#score-toggle").off('click').on('click', function () {
        const container = $("#score-toggle");
        if (container.hasClass('disabled')) {
          toastr.info('No questions loaded');
          return;
        }
        // Toggle the score panel and persist the visible state in localStorage
        $("#score").slideToggle("slow", function () {
          try {
            const visible = $(this).is(":visible");
            localStorage.setItem('score_open', visible ? '1' : '0');
          } catch (e) {
            console.warn('Unable to persist score_open', e);
          }
        });
      });

      $("#about-toggle, #about-close").off('click').on('click', function () {
        $("#about").slideToggle("slow");
      });
      // Stats dialog handlers
      $("#stats-toggle").off('click').on('click', function () {
        $("#stats").slideToggle("slow");
        // build stats each time to reflect current answers
        buildStatsBySpecialty();
      });
      $("#stats-close").off('click').on('click', function () {
        $("#stats").slideToggle("slow");
      });

      $("#goto-question-button").off('click').on('click', function () {
        let val = $("#goto-question-input").val();
        if (val && !isNaN(val)) {
          loadQuestion(parseInt($("#goto-question-input").val()) - 1);
          $("#goto-question-input").blur();
          // Close the search/goto overlay so the user returns to the question view
          try {
            $("#search-menu").removeClass('show').attr('aria-hidden', 'true');
          } catch (e) { /* ignore */ }
        } else {
          toastr.warning("Invalid question.");
        }
      });

      $("#goto-question-hide-button").off('click').on('click', function () {
        //duplicate stuff....
        let val = $("#goto-question-input").val();
        if (val && !isNaN(val)) {
          loadQuestion(parseInt($("#goto-question-input").val()) - 1);
          $("#goto-question-input").blur();
        } else {
          toastr.warning("Invalid question.");
        }
        $("#goto-question-input").blur();
        // Ensure the search/goto overlay is closed after navigating
        try {
          $("#search-menu").removeClass('show').attr('aria-hidden', 'true');
        } catch (e) { /* ignore */ }
      });

      $("#search-button").off('click').on('click', function () {
        startSearch($("#search-input").val());
        $("#search-input").blur();
      });

      $("#create-exam-button").off('click').on('click', function () {
        createExam();
      });

      $("#delete-answers-button").off('click').on('click', function () {
        resetAnswers();
      });

      $("#save-answers-button").off('click').on('click', function () {
        saveAnswersAsFile();
      });

      $("#toggle-css").click(function () {
        $("#dark-css").prop("disabled", function (i, v) {
          return !v;
        });
        $("#light-css").prop("disabled", function (i, v) {
          return !v;
        });
      });

      $("#reset-ui-btn").click(e => {
        window.element_positions = {};
        db.element_position
          .clear()
          .then(() => {
            console.log("Table cleared successfully");
          })
          .catch(err => {
            console.error("Could not clear the table:", err);
          })
          .finally(() => {
            // Do what should be done next...
          });
      });
      $("#reset-app-button").off('click').on('click', function () {
        resetApp();
      });

      $("#randomise-question-order-btn").click(e => {
        shuffle(filtered_questions);
        saveLoadedQuestionSetOrder(filtered_questions);
        loadFilters();
        loadQuestion(0);
      });

      $("#answers-file").off("change").on("change", handleAnswersFileSelect);

      $("#questions-file").off("change").on("change", handleQuestionsFileSelect);

      progress = document.querySelector(".percent");

      //$(document).keypress(keyPress);
      $(document).off('keydown').on('keydown', keyDownHandler);
      $(document).off('keyup').on('keyup', keyUpHandler);
    });

  //loadAnswersFromStorage();

  //loadFlaggedQuestionsFromStorage();

  // Ensure the swipe handler is attached after the DOM is ready so
  // `#content` exists (this used to attach too early and therefore
  // never bound on some page loads).
  $(document).ready(function () {
    $("#content").off('swipe').swipe({
      swipeLeft: function (event, direction, distance, duration, fingerCount) {
        nextQuestion(event);
      },
      swipeRight: function (event, direction, distance, duration, fingerCount) {
        previousQuestion(event);
      },
      // Allow vertical page scrolling while still handling horizontal
      // swipes for navigation. Exclude interactive controls/links so
      // taps still work on mobile.
      allowPageScroll: 'vertical',
      excludedElements: "label, button, input, select, textarea, a, .noSwipe",
      fallbackToMouseEvents: false
    });
  });

  const beforeUnloadHandler = function (e) {
    if (remote_store == true && remote_store_synced == false) {
      var confirmationMessage =
        "Questions have not been saved remotely. Continue?";

      (e || window.event).returnValue = confirmationMessage; //Gecko + IE
      return confirmationMessage; //Webkit, Safari, Chrome
    }
  };
  window.removeEventListener("beforeunload", beforeUnloadHandler);
  window.addEventListener("beforeunload", beforeUnloadHandler);

// Track whether we've restored the score panel state from storage to avoid
// repeatedly forcing visibility during subsequent rebuilds.
var _scoreStateRestored = false;

function escaper(expression) {
  return expression
    .replace(/[!"#$%&'()*+,.\/:;<=>?@\[\\\]^`{|}~]/g, "")
    .replace(/ /g, "_");
}

Object.size = function (obj) {
  var size = 0,
    key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) size++;
  }
  return size;
};

function saveCheckboxState(id) {
  // There should be a better way to do this
  //ereader
  store.save({ key: "checkbox-" + id, value: 1 });
}

function saveOpenQuestion(n) {
  // This will fail if filters are changed
  // (may be better ot use hashes instead)
  store.save({ key: "current_question", value: n });
}

//function saveFlaggedQuestions() {
//  // JSON.stringify doesn't suport sets...
//  //db.flagged.put()
//  store.save({
//    key: "flagged_questions",
//    value: JSON.stringify([...flagged_questions])
//  });
//}

function saveLoadedQuestionSet(n) {
  // This will fail if filters are changed
  // (may be better ot use hashes instead)
  console.log("Save", n);
  store.save({ key: "current_question_set", value: n });
}

function saveLoadedQuestionSetOrder(n) {
  // This will fail if filters are changed
  console.log("Save question order", n);
  store.save({ key: "question_order", value: n });
}

function loadPreviousQuestion(n) {
  //ereader
  store.exists("current_question", function (exists) {
    if (exists) {
      store.get("current_question", function (obj) {
        n = obj["value"];
        loadQuestion(n);
      });
    } else {
      loadQuestion(0);
    }
  });
}

// Check all keys in the localStorage. If it starts with checkbox- remove it.
function clearSavedCheckboxStates() {
  //ereader
  //Object.keys(localStorage).forEach(function(key) {
  store.keys("store_keys = keys");
  for (let i in store_keys) {
    if (/^(checkbox-)/.test(store_keys[i])) {
      store.remove(store_keys[i]);
      //localStorage.removeItem(key);
    }
  }
}

// Deletes saved answers from localStorage
function resetAnswers() {
  var msg =
    "Are you sure you wish to delete all your answers?\n\nThis is non-recoverable!";

  if (confirm(msg)) {

    db.answers.clear().then(() => {
      console.log("Database successfully deleted");
    }).catch((err) => {
      console.error("Could not delete database", err);
    }).finally(() => {
      // Do what should be done next...
      loadFilters();
      buildActiveScoreList();
      $("#options").slideToggle("slow");
    });
  }
}

// Delete all local data (IndexedDB tables, localStorage, Lawnchair store)
async function resetApp() {
  var msg =
    "Are you sure you wish to reset the app?\n\nThis will delete all locally stored answers, flags, exams, UI positions and settings. This is non-recoverable!";

  if (!confirm(msg)) return;

  try {
    // Clear Dexie tables
    if (db && db.answers) await db.answers.clear();
    if (db && db.flagged) await db.flagged.clear();
    if (db && db.element_position) await db.element_position.clear();
    if (db && db.exams) await db.exams.clear();
    if (db && db.cached_questions) await db.cached_questions.clear();
  } catch (err) {
    console.warn('Error clearing IndexedDB tables', err);
  }

  try {
    // Clear Lawnchair store if present
    if (window.store) {
      try {
        if (typeof window.store.nuke === 'function') {
          window.store.nuke(function () {});
        } else if (typeof window.store.clear === 'function') {
          window.store.clear(function () {});
        } else if (typeof window.store.remove === 'function') {
          // no-op: remove individual keys isn't practical here
        }
      } catch (e) {
        console.warn('Error clearing Lawnchair store', e);
      }
    }
  } catch (err) {
    console.warn('Error clearing store', err);
  }

  try {
    // Clear localStorage
    if (window.localStorage) localStorage.clear();
  } catch (err) {
    console.warn('Error clearing localStorage', err);
  }

  // Reset in-memory state
  questions = {};
  filtered_questions = [];
  hash_n_map = {};
  current_question_uid = 0;
  
  // Reset exam state
  exam_mode = false;
  exam_questions = [];
  exam_questions_data = {};
  exam_answers = {};
  exam_start_time = null;
  exam_end_time = null;
  exam_timer_interval = null;
  window.current_exam_id = null;
  exam_review_mode = false;
  exam_time_per_question = 1.5;
  current_exam_question_index = 0;
  
  // Clear persisted exam state
  clearExamState();

  toastr.info('Local data cleared. Reloading...');
  setTimeout(function () {
    location.reload();
  }, 500);
}

// Generates the score section
async function buildActiveScoreList() {
  // TODO: Consider caching the score list so it is now rebuilt everytime
  //       a question is loaded

  let list = $("#score-list");

  // If the score list container doesn't exist there's nothing to build
  if (!list || list.length === 0) return;

  // After building the score list for the first time, restore the saved
  // open/closed state if not already restored. We do this here because
  // buildActiveScoreList runs when questions are loaded and after filters
  // are applied, making filtered_questions available.
  try {
    if (!_scoreStateRestored) {
      const saved = localStorage.getItem('score_open');
      try { console.log('Restoring score_open:', saved, 'filtered_questions.length:', Array.isArray(filtered_questions) ? filtered_questions.length : typeof filtered_questions); } catch (e) {}
      if (saved === '1') {
        // If questions are already available, show now. Otherwise poll briefly
        if (Array.isArray(filtered_questions) && filtered_questions.length > 0) {
          $("#score").show();
          try { console.log('Score panel restored: SHOW (immediate)'); } catch (e) {}
        } else {
          try { console.log('Score panel restore deferred: polling for filtered_questions'); } catch (e) {}
          // Poll for filtered_questions becoming available for up to 5 seconds
          let attempts = 0;
          const maxAttempts = 25; // 25 * 200ms = 5s
          const poll = setInterval(function () {
            attempts++;
            try {
              if (Array.isArray(window.filtered_questions) && window.filtered_questions.length > 0) {
                $("#score").show();
                try { console.log('Score panel restored: SHOW (polled)'); } catch (e) {}
                clearInterval(poll);
                return;
              }
            } catch (e) {}
            if (attempts >= maxAttempts) {
              try { console.log('Score panel restore: giving up after polling'); } catch (e) {}
              clearInterval(poll);
            }
          }, 200);
        }
      } else {
        $("#score").hide();
        try { console.log('Score panel restored: HIDE'); } catch (e) {}
      }
      _scoreStateRestored = true;
    }
  } catch (e) {
    // ignore storage errors
  }

  // Empty any previously shown scores
  list.empty();

  // Build an array of answered questions (numerical number in all questions)
  var answers = [];
  var filtered_answers = [];

  // Retrieve answers of all currently loaded questions
  answers = await window.db.answers.where("qid").anyOf(Object.keys(hash_n_map)).toArray();

  // Retrieve flagged questions
  let flagged_questions = await db.flagged.toArray();
  let flagged_qids = new Set(flagged_questions.map(f => f.qid));

  let answers_by_qid = {}

  answers.forEach(ans => {
    // TODO: multiple answers
    // currently will just use the latest....
    answers_by_qid[ans.qid] = ans;

    let filtered_answer_id = filtered_questions.indexOf(ans.qid);
    if (filtered_answer_id > -1) {
      filtered_answers.push(filtered_answer_id);
    }

  })

  let questions_correct = 0;
  let questions_answered = 0;

  // If no answered questions loaded break;
  if (filtered_answers.length < 1) {
    $("#score-percent")
      .empty()
      .append("No questions answered.");
    return;
  }

  filtered_answers.sort(function (a, b) {
    return a - b;
  });


  for (let ans in filtered_answers) {
    let i = filtered_answers[ans];

    let answer = answers_by_qid[filtered_questions[i]];

    var n = i + 1; // The question number starts from 1

    // To generate the correct colour we use HSL were
    // the hue going from 0 -> 60 - 120 represents
    // green -> yellow -> red
    let ratio = answer.score / answer.max_score;
    let hue = ratio * 120;

    let isFlagged = flagged_qids.has(filtered_questions[i]);
    let flagIndicator = isFlagged ? " 🚩" : "";

    // Create the score item with a border color based on performance (green->yellow->red)
    list.append(
      $(document.createElement("li"))
        .attr({
          id: "score-" + i,
          class: "tf" + (isFlagged ? " flagged" : ""),
          title: n + (isFlagged ? " (Flagged)" : "")
        })
        .text(
          n +
          " (" +
          answer.score +
          "/" +
          answer.max_score +
          ")" +
          flagIndicator
        )
        .css({
          // keep background transparent and set border color instead
          "background-color": "transparent",
          "background-image": "none",
          "border-color": "hsl(" + hue + ", 90%, 45%)",
          "border-style": "dashed",
          "border-width": "2px",
          "color": "var(--console-fg)"
        })
    );

    questions_correct = questions_correct + parseInt(answer.score);
    questions_answered =
      questions_answered + parseInt(answer.max_score);


    // Scores should link to their question
    $("#score-" + i).click(function (n) {
      loadQuestion(parseInt(n.currentTarget.title) - 1);
    });
  }

  // Calculate users overall score
  let percent = (questions_correct / questions_answered) * 100;

  $("#score-percent")
    .empty()
    .append(
      percent.toFixed(2) +
      "% (" +
      questions_correct +
      "/" +
      questions_answered +
      " over " +
      Object.size(filtered_answers) +
      " questions)"
    );

  let list_items = $("#score-list li");

  let truncated = false;

  // Trucate the score list
  if (list_items.length > trucate_score_list_at && show_all_scores == false) {
    list_items.hide();
    list_items.slice(-trucate_score_list_at).show();
    truncated = true;
  }

  $("#score-list").append(
    $(document.createElement("span")).attr({
      id: "toggle-score-vis"
    })
  );

  if (show_all_scores) {
    $("#toggle-score-vis")
      .text("--Show Less--")
      .click(function () {
        show_all_scores = false;
        buildActiveScoreList();
      });
  } else if (truncated) {
    $("#toggle-score-vis")
      .text("--Show More--")
      .click(function () {
        show_all_scores = true;
        buildActiveScoreList();
      });
  }
}

// Key bindings
function keyUpHandler(e) {
  if (e.key == "Control") {
    dicomViewer.registerPrimaryDicomInterface(e);
    control_pressed = false;
  }
}

function keyDownHandler(e) {
  // Ignore our custom keybindings if we are currently in a field that
  // accepts some kind of input
  if ($("*:focus:not(disabled)").is("textarea, input")) {
    // unless a modifier key is pressed (not shift)
    if (e.altKey ? true : false || e.ctrlKey ? true : false) {
    } else {
      return;
    }
  }

  if (e.key == "Control") {
    if (control_pressed == false) {
      control_pressed = true;
      dicomViewer.registerAltDicomInterface(e);
    }
  }

  var charCode = typeof e.which == "number" ? e.which : e.keyCode;
  console.log(e, charCode);

  function numberKeyPressed(e, x) {
    if (e.altKey ? true : false) {
      dicomViewer.selectThumb(x);
      e.preventDefault();
    } else {
      $(".answer-list li:eq(" + x + ")").click();
    }
  }

  switch (charCode) {
    case 13: // Return
      if (e.shiftKey ? true : false) {
        $(".next-button:last").click();
      } else {
        $(".check-button:last").click();
      }
      break;
    case 32: // Space
      if (e.shiftKey ? true : false) {
        $(".previous-button:last").click();
      } else {
        $(".next-button:last").click();
      }
      e.preventDefault(); // Needed to stop the default action (scroll)
      break;
    case 46: // .
      toggleFlagged();
      break;

    // Numbers 1-9 select the corresponding answer (if it exists)
    // TODO: fix for multi question questions
    case 49: // 1
      numberKeyPressed(e, 0);
      break;
    case 50: // 2
      numberKeyPressed(e, 1);
      break;
    case 51: // 3
      numberKeyPressed(e, 2);
      break;
    case 52: // 4
      numberKeyPressed(e, 3);
      break;
    case 53: // 5
      numberKeyPressed(e, 4);
      break;
    case 54: // 6
      numberKeyPressed(e, 5);
      break;
    case 55: // 7
      numberKeyPressed(e, 6);
      break;
    case 56: // 8
      numberKeyPressed(e, 7);
      break;
    case 57: // 9
      numberKeyPressed(e, 8);
      break;
    case 72: // H
      previousQuestion();
      break;
    case 76: // L
      nextQuestion();
      break;

    case 102: // f
      $("#filter-toggle").click();
      break;
    case 103: // g
      $("#options").slideDown("slow");
      $("#goto-question-input").focus();
      e.preventDefault();
      break;

    // Vim like scrolling (incredibly important)
    case 106: // j
      window.scrollBy(0, 25);
      break;
    case 107: // k
      window.scrollBy(0, -25);
      break;
  }
}

function startSearch(str) {
  $("#clear-search-button").remove();
  if (str.length > 0) {
    search_string = str;
    search_metadata_only = $("#search-metadata-only").is(":checked");
    $("#search-form").append(
      $(document.createElement("button"))
        .attr({ id: "clear-search-button" })
        .text("X")
        .click(startSearch)
    );
    $("#clear-search-button").wrap("<a href='#'></a>");
  } else {
    search_string = false;
    search_metadata_only = false;
    $("#search-metadata-only").prop("checked", false);
  }
  // Return the promise from loadFilters so callers can await completion.
  return loadFilters();
}

function createExam() {
  const numQuestions = parseInt($("#exam-num-questions").val());
  const timePerQuestion = parseFloat($("#exam-time-per-question").val());
  const selectionMethod = $("input[name='exam-selection']:checked").val();

  if (!numQuestions || numQuestions < 1) {
    toastr.warning("Please enter a valid number of questions.");
    return;
  }

  if (!timePerQuestion || timePerQuestion <= 0) {
    toastr.warning("Please enter a valid time per question.");
    return;
  }

  // Generate exam questions
  if (selectionMethod === 'filtered') {
    exam_questions = [...filtered_questions];
    // Shuffle the array
    for (let i = exam_questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [exam_questions[i], exam_questions[j]] = [exam_questions[j], exam_questions[i]];
    }
    // Take only the requested number
    exam_questions = exam_questions.slice(0, numQuestions);
  } else if (selectionMethod === 'random') {
    exam_questions = generateRandomExamQuestions(numQuestions);
  }

  if (exam_questions.length === 0) {
    toastr.warning("No questions available for the exam.");
    return;
  }

  // Initialize exam state
  exam_mode = true;
  exam_answers = {};
  exam_start_time = new Date();
  exam_time_per_question = timePerQuestion;
  exam_end_time = new Date(exam_start_time.getTime() + exam_questions.length * timePerQuestion * 60 * 1000);

  // Cache exam questions independently to prevent interference with main cache
  exam_questions_data = {};
  exam_questions.forEach(qid => {
    if (questions[qid]) {
      exam_questions_data[qid] = questions[qid];
    }
  });

  // Build hash map for exam
  exam_hash_n_map = {};
  exam_questions.forEach((qid, index) => {
    exam_hash_n_map[qid] = index;
  });

  // Cache full question data for reproducibility
  const cachedQuestions = exam_questions.map(qid => ({
    id: qid,
    data: questions[qid]
  }));

  // Save exam to database
  current_exam_id = Date.now().toString();
  window.current_exam_id = current_exam_id;
  
  // Deactivate any existing active sessions and save the new exam
  deactivateAllExamSessions();
  
  db.exams.put({
    id: current_exam_id,
    date: exam_start_time.toISOString(),
    num_questions: numQuestions,
    time_per_question: timePerQuestion,
    selection_method: selectionMethod,
    questions: exam_questions,
    cached_questions: cachedQuestions,
    answers: exam_answers,
    score: null,
    current_question_index: 0
  }).then(() => {
    // Set as active exam
    localStorage.setItem('active_exam_id', current_exam_id);
    
    // Now that the exam is saved, start the UI
    // Hide the exam menu
    $("#exam-menu").removeClass('show').attr('aria-hidden', 'true');
    $("#exam-backdrop").removeClass('show');

    // Start the timer
    startExamTimer();

    // Load the first question
    loadExamQuestion(0);

    toastr.info(`Exam started! ${exam_questions.length} questions, ${Math.round((exam_end_time - exam_start_time) / 1000 / 60)} minutes total.`);
  }).catch(err => {
    console.error('Failed to create exam:', err);
    toastr.error('Failed to start exam');
  });
}

function loadExamList() {
  db.exams.orderBy('date').reverse().toArray().then(exams => {
    const $list = $('#exam-list');
    $list.empty();
    
    if (exams.length === 0) {
      $list.append('<p>No exams found.</p>');
      return;
    }
    
    exams.forEach(exam => {
      const date = new Date(exam.date).toLocaleString();
      const score = exam.score ? `${exam.score.correct}/${exam.score.total}` : 'Not completed';
      
      const $examItem = $(document.createElement('div')).addClass('exam-item').css({
        border: '1px solid #ccc',
        margin: '8px 0',
        padding: '8px',
        borderRadius: '4px'
      });
      
      $examItem.append(
        $(document.createElement('div')).text(`Date: ${date}`)
      );
      $examItem.append(
        $(document.createElement('div')).text(`Questions: ${exam.num_questions}, Time: ${exam.time_per_question} min each`)
      );
      $examItem.append(
        $(document.createElement('div')).text(`Score: ${score}`)
      );
      
      const $buttons = $(document.createElement('div')).css({ marginTop: '8px' });
      
      if (exam.score) {
        $buttons.append(
          $(document.createElement('button')).text('Review').click(() => reviewExam(exam.id))
        );
        $buttons.append(
          $(document.createElement('button')).text('View Results').css({ marginLeft: '8px' }).click(() => viewExamResults(exam.id))
        );
      } else {
        $buttons.append(
          $(document.createElement('button')).text('Continue').click(() => continueExam(exam.id))
        );
      }
      
      $buttons.append(
        $(document.createElement('button')).text('Delete').css({ marginLeft: '8px' }).click(() => deleteExam(exam.id))
      );
      
      $examItem.append($buttons);
      $list.append($examItem);
    });
  }).catch(error => {
    console.error('Error loading exam list:', error);
    toastr.error('Failed to load exam list');
  });
}

window.loadExamList = loadExamList;

function reviewExam(examId, startQuestionIndex = 0) {
  if (!examId) {
    console.error('reviewExam called with invalid examId:', examId);
    toastr.error('Invalid exam ID');
    return;
  }
  
  // Ensure examId is a string
  examId = String(examId);
  
  db.exams.get(examId).then(exam => {
    if (!exam) {
      console.error('No exam found with ID:', examId);
      toastr.error('Exam not found');
      return;
    }
    
    // Load cached questions for reproducibility
    if (exam.cached_questions) {
      exam_questions_data = {}; // Clear any previous exam data
      exam.cached_questions.forEach(cached => {
        exam_questions_data[cached.id] = cached.data;
      });
    }
    
    // Load exam for review
    exam_mode = true;
    exam_review_mode = true;
    exam_questions = exam.questions;
    exam_answers = exam.answers || {};
    current_exam_id = examId;
    window.current_exam_id = current_exam_id;
    exam_time_per_question = exam.time_per_question;
    
    // Build hash map
    exam_hash_n_map = {};
    exam_questions.forEach((qid, index) => {
      exam_hash_n_map[qid] = index;
    });
    
    // Hide menu and start review
    $("#exam-menu").removeClass('show').attr('aria-hidden', 'true');
    $("#exam-backdrop").removeClass('show');
    loadExamQuestion(startQuestionIndex);
    
    // Save exam state for persistence across page reloads
    saveExamState();
    
    toastr.info('Reviewing completed exam');
  }).catch(error => {
    console.error('Error loading exam for review:', error);
    if (error.name === 'DataError' && error.message.includes('No valid key')) {
      console.error('Database key error detected. Attempting database reset...');
      // Try to reset the database
      return db.exams.clear().then(() => {
        console.log('Database cleared. Reloading page...');
        toastr.error('Database error detected. Page will reload to fix the issue.');
        setTimeout(() => window.location.reload(), 2000);
      });
    }
    toastr.error('Failed to load exam for review');
  });
}

window.reviewExam = reviewExam;

function continueExam(examId) {
  db.exams.get(examId).then(exam => {
    if (!exam) return;
    
    // Load cached questions for reproducibility
    if (exam.cached_questions) {
      exam_questions_data = {}; // Clear any previous exam data
      exam.cached_questions.forEach(cached => {
        exam_questions_data[cached.id] = cached.data;
      });
    }
    
    // Load exam for continuation
    exam_mode = true;
    exam_review_mode = false; // Not review mode
    exam_questions = exam.questions;
    exam_answers = exam.answers || {};
    current_exam_id = examId;
    window.current_exam_id = current_exam_id;
    exam_time_per_question = exam.time_per_question;
    
    // Calculate remaining time
    const startTime = new Date(exam.date);
    const totalTimeMs = exam.num_questions * exam.time_per_question * 60 * 1000;
    const elapsedMs = Date.now() - startTime.getTime();
    const remainingMs = Math.max(0, totalTimeMs - elapsedMs);
    
    exam_start_time = new Date(Date.now() - elapsedMs); // Adjust start time so timer shows correct remaining time
    exam_end_time = new Date(Date.now() + remainingMs);
    
    // Build hash map
    exam_hash_n_map = {};
    exam_questions.forEach((qid, index) => {
      exam_hash_n_map[qid] = index;
    });
    
    // Hide menu and start exam
    $("#exam-menu").removeClass('show').attr('aria-hidden', 'true');
    $("#exam-backdrop").removeClass('show');
    
    // Start timer if time remains
    if (remainingMs > 0) {
      startExamTimer();
    } else {
      // Time already expired, end exam
      endExam();
      return;
    }
    
    // Load first unanswered question, or first question if all answered
    let startIndex = 0;
    for (let i = 0; i < exam_questions.length; i++) {
      if (!exam_answers[exam_questions[i]]) {
        startIndex = i;
        break;
      }
    }
    
    loadExamQuestion(startIndex);
    
    // Mark exam as active session
    deactivateAllExamSessions();
    localStorage.setItem('active_exam_id', examId);
    db.exams.update(examId, {
      current_question_index: startIndex
    });
    
    // Save exam state for persistence across page reloads
    saveExamState();
    
    toastr.info('Continuing exam');
  }).catch(error => {
    console.error('Error loading exam for continuation:', error);
    if (error.name === 'DataError' && error.message.includes('No valid key')) {
      console.error('Database key error detected. Attempting database reset...');
      return db.exams.clear().then(() => {
        console.log('Database cleared. Reloading page...');
        toastr.error('Database error detected. Page will reload to fix the issue.');
        setTimeout(() => window.location.reload(), 2000);
      });
    }
    toastr.error('Failed to load exam for continuation');
  });
}

window.continueExam = continueExam;

function deleteExam(examId) {
  if (confirm('Are you sure you want to delete this exam?')) {
    db.exams.delete(examId).then(() => {
      loadExamList();
      toastr.info('Exam deleted');
    });
  }
}

window.deleteExam = deleteExam;

function generateRandomExamQuestions(numQuestions) {
  // Get all available questions
  const allQuestions = Object.keys(questions);
  
  // Group by specialty
  const specialtyGroups = {};
  for (const qid of allQuestions) {
    const q = questions[qid];
    if (q.specialty) {
      for (const spec of q.specialty) {
        if (!specialtyGroups[spec]) specialtyGroups[spec] = [];
        specialtyGroups[spec].push(qid);
      }
    }
  }

  const selectedQuestions = [];
  const specialties = Object.keys(specialtyGroups);
  
  if (specialties.length === 0) {
    // No specialties, just random select
    const shuffled = [...allQuestions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, Math.min(numQuestions, shuffled.length));
  }

  // Distribute questions across specialties
  const questionsPerSpecialty = Math.floor(numQuestions / specialties.length);
  const extraQuestions = numQuestions % specialties.length;

  for (const spec of specialties) {
    const group = specialtyGroups[spec];
    const numToTake = questionsPerSpecialty + (extraQuestions > 0 ? 1 : 0);
    extraQuestions--;

    // Shuffle the group
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }

    selectedQuestions.push(...group.slice(0, Math.min(numToTake, group.length)));
  }

  // If we still need more questions, add from random specialties
  while (selectedQuestions.length < numQuestions) {
    const randomSpec = specialties[Math.floor(Math.random() * specialties.length)];
    const group = specialtyGroups[randomSpec];
    const available = group.filter(q => !selectedQuestions.includes(q));
    if (available.length > 0) {
      const randomQ = available[Math.floor(Math.random() * available.length)];
      selectedQuestions.push(randomQ);
    } else {
      break; // No more available
    }
  }

  return selectedQuestions.slice(0, numQuestions);
}

function startExamTimer() {
  updateExamTimerDisplay();
  exam_timer_interval = setInterval(function() {
    const now = new Date();
    if (now >= exam_end_time) {
      endExam();
    } else {
      updateExamTimerDisplay();
    }
  }, 1000);
}

function updateExamTimerDisplay() {
  if (!exam_mode) return;
  
  const now = new Date();
  const remaining = Math.max(0, exam_end_time - now);
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  
  // Update header or add a timer display
  $("#header").find(".exam-timer").remove();
  $("#header").prepend(
    $(document.createElement("div"))
      .addClass("exam-timer")
      .text(`Exam Time: ${minutes}:${seconds.toString().padStart(2, '0')}`)
      .css({ color: remaining < 300000 ? 'red' : 'inherit' }) // Red if less than 5 minutes
  );
}

function loadExamQuestion(index) {
  current_exam_question_index = index;
  loadQuestion(index, true);
}

function endExam() {
  exam_mode = false;
  clearInterval(exam_timer_interval);
  exam_questions_data = {}; // Clear exam-specific question data
  
  // Clear persisted exam state
  clearExamState();
  
  if (!exam_review_mode) {
    // Calculate score
    let correct = 0;
    let total = exam_questions.length;
    for (const qid of exam_questions) {
      if (exam_answers[qid] && exam_answers[qid].correct) correct++;
    }
    
    // Calculate time taken
    const timeTaken = exam_start_time ? Math.round((new Date() - exam_start_time) / 1000 / 60) : 0;
    const totalTime = exam_questions.length * (exam_time_per_question || 1.5);
    
    // Save final score to database
    if (current_exam_id) {
      db.exams.update(current_exam_id, {
        answers: exam_answers,
        score: { correct, total }
      });
    }
    
    // Show results modal
    showExamResults(correct, total, timeTaken, totalTime, false);
  } else {
    exam_review_mode = false;
    toastr.info('Review ended');
    // Switch back to normal mode
    loadFilters();
    loadQuestion(0);
  }
}

function showExamResults(correct, total, timeTaken, totalTime, isPastResults = false) {
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  
  let timeDisplay;
  if (isPastResults) {
    timeDisplay = `
    <div class="exam-results-stat">
      <span class="exam-results-stat-label">Total Time Allowed:</span>
      <span class="exam-results-stat-value">${totalTime} minutes</span>
    </div>`;
  } else {
    timeDisplay = `
    <div class="exam-results-stat">
      <span class="exam-results-stat-label">Time Taken:</span>
      <span class="exam-results-stat-value">${timeTaken} minutes</span>
    </div>
    <div class="exam-results-stat">
      <span class="exam-results-stat-label">Total Time Allowed:</span>
      <span class="exam-results-stat-value">${totalTime} minutes</span>
    </div>`;
  }
  
  const summaryHtml = `
    <div class="exam-results-stat">
      <span class="exam-results-stat-label">Score:</span>
      <span class="exam-results-stat-value">${correct}/${total} (${percentage}%)</span>
    </div>
    ${timeDisplay}
    <div class="exam-results-stat">
      <span class="exam-results-stat-label">Questions Answered:</span>
      <span class="exam-results-stat-value">${Object.keys(exam_answers).length}/${total}</span>
    </div>
  `;
  
  // Generate detailed question list
  let detailsHtml = '<h3>Question Details</h3><p style="font-size: 14px; color: var(--text-color); margin: 0 0 10px 0;">Click on any question to jump to it for review.</p><div class="exam-results-questions">';
  exam_questions.forEach((qid, index) => {
    const questionData = exam_questions_data[qid];
    const answerData = exam_answers[qid];
    const questionNumber = index + 1;
    
    let statusClass = 'unanswered';
    let statusText = 'Not Answered';
    let answerText = '';
    
    if (answerData) {
      if (answerData.correct) {
        statusClass = 'correct';
        statusText = 'Correct';
      } else {
        statusClass = 'incorrect';
        statusText = 'Incorrect';
      }
      
      // Try to get the selected answer text from the saved data or questions
      if (answerData.other && answerData.other.answer) {
        answerText = ` - Selected: ${answerData.other.answer}`;
      } else if (answerData.other && answerData.other.target_id) {
        // Fallback: get answer text from the DOM element if available
        const answerElement = $(`#${answerData.other.target_id}`);
        if (answerElement.length > 0) {
          answerText = ` - Selected: ${answerElement.text()}`;
        }
      }
    }
    
    const questionText = questionData ? (questionData.question || 'Question text not available').substring(0, 100) + '...' : 'Question not found';
    
    detailsHtml += `
      <div class="exam-results-question ${statusClass}" data-question-index="${index}" style="cursor: pointer;" title="Click to jump to this question">
        <div class="question-header">
          <span class="question-number">Q${questionNumber}:</span>
          <span class="question-status">${statusText}</span>
        </div>
        <div class="question-text">${questionText}${answerText}</div>
      </div>
    `;
  });
  detailsHtml += '</div>';
  
  $('#exam-results-summary').html(summaryHtml);
  $('#exam-results-details').html(detailsHtml);
  
  // Update button visibility based on context
  if (isPastResults) {
    $('#exam-results-review-button').show();
    $('#exam-results-return-button').text('Close');
  } else {
    $('#exam-results-review-button').show();
    $('#exam-results-return-button').text('Return to Quiz');
  }
  
  $('#exam-results-modal').addClass('show').attr('aria-hidden', 'false');
  
  // Add click handlers for jumping to questions
  $('.exam-results-question').off('click').on('click', function() {
    const questionIndex = parseInt($(this).data('question-index'));
    if (!isNaN(questionIndex)) {
      // Close the results modal
      $('#exam-results-modal').removeClass('show').attr('aria-hidden', 'true');

      // If we're viewing past results, start review for that past exam
      if (window.viewing_past_results && window.past_exam_id) {
        reviewExam(window.past_exam_id, questionIndex);
        return;
      }

      // If we have a current exam id (the most common case for just-finished exams),
      // open the exam in review mode at the requested question so next/previous
      // navigation remains within the exam context.
      if (window.current_exam_id) {
        try {
          reviewExam(window.current_exam_id, questionIndex);
          return;
        } catch (err) {
          console.warn('Failed to open current exam for review, falling back to loading question:', err);
        }
      }

      // Fallback: load question in exam view (best effort)
      exam_mode = true;
      exam_review_mode = true;
      loadQuestion(questionIndex, true);
    }
  });
}

function viewExamResults(examId) {
  db.exams.get(examId).then(exam => {
    if (!exam || !exam.score) {
      toastr.error('Exam results not found');
      return;
    }
    
    const { correct, total } = exam.score;
    // For completed exams, we don't have exact time taken, so we'll show the total allowed time
    const totalTime = exam.num_questions * exam.time_per_question;
    
    // Load cached questions for reproducibility if available
    if (exam.cached_questions) {
      exam_questions_data = {}; // Clear any previous exam data
      exam.cached_questions.forEach(cached => {
        exam_questions_data[cached.id] = cached.data;
      });
    }
    
    // Store original state
    const originalExamQuestions = exam_questions;
    const originalExamAnswers = exam_answers;
    
    // Set exam state for results display
    exam_questions = exam.questions || [];
    exam_answers = exam.answers || {};
    
    // Set a flag to indicate we're viewing past results
    window.viewing_past_results = true;
    window.past_exam_id = examId;
    
    // Store restoration function to be called when modal closes
    window.restoreExamState = function() {
      exam_questions = originalExamQuestions;
      exam_answers = originalExamAnswers;
      window.viewing_past_results = false;
      window.past_exam_id = null;
    };
    
    showExamResults(correct, total, totalTime, totalTime, true); // Show total time as both taken and allowed
  }).catch(error => {
    console.error('Error loading exam results:', error);
    if (error.name === 'DataError' && error.message.includes('No valid key')) {
      console.error('Database key error detected. Attempting database reset...');
      return db.exams.clear().then(() => {
        console.log('Database cleared. Reloading page...');
        toastr.error('Database error detected. Page will reload to fix the issue.');
        setTimeout(() => window.location.reload(), 2000);
      });
    }
    toastr.error('Failed to load exam results');
  });
}

function setUpFilters() {
  let specialty_filters = {};
  let source_filters = {};
  $("#specialty-filters").empty();
  $("#source-filters").empty();
  for (let q in questions) {
    for (let s in questions[q]["specialty"]) {
      specialty_filters[questions[q]["specialty"][s]] = true;
    }
    source_filters[questions[q]["source"]] = true;
  }

  // This bit is rather fucked. It does work though.
  var specialty_filter_keys = Object.keys(specialty_filters);

  specialty_filter_keys.sort();

  if (specialty_filter_keys.length === 0) {
    $("#specialty-filters").hide();
  } else {
    $("#specialty-filters").show();
    // add heading
    $("#specialty-filters").append($(document.createElement("h4")).text("Specialty"));
    let i = 0;
    for (let s in specialty_filter_keys) {
      i = i + 1;
      const fid = "filter-specialty-" + i + "-" + escaper(specialty_filter_keys[s]);
      const $input = $(document.createElement("input")).attr({
        type: "checkbox",
        id: fid,
        name: "filter-specialty-checkbox",
        value: specialty_filter_keys[s]
      });
      const $label = $(document.createElement("label")).attr({ for: fid }).text(specialty_filter_keys[s]);
      $("#specialty-filters").append($(document.createElement("li")).append($input).append($label));
    }

    if ($("[name='filter-specialty-checkbox']").length > 1) {
      $("#specialty-filters").append(
        $(document.createElement("li"))
          .attr({ class: "select-all" })
          .text("Select All")
          .click(function () {
            let checkBoxes = $("[name='filter-specialty-checkbox']");
            checkBoxes.prop("checked", !checkBoxes.prop("checked"));

            loadFilters();
          })
      );
    }
  }

  var source_filter_keys = Object.keys(source_filters);
  source_filter_keys.sort();

  if (source_filter_keys.length === 0) {
    $("#source-filters").hide();
  } else {
    $("#source-filters").show();
    // add heading
    $("#source-filters").append($(document.createElement("h4")).text("Source"));
    // add a small live-filter input so users can quickly find a source when there
    // are many sources
    $("#source-filters").append(
      $(document.createElement("input")).attr({
        type: "text",
        id: "source-filter-search",
        placeholder: "Filter sources",
        'aria-label': 'Filter sources'
      }).css({ width: '100%', margin: '6px 0', padding: '6px', boxSizing: 'border-box' })
    );
    let i = 0;
    for (let s in source_filter_keys) {
      i = i + 1;
      const fid = "filter-source-" + i + "-" + escaper(source_filter_keys[s]);
      const $input = $(document.createElement("input")).attr({
        type: "checkbox",
        id: fid,
        name: "filter-source-checkbox",
        value: source_filter_keys[s]
      });
      const $label = $(document.createElement("label")).attr({ for: fid }).text(source_filter_keys[s]);
      $("#source-filters").append($(document.createElement("li")).append($input).append($label));
    }

    if ($("[name='filter-source-checkbox']").length > 1) {
      $("#source-filters").append(
        $(document.createElement("li"))
          .attr({ class: "select-all" })
          .text("Select All")
          .click(function () {
            let checkBoxes = $("[name='filter-source-checkbox']");
            checkBoxes.prop("checked", !checkBoxes.prop("checked"));

            loadFilters();
          })
      );
    }
  }

  // Wire up the live filter input (filter only the source checkbox rows)
  $(document).off('input', '#source-filter-search');
  $(document).on('input', '#source-filter-search', function () {
    const q = ($(this).val() || '').toLowerCase().trim();
    // only consider list items that contain a source checkbox
    $("#source-filters li").each(function () {
      const $cb = $(this).find("input[name='filter-source-checkbox']");
      if ($cb.length === 0) return; // skip non-source rows (e.g., Select All)
      const txt = ($(this).find('label').text() || '').toLowerCase();
      if (q === '' || txt.indexOf(q) !== -1) {
        $(this).show();
      } else {
        $(this).hide();
      }
    });
  });

  // Restore previously selected filters (before we attach the events)
  // ereader
  store.keys("store_keys = keys");
  for (let i in store_keys) {
    if (/^(checkbox-)/.test(store_keys[i])) {
      let id = store_keys[i].substr(9);

      $("#" + id).prop("checked", "checked");
    }
  }
  //    try {
  //
  //        Object.keys(localStorage).forEach(function(key) {
  //            if (/^(checkbox-)/.test(key)) {
  //                id = key.substr(9);
  //
  //                $("#"+id).prop("checked", "checked");
  //            }
  //        });
  //    } catch(e) {
  //        toastr.warning("Unable to load previous settings");
  //    }

  // Rerun filters everytime the checkboxes are changed
  $(
    "input[name=filter-specialty-checkbox],input[name=filter-source-checkbox]"
  ).change(function (e) {
    loadFilters();
  });

  $("#show-answered-questions-button").click(function () {
    show_answered_questions = !$("#show-answered-questions-button").is(
      ":checked"
    );
    loadFilters();
  });

  $("#show-only-flagged-questions-button").click(function () {
    show_only_flagged_questions = $("#show-only-flagged-questions-button").is(
      ":checked"
    );
    loadFilters();
  });

  $("#auto-load-previous-answers-button").click(function () {
    auto_load_previous_answers = $("#auto-load-previous-answers-button").is(
      ":checked"
    );
  });

  loadFilters();
}

async function loadFilters() {
  console.log("load filters")
  filtered_questions = [];

  let active_specialty_filters = {};

  clearSavedCheckboxStates();

  $("input[name=filter-specialty-checkbox]:checked").each(function (index, e) {
    active_specialty_filters[e.value] = true;
    saveCheckboxState(e.id);
  });

  let filter_specialty = !isEmptyObject(active_specialty_filters);

  let active_source_filters = {};

  $("input[name=filter-source-checkbox]:checked").each(function (index, e) {
    active_source_filters[e.value] = true;
    saveCheckboxState(e.id);
  });

  let filter_source = !isEmptyObject(active_source_filters);

  if (search_string) {
    search_string = new RegExp(search_string, "i");
  }

  // There must be a better way to do this!
  let flagged_questions = await db.flagged.toArray()
  flagged_questions = flagged_questions.map((d) => { return d.qid });
  let answered_questions = await db.answers.toArray();
  answered_questions = answered_questions.map((d) => { return d.qid });

  for (let n in questions) {
    let q = questions[n];


    // Filter questions that have an answer saved
    if (!show_answered_questions) {
      if (answered_questions.includes(n)) {
        continue;
      }
    }

    // Filter questions that have not been flagged
    if (show_only_flagged_questions) {
      if (!flagged_questions.includes(n)) {
        continue;
      }
    }

    if (filter_specialty) {
      var specialty_exists = false;
      for (let s in q["specialty"]) {
        if (active_specialty_filters.hasOwnProperty(q["specialty"][s])) {
          specialty_exists = true;
          break;
        } else {
          specialty_exists = false;
        }
      }
      if (!specialty_exists) {
        continue;
      }
    }

    if (filter_source) {
      if (!active_source_filters.hasOwnProperty(q["source"])) {
        continue;
      }
    }

    if (search_string) {
      if (search_metadata_only) {
        if (!searchMetadata(q, search_string)) {
          continue;
        }
      } else {
        if (!searchObject(q, search_string)) {
          continue;
        }
      }
    }

    //filtered_questions[n] = q;
    filtered_questions.push(n);
  }

  // Try and load previous question order. Lawnchair/store APIs are callback-based
  // so wrap them in a Promise and await to ensure filtered_questions is final
  // before proceeding.
  await new Promise((resolve) => {
    try {
      store.exists("question_order", function (exists) {
        if (exists) {
          store.get("question_order", function (obj) {
            try {
              let loaded_question_order = obj["value"];

              // Check we have the same question set (apparently javascript sets are useless...)
              if (areEqualArrays(loaded_question_order, filtered_questions)) {
                // If so use the loaded one
                filtered_questions = loaded_question_order;
              }
            } catch (e) {
              console.warn('Error applying loaded question_order', e);
            }
            resolve();
          });
        } else {
          resolve();
        }
      });
    } catch (e) {
      // If store isn't available or throws, continue
      console.warn('Error checking question_order store', e);
      resolve();
    }
  });

  for (let n in filtered_questions) {
    hash_n_map[filtered_questions[n]] = parseInt(n);
  }

  //loadQuestion(0);
  loadPreviousQuestion();

  // Enable/disable the score toggle button depending on whether there are questions
  try {
    const container = $("#score-toggle");
    const scoreBtn = $("#score-toggle button");
    if (filtered_questions.length === 0) {
      container.addClass('disabled');
      scoreBtn.prop('disabled', true);
      scoreBtn.attr('aria-disabled', 'true');
    } else {
      container.removeClass('disabled');
      scoreBtn.prop('disabled', false);
      scoreBtn.attr('aria-disabled', 'false');
    }
  } catch (err) {
    console.warn('Unable to update score button disabled state', err);
  }
  // Enable/disable question-details toggle based on whether we have any questions
  try {
    const qContainer = $("#question-details-toggle");
    const qBtn = $("#question-details-toggle button");
    if (filtered_questions.length === 0) {
      qContainer.addClass('disabled');
      qBtn.prop('disabled', true);
      qBtn.attr('aria-disabled', 'true');
    } else {
      // Only enable if a current question is set; loadQuestion will enable when opening a specific question
      if (current_question_uid) {
        qContainer.removeClass('disabled');
        qBtn.prop('disabled', false);
        qBtn.attr('aria-disabled', 'false');
      }
    }
  } catch (err) {
    console.warn('Unable to update question-details-toggle disabled state', err);
  }

  search_string = false;

  // Expose filtered_questions for debugging in the console and report its length
  try {
    window.filtered_questions = filtered_questions;
    console.log('filtered_questions.length ->', Array.isArray(filtered_questions) ? filtered_questions.length : typeof filtered_questions);
  } catch (e) {
    // ignore in environments where window is not writable
  }
}

window.loadFilters = loadFilters;

function getQuestionDataByNumber(n) {
  let qid = filtered_questions[n];
  return questions[qid];
}

// Build and display statistics broken down by specialty
async function buildStatsBySpecialty() {
  try {
    // Use the latest answer per qid
    const allAnswers = await db.answers.toArray();
    const answersByQid = {};
    allAnswers.forEach(a => {
      answersByQid[a.qid] = a;
    });

    // Aggregate stats per specialty
    const stats = {};

    for (const qid of Object.keys(questions)) {
      const q = questions[qid];
      const ans = answersByQid[qid];
      // Only consider questions that have at least one recorded answer
      if (!ans) continue;

      // Normalize specialties to an array
      let specs = [];
      if (Array.isArray(q.specialty)) specs = q.specialty;
      else if (q.specialty) specs = [q.specialty];

      specs.forEach(s => {
        if (!stats[s]) stats[s] = { questions: 0, score: 0, max: 0 };
        stats[s].questions += 1;
        stats[s].score += Number(ans.score || 0);
        stats[s].max += Number(ans.max_score || 0);
      });
    }

    // Build table HTML
    const container = $("#stats-table-container");
    container.empty();

    const keys = Object.keys(stats).sort((a,b) => b && a ? ( (stats[b].score/stats[b].max) - (stats[a].score/stats[a].max) ) : 0);

    if (keys.length === 0) {
      $("#stats-summary").text('No answered questions available to generate stats.');
      return;
    }

    $("#stats-summary").text('Statistics calculated from ' + Object.keys(answersByQid).length + ' answered questions.');

    let table = $("<table>");
    let thead = $("<thead>");
    thead.append('<tr><th>Specialty</th><th>Questions</th><th>Score</th><th>Max</th><th>Percent</th></tr>');
    table.append(thead);
    let tbody = $("<tbody>");

    keys.forEach(k => {
      const st = stats[k];
      const percent = st.max > 0 ? (st.score / st.max) * 100 : 0;
      // build a visual stat row: name | counts | bar | percent
      const row = $("<div>").addClass('stat-row');
      const name = $("<div>").addClass('stat-name').text(k);
      const counts = $("<div>").addClass('stat-counts').text(st.questions + ' q • ' + st.score + '/' + st.max);
      const barWrap = $("<div>").addClass('stat-bar-wrap');
      // choose hue from percent (0 -> red, 100 -> green)
      const hue = Math.max(0, Math.min(120, (percent / 100) * 120));
      const fill = $("<div>").addClass('stat-bar-fill').css('background', 'linear-gradient(90deg, hsl(' + hue + ',80%,45%), hsl(' + hue + ',60%,35%))');
      fill.css('width', percent.toFixed(2) + '%');
      barWrap.append(fill);
      const pct = $("<div>").addClass('stat-percent').text(percent.toFixed(2) + '%');
      row.append(name, counts, barWrap, pct);
      container.append(row);
    });

    table.append(tbody);
    container.append(table);
  } catch (err) {
    console.error('Error building stats:', err);
    $("#stats-summary").text('Error building statistics.');
  }
}

// Helper to find next/previous unanswered question index.
async function findUnansweredIndex(startIndex, step) {
  // step = +1 for next, -1 for previous
  let idx = startIndex + step;
  while (idx >= 0 && idx < filtered_questions.length) {
    const qid = filtered_questions[idx];
    // Check DB for an answer for this qid
    const ans = await db.answers.where('qid').equals(qid).first();
    if (ans === undefined) {
      return idx;
    }
    idx += step;
  }
  return -1;
}

async function previousQuestion(e) {
  const currentMap = exam_mode ? exam_hash_n_map : hash_n_map;
  const currentIndex = currentMap[current_question_uid];
  // Ctrl/Cmd + click: jump to previous unanswered
  const ctrl = e && (e.ctrlKey || e.metaKey);
  // If user enabled default unanswered nav in options, treat as ctrl
  const defaultNav = localStorage.getItem('jquizer-default-unanswered') === '1' || localStorage.getItem('jquizer-default-unanswered') === 'true';
  const effectiveCtrl = ctrl || defaultNav;
  if (ctrl && !exam_mode) {  // Disable unanswered jump in exam mode
    const idx = await findUnansweredIndex(currentIndex, -1);
    if (idx >= 0) {
      loadQuestion(idx);
      return;
    } else {
      toastr.info('No previous unanswered questions');
      return;
    }
  }

  if (e && e.shiftKey) {
    loadQuestion(currentIndex - 10, exam_mode);
  } else {
    loadQuestion(currentIndex - 1, exam_mode);
  }
}

async function nextQuestion(e) {
  const currentMap = exam_mode ? exam_hash_n_map : hash_n_map;
  const currentIndex = currentMap[current_question_uid];
  // Ctrl/Cmd + click: jump to next unanswered
  const ctrl = e && (e.ctrlKey || e.metaKey);
  // If user enabled default unanswered nav in options, treat as ctrl
  const defaultNavNext = localStorage.getItem('jquizer-default-unanswered') === '1' || localStorage.getItem('jquizer-default-unanswered') === 'true';
  const effectiveCtrlNext = ctrl || defaultNavNext;
  if (effectiveCtrlNext && !exam_mode) {  // Disable unanswered jump in exam mode
    const idx = await findUnansweredIndex(currentIndex, +1);
    if (idx >= 0) {
      loadQuestion(idx);
      return;
    } else {
      toastr.info('No next unanswered questions');
      return;
    }
  }

  if (e && e.shiftKey) {
    loadQuestion(currentIndex + 10, exam_mode);
  } else {
    loadQuestion(currentIndex + 1, exam_mode);
  }
}

function isEmptyObject(obj) {
  return Object.getOwnPropertyNames(obj).length === 0;
}

// Searches within a object for a specified regex.
// If found return true, else false
function searchObject(o, search_str) {
  for (var i in o) {
    if (typeof o[i] == "object") {
      // Recursively search the object tree
      if (searchObject(o[i], search_str)) {
        return true;
      }
    } else {
      if (
        String(o[i]).search(search_str) > -1 ||
        String(i).search(search_str) > -1
      ) {
        return true;
      }
    }
  }
  return false;
}

// Searches within question metadata for a specified regex.
// Metadata includes: type, source, specialty, meta, date
function searchMetadata(q, search_str) {
  const metadataFields = ['type', 'source', 'specialty', 'meta', 'date'];
  for (let field of metadataFields) {
    if (q.hasOwnProperty(field)) {
      if (typeof q[field] === 'object') {
        // For arrays like specialty
        for (let item in q[field]) {
          if (String(q[field][item]).search(search_str) > -1) {
            return true;
          }
        }
      } else {
        if (String(q[field]).search(search_str) > -1) {
          return true;
        }
      }
    }
  }
  return false;
}

// TODO: fix
async function saveAnswersAsFile() {
  let answers = await db.answers.toArray();
  let flagged = await db.flagged.toArray();
  var textToWrite = JSON.stringify({
    answers: answers,
    flagged_questions: flagged,
  });
  var textFileAsBlob = new Blob([textToWrite], { type: "text/plain" });
  var fileNameToSaveAs = "answers";

  var downloadLink = document.createElement("a");
  downloadLink.download = fileNameToSaveAs;
  downloadLink.innerHTML = "Download File";
  if (window.webkitURL != null) {
    // Chrome allows the link to be clicked
    // without actually adding it to the DOM.
    downloadLink.href = window.webkitURL.createObjectURL(textFileAsBlob);
  } else {
    // Firefox requires the link to be added to the DOM
    // before it can be clicked.
    downloadLink.href = window.URL.createObjectURL(textFileAsBlob);
    downloadLink.onclick = destroyClickedElement;
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
  }

  downloadLink.click();
}

function similarity(s1, s2, toLower = true, stripWhitespace = true) {
  if (toLower == true) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
  }

  if (stripWhitespace) {
    s1 = s1.replace(/ /g, "");
    s2 = s2.replace(/ /g, "");
  }
  var longer = s1;
  var shorter = s2;
  if (s1.length < s2.length) {
    longer = s2;
    shorter = s1;
  }
  var longerLength = longer.length;
  if (longerLength == 0) {
    return 1.0;
  }
  return (
    (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength)
  );
}

function editDistance(s1, s2) {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();

  var costs = new Array();
  for (var i = 0; i <= s1.length; i++) {
    var lastValue = i;
    for (var j = 0; j <= s2.length; j++) {
      if (i == 0) costs[j] = j;
      else {
        if (j > 0) {
          var newValue = costs[j - 1];
          if (s1.charAt(i - 1) != s2.charAt(j - 1))
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

function dynamicSort(property) {
  var sortOrder = 1;
  if (property[0] === "-") {
    sortOrder = -1;
    property = property.substr(1);
  }
  return function (a, b) {
    var result =
      a[property] < b[property] ? -1 : a[property] > b[property] ? 1 : 0;
    return result * sortOrder;
  };
}

// Gapps integration removed — keep a no-op function so callers remain safe.
function createRemoteStoreButtonIfRequired() {
  // intentionally left blank
}

function loadRemoteServer() {
  // Gapps removed — no-op. If code calls this, log a message for debugging.
  console.info("loadRemoteServer() called but Google Apps integration has been removed.");
}

function toggleFlagged() {
  db.flagged.get(current_question_uid).then((d) => {
    if (d == undefined) {
      db.flagged.put({ qid: current_question_uid })
      $("#flagged-button").text("FLAGGED");
      toastr.info("Question flagged.");
    } else {
      $("#flagged-button").text("NOT FLAGGED");
      db.flagged.delete(current_question_uid)
      toastr.info("Question unflagged.");
    }
    // We handle the error above
  }).catch(() => { })

  remote_store_synced = false;
}

// Popup search option for selected text
function getSelected() {
  if (window.getSelection) {
    return window.getSelection();
  } else if (document.getSelection) {
    return document.getSelection();
  } else {
    var selection = document.selection && document.selection.createRange();
    if (selection.text) {
      return selection.text;
    }
    return false;
  }
  return false;
}

// TODO: merge with rest of document.ready
/* create sniffer */
$(document).ready(function () {
  $("body").mouseup(function (event) {
    var selection = getSelected();
    if (selection == "") {
      $("span.popup-tag").css("display", "none");
    }
  });

  $("#main, #feedback").mouseup(function (event) {
    // Fix bug in cornerstone tools magnfiy??
    //$(".magnifyTool").hide();

    var selection = getSelected();
    selection = $.trim(selection);
    if (selection != "") {
      $("span.popup-tag").empty();
      $("span.popup-tag").css("display", "block");
      $("span.popup-tag").css("top", event.clientY);
      $("span.popup-tag").css("left", event.clientX);
      //$("span.popup-tag").text(selection);

      let text = selection;

      // TODO: remove dulpication (also in checkAnswer.js
      // Build forms for statdx searches as it uses POST requests
      $(".popup-tag").append(
        $(
          `
            <form method="post" action="https://app.statdx.com/search"
            target="_blank" name="form` +
          text +
          `" style="display:none">
            <input type="hidden" name="startIndex" value="0">
            <input type="hidden" name="category" value="All">
            <input type="hidden" name="searchType" value="documents">
            <input type="hidden" name="documentTypeFilters" value='["all"]'>
            <input type="hidden" name="searchTerm" value="` +
          text +
          `">
            <input type="submit" value="Open results in a new window"> 
            </form>
        `
        )
      );

      $(".popup-tag").append(
        $(document.createElement("div"))
          .attr({
            class: "search-text"
          })
          .text(text)
      );

      $(".popup-tag").append(
        $(document.createElement("span"))
          .attr({
            class: "search-close"
          })
          .text("<close>")
          .click(function () {
            $(this)
              .closest(".popup-tag")
              .css("display", "none");
            return false;
          })
      );

      $(".popup-tag")
        .append(
          $(document.createElement("a"))
            .attr({
              href: "https://www.google.com/search?q=" + text,
              target: "newtab",
              class: "google-answer answer-link"
            })
            .text("G")
        )
        .append(
          $(document.createElement("a"))
            .attr({
              href: "https://pubmed.ncbi.nlm.nih.gov/?term=" + encodeURIComponent(text),
              target: "newtab",
              class: "pubmed-answer answer-link",
              title: "Search PubMed for selected text"
            })
            .text("P")
        )
        .append(
          $(document.createElement("a"))
            .attr({
              href:
                "https://radiopaedia.org/search?q=" +
                text.replace(/[^a-zA-Z0-9-_ ]/g, ""),
              target: "newtab",
              class: "radiopaedia-answer answer-link"
            })
            .text("R")
        )
        .append(
          $(document.createElement("a"))
            .attr({
              href: "STATDX",
              target: "newtab",
              class: "statdx-answer answer-link",
              onClick:
                "document.forms['form" + text + "'].submit(); return false;"
            })
            .text("S")
        );
    } else {
      // Handle in body mouseup
      //$("span.popup-tag").css("display","none");
    }
  });
});

// Top-nav toggle behaviour for small screens
(function () {
  function closeTopNav() { document.body.classList.remove('top-nav-open'); const btn = document.getElementById('top-nav-toggle'); if (btn) btn.setAttribute('aria-expanded','false'); }
  function openTopNav() { document.body.classList.add('top-nav-open'); const btn = document.getElementById('top-nav-toggle'); if (btn) btn.setAttribute('aria-expanded','true'); }

  document.addEventListener('click', function (e) {
    const toggle = document.getElementById('top-nav-toggle');
    const topNav = document.getElementById('top-nav');
    if (!toggle || !topNav) return;
    if (e.target === toggle || e.target.closest && e.target.closest('#top-nav-toggle')) {
      if (document.body.classList.contains('top-nav-open')) closeTopNav(); else openTopNav();
      return;
    }
    // close when clicking outside
    if (document.body.classList.contains('top-nav-open')) {
      if (!e.target.closest || (!e.target.closest('#top-nav') && !e.target.closest('#top-nav-toggle'))) {
        closeTopNav();
      }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeTopNav();
  });
})();

// Annotate simple citation-like patterns in a container by adding small search
// links (PubMed / Google). This looks for a common pattern 'YYYY; vol' which
// appears in many citations and adds inline buttons next to the matched text.
function annotateCitations($container) {
  if (!$container || $container.length === 0) return;

  // When a literal 'Reference:' prefix is present, anchor the match at that
  // token so we don't accidentally capture the preceding paragraph text.
  // Accept either ':' or ';' after the year, and allow volume(issue):pages
  // forms (e.g. 2006:29(24):1–6). Be permissive between year and pages but
  // anchor on 'Reference:' to avoid capturing preceding paragraph text.
  // Allow an optional month token (e.g. "Oct") between the year and the
  // separator so patterns like "2011 Oct;197(4)" are matched.
  const refPrefixRegex = /Reference:\s*[A-Z][\s\S]{0,800}?\d{4}(?:\s+[A-Za-z]{3,10})?\s*[:;]\s*[\s\S]{0,200}?\b[A-Za-z]*\d+(?:[-–][A-Za-z]*\d+)?\.?/gi;

  // A conservative regex to capture a full reference fragment ending with
  // patterns like "2013; 33(2):535-52" or "2013;33:535-52". It looks back
  // for preceding author/title parts up to a reasonable length but is NOT
  // anchored to 'Reference:' (used only when the explicit prefix is absent).
  // Unanchored full reference matcher; accept ':' or ';' after the year and
  // common volume/issue/pages formats. Case-insensitive to capture varied
  // capitalization in journal titles.
  // Unanchored full reference matcher — also allow an optional month token
  // between the year and the separator (e.g. "2011 Oct;").
  const fullRefRegex = /[A-Z][\s\S]{5,800}?\d{4}(?:\s+[A-Za-z]{3,10})?\s*[:;]\s*[\s\S]{0,200}?\b[A-Za-z]*\d+(?:[-–][A-Za-z]*\d+)?\.?/gi;

  // fallback simple pattern (year; vol) for anything missed
  const simpleRegex = /\b(\d{4};\s*\d+(?:\([^\)]*\))?)/g;

  function createPopup(refText, anchorEl) {
    // remove any existing popup
    $('.citation-popup').remove();
    const popup = document.createElement('div');
    popup.className = 'citation-popup';
    popup.style.position = 'absolute';
    popup.style.zIndex = 9999;
    popup.style.background = '#fff';
    popup.style.border = '1px solid #888';
    popup.style.padding = '6px';
    popup.style.borderRadius = '4px';
    popup.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';

    // Remove a leading "Reference:" prefix from the query so searches
    // don't include the literal label.
    const queryText = String(refText).replace(/^\s*Reference:\s*/i, '').trim();

    const g = document.createElement('a');
    g.href = 'https://www.google.com/search?q=' + encodeURIComponent(queryText);
    g.target = '_blank';
    g.textContent = 'Search Google';
    g.style.marginRight = '8px';

    const p = document.createElement('a');
    p.href = 'https://pubmed.ncbi.nlm.nih.gov/?term=' + encodeURIComponent(queryText);
    p.target = '_blank';
    p.textContent = 'Search PubMed';

    popup.appendChild(g);
    popup.appendChild(p);

    document.body.appendChild(popup);

    // position near anchor
    const rect = anchorEl.getBoundingClientRect();
    popup.style.top = (window.scrollY + rect.bottom + 6) + 'px';
    popup.style.left = (window.scrollX + rect.left) + 'px';

    // close on outside click
    function onDocClick(e) {
      if (!popup.contains(e.target) && e.target !== anchorEl) {
        popup.remove();
        document.removeEventListener('mousedown', onDocClick);
      }
    }
    setTimeout(() => document.addEventListener('mousedown', onDocClick), 10);
  }

  // Walk text nodes and first match full references, then fall back to simple matches
  $container.each(function () {
    const walker = document.createTreeWalker(this, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      if (node.nodeValue && (fullRefRegex.test(node.nodeValue) || simpleRegex.test(node.nodeValue))) {
        textNodes.push(node);
      }
    }

    textNodes.forEach(function (txtNode) {
      const parent = txtNode.parentNode;
      const frag = document.createDocumentFragment();
      let lastIndex = 0;
      const str = txtNode.nodeValue;

      // Prefer anchored 'Reference:' matches first to avoid greedy capture
      // of preceding paragraph text. If none found, fall back to the
      // unanchored fullRefRegex.
      let matched = false;

      refPrefixRegex.lastIndex = 0;
      let pm;
      if (refPrefixRegex.test(str)) {
        refPrefixRegex.lastIndex = 0;
        while ((pm = refPrefixRegex.exec(str)) !== null) {
          matched = true;
          const idx = pm.index;
          if (idx > lastIndex) frag.appendChild(document.createTextNode(str.slice(lastIndex, idx)));
          const matchText = pm[0];
          const span = document.createElement('span');
          span.className = 'full-citation';
          span.textContent = matchText;
          span.style.textDecoration = 'underline';
          span.style.cursor = 'pointer';
          span.addEventListener('click', function (e) { createPopup(matchText, span); });
          frag.appendChild(span);
          lastIndex = idx + matchText.length;
        }
      } else {
        fullRefRegex.lastIndex = 0;
        let m;
        while ((m = fullRefRegex.exec(str)) !== null) {
          matched = true;
          const idx = m.index;
          if (idx > lastIndex) frag.appendChild(document.createTextNode(str.slice(lastIndex, idx)));
          const matchText = m[0];
          const span = document.createElement('span');
          span.className = 'full-citation';
          span.textContent = matchText;
          span.style.textDecoration = 'underline';
          span.style.cursor = 'pointer';
          span.addEventListener('click', function (e) { createPopup(matchText, span); });
          frag.appendChild(span);
          lastIndex = idx + matchText.length;
        }
      }

      if (!matched) {
        // fallback: annotate simple year;vol patterns
        simpleRegex.lastIndex = 0;
        let sm;
        let li = 0;
        while ((sm = simpleRegex.exec(str)) !== null) {
          const idx = sm.index;
          if (idx > lastIndex) frag.appendChild(document.createTextNode(str.slice(lastIndex, idx)));
          const matchText = sm[0];
          const span = document.createElement('span');
          span.className = 'detected-citation';
          span.textContent = matchText;
          frag.appendChild(span);
          const g = document.createElement('a');
          g.href = 'https://www.google.com/search?q=' + encodeURIComponent(matchText);
          g.target = '_blank';
          g.className = 'citation-link google-citation';
          g.textContent = 'G';
          frag.appendChild(g);
          const p = document.createElement('a');
          p.href = 'https://pubmed.ncbi.nlm.nih.gov/?term=' + encodeURIComponent(matchText);
          p.target = '_blank';
          p.className = 'citation-link pubmed-citation';
          p.textContent = 'P';
          frag.appendChild(p);
          lastIndex = idx + matchText.length;
          li++;
        }
      }

      if (lastIndex < str.length) frag.appendChild(document.createTextNode(str.slice(lastIndex)));
      parent.replaceChild(frag, txtNode);
    });
  });
}


function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

const areEqualArrays = (first, second) => {
  if (first.length !== second.length) {
    return false;
  };
  for (let i = 0; i < first.length; i++) {
    if (!second.includes(first[i])) {
      return false;
    };
  };
  return true;
};

function loadQuestion(n, isExam = false) {
  saveOpenQuestion(n);
  let question_list = isExam ? exam_questions : filtered_questions;
  let question_number = question_list.length;

  $("#header").empty();
  $("#main").empty();
  $("#feedback").empty();
  $("#question-details").empty();

  // Hide any open search popups
  $("span.popup-tag").css("display", "none");

  if (question_number == 0) {
    $("#header").append(
      "No questions to show. Refine your filter(s)/search or load more questions."
    );
    return;
  }

  // Stop trying to load negative questions
  n = Math.max(0, n);
  n = Math.min(question_number - 1, n);

  // convert n to the hash
  let qid = question_list[n];
  let data = isExam ? (exam_questions_data[qid] || questions[qid]) : questions[qid];

  let question_type = data["type"];

  current_question_uid = qid;

  // Enable the question-details toggle now that a question is loaded
  try {
    const $qToggle = $("#question-details-toggle");
    $qToggle.removeClass('disabled');
    $qToggle.find('button').prop('disabled', false).attr('aria-disabled', 'false');
  } catch (e) {
    console.warn('Unable to enable question-details-toggle', e);
  }

  let m = n + 1;

  if (isExam) {
    updateExamTimerDisplay();
  }

  $("#header").append(
    $(document.createElement("button"))
      .attr({
        //'type': 'button',
        class: "previous-button",
        value: "Previous",
        title: "Click: previous question • Shift+Click: -10 • Ctrl/Cmd+Click: previous unanswered"
      })
      .text("Previous")
  );

  $("#header").append(
    $(document.createElement("span"))
      .attr({
        id: "header-text"
      })
      .text(isExam ? `Exam Question ${m} of ${question_number}` : `Question ${m} of ${question_number}`)
  );

  $("#header").append(
    $(document.createElement("button"))
      .attr({
        //'type': 'button',
        class: "next-button",
        id: "header-next-button",
        value: "Next",
        title: "Click: next question • Shift+Click: +10 • Ctrl/Cmd+Click: next unanswered"
      })
      .text("Next")
  );

  if (!isExam) {
    $("#header").append(
      $("<button id='flagged-button'>").click(function (qid) {
        toggleFlagged();
      })
    );

    db.flagged.get(current_question_uid).then((d) => {
      if (d == undefined) {
        $("#flagged-button").text("NOT FLAGGED");
      } else {
        $("#flagged-button").text("FLAGGED");
      }
      // We handle the error above
    }).catch(() => { })
  } else {
    if (exam_review_mode) {
      // In review mode, show both Exit Review and View Results buttons
      const buttonContainer = $("<div>").css({ display: "inline-block" });
      
      buttonContainer.append(
        $("<button id='end-exam-button'>").text("Exit Review").css({ marginRight: "8px" }).click(function () {
          endExam();
        })
      );
      
      buttonContainer.append(
        $("<button id='view-results-button'>").text("View Results").click(function () {
          viewExamResults(current_exam_id);
        })
      );
      
      $("#header").append(buttonContainer);
    } else {
      // In active exam mode, show only End Exam button
      $("#header").append(
        $("<button id='end-exam-button'>").text("End Exam").click(function () {
          endExam();
        })
      );
    }
  }

  // Set up the question details block using semantic label/value rows
  try {
    const $qd = $("#question-details");
    $qd.empty();
    $qd.append($(document.createElement('h3')).text('Question details'));

    function qdRow(label, value) {
      const $row = $(document.createElement('div')).addClass('qd-row');
      $row.append($(document.createElement('span')).addClass('qd-label').text(label));
      $row.append($(document.createElement('span')).addClass('qd-value').text(value));
      return $row;
    }

    // Helper to normalise arrays/objects for display
    function displayValue(v) {
      if (v === undefined || v === null) return '';
      if (Array.isArray(v)) return v.join(', ');
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    }

    $qd.append(qdRow('ID:', qid));
    $qd.append(qdRow('Type:', displayValue(data['type'])));
    $qd.append(qdRow('Source:', displayValue(data['source'])));
    $qd.append(qdRow('Specialties:', displayValue(data['specialty'])));
    $qd.append(qdRow('Meta:', displayValue(data['meta'])));
    $qd.append(qdRow('Date:', displayValue(data['date'])));
  } catch (e) {
    // Fallback to simple text if anything goes wrong
    try {
      $("#question-details").empty().append("Question details...<br />");
      $("#question-details").append("-------------------<br />");
      $("#question-details").append("ID: " + qid + "<br />");
      $("#question-details").append("Type: " + data["type"] + "<br />");
      $("#question-details").append("Source: " + data["source"] + "<br />");
      $("#question-details").append("Specialties: " + data["specialty"] + "<br />");
      $("#question-details").append("Meta: " + data["meta"] + "<br />");
      $("#question-details").append("Date: " + data["date"] + "<br />");
    } catch (err) { /* swallow */ }
  }

  $("#main").append(
    $(document.createElement("div")).attr({
      id: "question-block"
    })
  );

  let answer_block_x = 0;
  let answer_block_y = 0;
  if (
    window.element_positions.hasOwnProperty(question_type) &&
    window.element_positions[question_type].hasOwnProperty("answer-block")
  ) {
    answer_block_x = window.element_positions[question_type]["answer-block"].x;
    answer_block_y = window.element_positions[question_type]["answer-block"].y;
  }

  $("#main").append(
    $(document.createElement("div"))
      .attr({
        id: "answer-block",
        style:
          "transform:translate(" +
          answer_block_x +
          "px, " +
          answer_block_y +
          "px);"

        // update the posiion attributes
      })
      .data("x", answer_block_x)
      .data("y", answer_block_y)
  );


  function maintainFocusOnElement(el) {
    // Force focus to the input element (does this break anything?)
    el.on("blur", function () {
      // unless the options menu is open
      if ($("#options, #dicom-settings-panel").is(":visible")) {
        return;
      }
      var blurEl = $(this);
      setTimeout(function () {
        blurEl.focus();
      }, 10);
    });

  }

  function enterKeyChecks(el) {
    el.on("keyup", function (e) {
      if (e.keyCode == 13) {
        $(".check-button").click();
      }
    });

  }

  // Reposition element if saved in db

  let question, answers, options;
  switch (question_type) {
    case "sba":
      $("#question-block")
        .append("<br>")
        .append(data["question"])
        .append("<br>");

      appendAnswers(data["answers"], 1);

      break;

    case "emq":
      $("#question-block").append(
        $(document.createElement("ol")).attr({
          id: "emq-options"
        })
      );

      answer_options = data["emq_options"];

      for (n in answer_options) {
        $("#emq-options").append(
          $(document.createElement("li"))
            .attr({
              class: "emq-option"
            })
            .append(answer_options[n])
        );
      }

      $("#question-block").append(data["question"]);

      $("#answer-block").append(
        $(document.createElement("ol")).attr({
          id: "emq-questions"
        })
      );

      answers = data["answers"];

      for (a in answers) {
        selector = $(document.createElement("select")).attr({
          class: "emq-select-box"
        });

        // I can't decide if we should allow this flexibility
        // (currently also allowed for true false questions
        if (answers[a] instanceof Array) {
          actual_answer = answers[a][0];
          feedback = answers[a][1];
        } else {
          feeback = "";
          actual_answer = answers[a];
        }

        $("#emq-questions").append(
          $(document.createElement("li"))
            .attr({
              class: "emq-question",
              "data-answer": actual_answer,
              "data-feedback": feedback
            })
            .append(a)
            .append(selector)
        );

        selector.append(
          $(document.createElement("option"))
            .attr("value", "null")
            .text("--Select--")
        );

        $(answer_options).each(function (index, op) {
          selector.append(
            $(document.createElement("option"))
              .attr("value", op)
              .append(op)
          );
        });
      }

      $("#answer-block").append(
        $(document.createElement("button"))
          .attr({
            //'type': 'button',
            class: "check-button",
            value: "Check Answers"
          })
          .text("Check Answers")
          .click(checkAnswer)
      );

      break;

    case "mba":
      //let mba_answers = {};

      $("#question-block")
        .append("<br>")
        .append(data["background"])
        .append("<br>");

      for (i in data["question"]) {
        $("#answer-block")
          .append("<br>")
          .append(data["question"][i])
          .append("<br>");

        appendAnswers(data["answers"][i], i);
      }

      break;

    case "rank":
      $("#question-block")
        .append("<br>")
        .append(data["question"])
        .append("<br>");

      answers = data["answers"];
      $("#answer-block").append(
        $(document.createElement("ol")).attr({
          id: "sortable-list",
          //'class': 'answer-list allow-hover',
          "data-answered": 0
        })
      );

      options = Object.keys(answers);

      options.sort();

      buildRankList(options, answers);

      $("#sortable-list").sortable();

      $("#question-block").append("<br />");

      $("#answer-block").append(
        $(document.createElement("button"))
          .attr({
            //'type': 'button',
            class: "check-button",
            value: "Check Answers"
          })
          .text("Check Answers")
          .click(checkAnswer)
      );

      break;
    case "rapid":
      loadImage(data);

      answers = data["answers"];
      let is_normal = data["normal"];

      options = Object.keys(answers);

      options.sort();

      $("#answer-block").append(
        $(document.createElement("span"))
          .attr({
            id: "answer",
            //'data-option': option,
            "data-answer": answers,
            "data-normal": is_normal
            //'class': c,
            //'data-question-number': question_number
          })
          .append(
            $(document.createElement("input")).attr({
              //'id': "answer-input-"+option,
            })
          )
      );


      $("#answer-block").append("<br />");

      function submitNormal() {
        $("#answer input").val("Normal");
        checkAnswer();
      }

      $("#answer-block").append(
        $(document.createElement("button"))
          .attr({
            //'type': 'button',
            id: "normal-button",
            value: "Normal"
          })
          .text("Normal")
          .click(submitNormal)
      );

      $("#answer-block").append(
        $(document.createElement("button"))
          .attr({
            //'type': 'button',
            class: "check-button",
            value: "Check Answer"
          })
          .text("Check Answer")
          .click(checkAnswer)
      );

      enterKeyChecks(
        $("#answer-block input")
          .focus()
      )

      maintainFocusOnElement($("#answer-block input"));

      break;
    case "image_answer":
      loadImage(data);
      console.log(data)

      question = data["question"];
      answers = data["answers"];

      options = Object.keys(answers);

      options.sort();

      $("#answer-block").append(
        $(document.createElement("span"))
          .attr({
            id: "answer",
            //'data-option': option,
            "data-answer": answers
            //'class': c,
            //'data-question-number': question_number
          })
          .append(
            $(document.createElement("span")).attr({
              'class': "question-text",
            }).html(question)
          )
          .append(
            $(document.createElement("input")).attr({
              //'id': "answer-input-"+option,
            })
          )
      );

      $("#answer-block").append(
        $(document.createElement("button"))
          .attr({
            //'type': 'button',
            class: "check-button",
            value: "Check Answer"
          })
          .text("Check Answer")
          .click(checkAnswer)
      );

      enterKeyChecks($("#answer-block input").focus())

      maintainFocusOnElement($("#answer-block input"));
      break;
    case "label":
      loadImage(data);

      answers = data["answers"];
      $("#answer-block").append(
        // In display terms a table would probably work better than a list
        $(document.createElement("ul")).attr({
          id: "answer-list"
          //'class': 'answer-list allow-hover',
          //'data-answered' : 0
        })
      );

      options = Object.keys(answers);

      options.sort();

      //buildRankList(options, answers);
      for (var i = 0; i < options.length; i++) {
        let option = options[i];
        $("#answer-list").append(
          $(document.createElement("li"))
            .attr({
              id: "answer-" + option,
              "data-option": option,
              "data-answer": answers[option]
              //'class': c,
              //'data-question-number': question_number
            })
            .append($(document.createElement("span")).text(option + ":"))
            .append(
              $(document.createElement("input")).attr({
                //'id': "answer-input-"+option,
              })
            )
        );
      }

      //$("#sortable-list").sortable();

      $("#answer-block").append("<br />");

      $("#answer-block").append(
        $(document.createElement("button"))
          .attr({
            //'type': 'button',
            class: "check-button",
            value: "Check Answers"
          })
          .text("Check Answers")
          .click(checkAnswer)
      );

      enterKeyChecks($("#main input").focus())

      $("#answer-list input")
        .first()
        .focus();

      break;

    case "tf":
      $("#question-block")
        .append("<br>")
        .append(data["question"])
        .append("<br>");

      answers = data["answers"];

      $("#answer-block").append(
        $(document.createElement("ol")).attr({
          id: "question-" + question_number + "-answers",
          class: "tf-answer-block answer-list allow-hover no-select",
          "data-answered": 0
        })
      );

      options = Object.keys(answers);

      let ordered = false;

      let tf =
        "<span class='tf-answer-options'><span class='tf-true'>True</span> / <span class='tf-false'>False</span></span>";

      // Test if it is an ordered list
      if (options[0].substring(0, 2).match(/[A-Z]\./i)) {
        options.sort();
        // If it is we must maintain the order. Otherwise
        // we can randomise it. (NOT YET IMPLEMENTED)
        ordered = true;
      }

      i = 0;
      for (n in options) {
        let a = options[n];

        // I can't decide if we should allow this flexibility
        let actual_answer, feedback;
        if (answers[a] instanceof Array) {
          actual_answer = answers[a][0];
          feedback = answers[a][1];
        } else {
          feedback = "";
          actual_answer = answers[a];
        }

        let c = `no-select ${actual_answer}`;
        if (ordered) {
          c = c + " alpha-list";
          a = options[n].substring(2);
        }

        $("#question-" + question_number + "-answers").append(
          $(document.createElement("li"))
            .attr({
              id: "q" + question_number + "a" + i,
              class: c,
              "data-question-number": question_number,
              "data-feedback": feedback
              //}).append(a).append(tf).click(function(e) {
            })
            .append("<span class='answer-option-link'>" + a + "</span>")
            .append(tf)
            .on("click touchend contextmenu", function (e) {
              if (e.type == "contextmenu") {
                e.preventDefault();
              }

              if (e.type == "click") detectTap = true; // Detects click events
              if (detectTap) {
                $(e.currentTarget).toggleClass("tf_answer_true");
                //if ($(e.currentTarget).find(".tf-active").length > 0) {
                //    $(e.currentTarget).find(".tf-true, .tf-false").toggleClass("tf-active");

                //} else {
                //    $(e.currentTarget).find(".tf-true").addClass("tf-active");
                //}
              }
            })
        );
        i = i + 1;
      }

      // Not sure what this is for????
      //$(".tf-true, .tf-false")
      //  .off()
      //  .click(function (e) {
      //        console.log(e)
      //    $(e.currentTarget).toggleClass("tf_answer_true");
      //    //$(e.currentTarget.parentNode).children().removeClass("tf-active");
      //    //$(e.currentTarget).addClass("tf-active");
      //    e.stopPropagation();
      //  });

      $("#answer-block").append("<br />");

      $("#answer-block").append(
        $(document.createElement("button"))
          .attr({
            //'type': 'button',
            class: "check-button",
            value: "Check Answers"
          })
          .text("Check Answers")
          .click(checkAnswer)
      );

      break;

    default:
      $("#question-block").append(
        "QUESTION TYPE NOT IMPLEMENTED YET!<br/><br/>" + question_type
      );

      break;
  }

  //$("#main").append("<div id='bottom-nav-buttons'></div>");

  //$("#bottom-nav-buttons").append(
  //    $(document.createElement("button")).attr({
  //        //'type': 'button',
  //        'id': 'lower-next-button',
  //        'class': 'next-button',
  //        'label': "Next",
  //        'value': "Next",
  //    }).text("Next")
  //);

  $(".previous-button").off();
  $(".previous-button").each(function (index, e) {
    // ensure tooltip explains modifier behaviour
    if (!$(e).attr('title')) {
      $(e).attr('title', 'Click: previous question • Shift+Click: -10 • Ctrl/Cmd+Click: previous unanswered');
    }
    $(e).click(previousQuestion);
  });

  $(".next-button").off();
  $(".next-button").each(function (index, e) {
    if (!$(e).attr('title')) {
      $(e).attr('title', 'Click: next question • Shift+Click: +10 • Ctrl/Cmd+Click: next unanswered');
    }
    $(e).click(nextQuestion);
  });

  if (auto_load_previous_answers) {
    console.log(qid)
    // In exam mode, load exam-specific answers
    const answerQid = exam_mode ? `${current_exam_id}_${qid}` : qid;
    window.db.answers.where("qid").equals(answerQid).first((ans) => {
      // if(!ans.hasOwnProperty("autoload") || ans["autoload"] == true) {
      //   checkAnswer(ans, true);
      // }
      if (ans != undefined) {
        checkAnswer(ans, true);
        // In exam mode, also show the selected feedback
        if (exam_mode && !exam_review_mode && ans.other && ans.other.target_id) {
          let selected_text = $("#" + ans.other.target_id).text();
          $("#feedback").append("Selected: " + selected_text);
        }
      }

    });
  }

  //scrollTo(0, $("#content").position().top);

  if (fix_broken_question_formatting) {
    $(".btn-link").remove();
    $(".btn-xs").remove();
  }
  //MathJax.Hub.Queue(["Typeset", MathJax.Hub, "MathExample"]);
  createRemoteStoreButtonIfRequired();

  // Keyboard navigation: arrows for previous/next. Respect modifiers.
  $(document).off('keydown.jquiz-nav');
  $(document).on('keydown.jquiz-nav', function (e) {
    // Ignore typing inside inputs/textareas
    const tgt = e.target || e.srcElement;
    const tag = tgt && tgt.tagName ? tgt.tagName.toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tgt.isContentEditable) return;

    if (e.key === 'ArrowLeft') {
      // left arrow => previous
      previousQuestion(e);
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      // right arrow => next
      nextQuestion(e);
      e.preventDefault();
    }
  });

  // Preload images for the next N questions
  // (N = preload_images value)
  let x = 1;
  while (x <= preload_images) {
    let data = getQuestionDataByNumber(n + x);

    // TODO: This should be rewritten
    if (typeof data !== "undefined" && data.hasOwnProperty("images")) {
      data["images"].forEach(function (img) {
        setTimeout(function () {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", img);
          xhr.send("");
        }, 1000);
      });
    }

    x = x + 1;
  }

  interact("#answer-block").draggable({
    // enable inertial throwing
    inertia: true,
    // keep the element within the area of it's parent
    modifiers: [
      interact.modifiers.restrictRect({
        restriction: "parent",
        endOnly: true
      })
    ],
    // enable autoScroll
    autoScroll: true,
    allowFrom: ".drag-handle",

    listeners: {
      // call this function on every dragmove event
      move: dragMoveListener,

      // call this function on every dragend event
      // end(event) {
      //   var textEl = event.target.querySelector("p");

      //   textEl &&
      //     (textEl.textContent =
      //       "moved a distance of " +
      //       Math.sqrt(
      //         (Math.pow(event.pageX - event.x0, 2) +
      //           Math.pow(event.pageY - event.y0, 2)) |
      //         0
      //       ).toFixed(2) +
      //       "px");
      // }
    }
  });

  function dragMoveListener(event) {
    var target = event.target;
    // keep the dragged position in the data-x/data-y attributes
    var x = (parseFloat(target.getAttribute("data-x")) || 0) + event.dx;
    var y = (parseFloat(target.getAttribute("data-y")) || 0) + event.dy;

    moveElement(target, x, y);
  }
}

function moveElement(element, x, y) {
  // translate the element
  element.style.webkitTransform = element.style.transform =
    "translate(" + x + "px, " + y + "px)";

  // update the posiion attributes
  element.setAttribute("data-x", x);
  element.setAttribute("data-y", y);

  db.element_position.put({
    type: questions[current_question_uid].type,
    element: element.id,
    x: x,
    y: y
  });

  let question_type = questions[current_question_uid].type;

  if (!window.element_positions.hasOwnProperty(question_type)) {
    window.element_positions[question_type] = {};
  }
  if (!window.element_positions[question_type].hasOwnProperty(element.id)) {
    window.element_positions[question_type][element.id] = {};
  }

  window.element_positions[question_type][element.id] = {
    x: x,
    y: y
  };
}

function loadImage(data) {
  if (image_viewer == "cornerstone") {
    dicomViewer.loadCornerstone($("#main"), db, data["images"], data["annotations"]);
  } else {
    $("#main")
      .append("<br>")
      .append(data["question"])
      .append("<br>");

    if (data["images"] != undefined) {
      data["images"].forEach(function (img) {
        $("#main").append(
          $(document.createElement("img")).attr({
            src: img
          })
        );
      });
    }
  }
  $("#answer-block").addClass("answer-block-floating");
  $("#answer-block").append($("<span class='drag-handle'>+</span>;"));
}


function appendAnswers(answers, question_number) {
  //$("#main").append("<ol id='question-1-answers' class='answer-list'>");
  $("#answer-block").append(
    $(document.createElement("ol")).attr({
      id: "question-" + question_number + "-answers",
      class: "answer-list allow-hover",
      "data-answered": 0
    })
  );

  var options = Object.keys(answers);

  var ordered = false;

  // Test if it is an ordered list
  if (options[0].substring(0, 2).match(/[A-Z]\./i)) {
    options.sort();
    // If it is we must maintain the order. Otherwise
    // we can randomise it. (NOT YET IMPLEMENTED)
    ordered = true;
  }

  let i = 0;
  for (let n in options) {
    let a = options[n];

    // Determine actual answer text and optional feedback
    let actual_answer, feedback;
    if (answers[a] instanceof Array) {
      actual_answer = answers[a][0];
      feedback = answers[a][1];
    } else {
      feedback = "";
      actual_answer = answers[a];
    }

    let c = "no-select " + actual_answer;
    if (ordered) {
      c = c + " alpha-list";
      a = options[n].substring(2);
    }

    $("#question-" + question_number + "-answers").append(
      $(document.createElement("li"))
        .attr({
          id: "q" + question_number + "a" + i,
          class: c,
          "data-question-number": question_number,
          "data-feedback": feedback
        })
        .append("<span class='answer-option-link'>" + a + "</span>")
        .on("click touchend contextmenu", function (e) {
          if (e.type == "contextmenu") {
            e.preventDefault();
          }
          // For normal SBA/MBA interactions, forward the event to checkAnswer
          checkAnswer(e);
        })
    );
    i = i + 1;
  }
  }
  
function buildRankList(options, answers) {
  for (var i = 0; i < options.length; i++) {
    option = options[i];

    //c = answers[n];
    const displayText = (exam_mode && !exam_review_mode) ? option : (option + " - " + answers[option]);

    $("#sortable-list").append(
      $(document.createElement("li"))
        .attr({
          id: "answer-" + option,
          "data-option": option
          //'class': c,
          //'data-question-number': question_number
        })
        .text(displayText)
    );
  }
}


function checkAnswer(ans, load) {
  //load = "undefined";
  //load = typeof load !== 'undefined' ? load : false;
  //
  //needed to stop anchor momevent
  //e.preventDefault();

  let data = questions[current_question_uid];

  //current_question_uid_hash = hash_n_map[current_question_uid];

  let question_type = data["type"];

  $("#feedback").empty();

  // During active exam, record the answer and show selection
  if (exam_mode && !exam_review_mode) {
    // Still save the answer, but don't show correctness feedback
    switch (question_type) {
      case "sba":
        let return_value = checkBestAnswer(ans, load);
        if (return_value.s) {
          saveAnswerToHashMap(current_question_uid, "sba", return_value.score, 1, {
            target_id: return_value.t,
            question_number: return_value.q,
            answer: return_value.a
          });
        }
        // Remove selected class from all answers first
        $("#question-" + return_value.q + "-answers li").removeClass("selected");
        // Add selected class to the newly chosen answer
        $("#" + return_value.t).addClass("selected");
        // Show selected answer
        let selected_text = $("#" + return_value.t).text();
        $("#feedback").empty().append("Selected: " + selected_text);
        break;
      default:
        // For other types, record answer and show message
        $("#feedback").empty().append("Answer recorded.");
        break;
    }
    
    // Don't remove click events in exam mode - allow answer changes
    return;
  }

  let best_sim, best_answer, sim, replaced_lower_case_answer, score, max_score, a, diff, fragment, span, color;

  switch (question_type) {
    case "sba":
      let return_value = checkBestAnswer(ans, load);

      if (return_value.s) {
        saveAnswerToHashMap(current_question_uid, "sba", return_value.score, 1, {
          target_id: return_value.t,
          question_number: return_value.q,
          answer: return_value.text
        });
      }
      break;

    // case "emq":
    //   if(load == true) {
    //     let i = 0;
    //     $(".emq-select-box").each(function (index, option) {
    //       $(option).val(e["answer"][i]);
    //       i = i + 1;
    //     });
    //   }

    //   var answers = [];
    //   var correct = [];
    //   var n_correct = 0;
    //   $(".emq-question").each(function (index, option) {
    //     select = $(option).children("select");

    //     selected_option = select.val();
    //     correct_option = option.getAttribute("data-answer");
    //     feedback = option.getAttribute("data-feedback");

    //     // Don't display feedback if none has been defined
    //     if(feedback == null) {
    //       feedback = "";
    //     }

    //     select.remove();

    //     answers.push(selected_option);

    //     if(correct_option == selected_option) {
    //       $(option).append(
    //         "<br/><span class='emq-answer-feedback correct'>Correct: <b>" +
    //         correct_option +
    //         "</b> is the right answer<br/>-----------<br/>" +
    //         feedback +
    //         "</span>"
    //       );
    //       correct.push("correct");
    //       n_correct = n_correct + 1;
    //     } else {
    //       //$(option).addClass("incorrect");
    //       $(option).append(
    //         "<br/><span class='emq-answer-feedback incorrect'>Incorrect: <b>" +
    //         correct_option +
    //         "</b> is the right answer (you said <i>" +
    //         selected_option +
    //         "</i>)<br/>-----------<br/>" +
    //         feedback +
    //         "</span>"
    //       );
    //       correct.push("incorrect");
    //     }
    //   });

    //   $(".check-button").remove();

    //   // Save answer
    //   saveAnswerToHashMap(current_question_uid, {
    //     type: "emq",
    //     date: Date(),
    //     answer: answers,
    //     correct: correct,
    //     n_correct: n_correct
    //   });

    //   break;
    // case "mba":
    //   if(load == true) {
    //     for(i in e["answers"]) {
    //       p = e["answers"][i];
    //       checkBestAnswer(p, load);
    //     }
    //   } else {
    //     var save_answer = false;

    //     return_value = checkBestAnswer(e, load);

    //     if(return_value.s) {
    //       mba_answers[return_value.q] = {
    //         target_id: return_value.t,
    //         answer: return_value.a,
    //         question_number: return_value.q
    //       };
    //     }

    //     n = $(".answer-list").length;

    //     if(n == Object.size(mba_answers)) {
    //       saveAnswerToHashMap(current_question_uid, {
    //         type: "mba",
    //         answers: mba_answers,
    //         date: Date.now()
    //       });
    //     } else {
    //       // Don't show feedback until all the questions have been
    //       // attempted
    //       return;
    //     }
    //   }

    //   break;
    case "rapid":
      if (load == true) {
        //
        //                // If we are loading an answer we clear our answer list
        //                // and rebuild it from the saved answer.
        //                //$("#sortable-list").empty();
        //                //buildRankList(e['order'], data['answers']);
        console.log(ans["other"]["answer"]);
        $("#answer input").val(ans["other"]["answer"]);
        //                //i = 0;
        //                $("#answer-list li").each(function(index, option) {
        //                    $(option).find("input").val(e["answers"][option.getAttribute("data-option")]);
        //                    //i = i+1;
        //                });
      }

      var answers = {};

      var correct = false;

      correct_answers = $("#answer")
        .attr("data-answer")
        .split(",");
      let is_normal = $("#answer").attr("data-normal");

      a = $("#answer input")
        .val()
        .trim();

      $("#answer input").attr("disabled", "disabled");

      $("#answer-block").append($(document.createElement("br")));

      correct = false;

      if (is_normal == "true") {
        // Correct normal
        if (a.toLowerCase() == "normal" || a == "") {
          $("#answer").addClass("correct");
          correct = true;
        } else {
          // Overcall
          $("#answer").addClass("incorrect");
          $("#answer-block").append(
            $(document.createElement("span"))
              .attr({
                class: "answer-overcall"
              })
              .text("It's normal!")
          );
        }
      } else {
        if (a.toLowerCase() == "normal" || a == "") {
          $("#answer").addClass("incorrect");
          $("#answer-block").append(
            $(document.createElement("span"))
              .attr({
                class: "answer-undercall"
              })
              .text("Incorrect - " + correct_answers[0])
          );
        } else {
          best_sim = 0;
          best_answer = correct_answers[0];
          correct_answers.forEach(function (option) {
            sim = similarity(a.toLowerCase(), option.toLowerCase());
            if (sim > best_sim) {
              best_answer = option;
              best_sim = sim;
            }
          });

          replaced_lower_case_answer = best_answer
            .toLowerCase()
            .replace("left", "")
            .replace("right", "");

          if (!(exam_mode && !exam_review_mode)) {
            $("#answer-block").append(
              $(document.createElement("span"))
                .attr({
                  class: "label-correct-answer-text"
                })
                .text(best_answer)
                .append(
                  $(document.createElement("span"))
                    .attr({
                      class: "label-similarity"
                    })
                    .text("(" + Math.round(best_sim * 100) / 100 + ")")
                )
                .append(
                  $(document.createElement("a"))
                    .attr({
                      href:
                        "https://www.google.com/search?q=" +
                        replaced_lower_case_answer,
                      target: "newtab",
                      class: "google-answer",
                      title: "Search Google for " + replaced_lower_case_answer
                    })
                    .text("G")
                )
                .append(
                  $(document.createElement("a"))
                    .attr({
                      href:
                        "https://www.imaios.com/en/content/search?SearchText=" +
                        replaced_lower_case_answer,
                      target: "newtab",
                      class: "imaios-answer",
                      title: "Search Imaios for " + replaced_lower_case_answer
                    })
                    .text("I")
                )
            );
          }

          if (best_sim >= similarity_limit) {
            if (!(exam_mode && !exam_review_mode)) {
              $("#answer").addClass("correct");
              $("#answer").addClass("similarity-correct");
            }
            // n_correct = n_correct + 1;
            correct = true;
          } else {
            if (!(exam_mode && !exam_review_mode)) {
              $("#answer").addClass("incorrect");
            }
          }
        }
        if (!(exam_mode && !exam_review_mode)) {
          $("#answer-block").append(
            $(document.createElement("p"))
              .attr({
                id: "acceptable-answers"
              })
              .text("Acceptable answers: ")
          );
          correct_answers.forEach(function (option) {
            $("#acceptable-answers").append(option + ", ");
          });
        }
      }

      $("#feedback").append("<br />");

      // Add explicit feedback in review mode
      if (exam_mode && exam_review_mode) {
        $("#feedback").append("<strong>Your answer:</strong> " + a + "<br/>");
      }

      $("#normal-button").remove();
      $(".check-button").remove();

      score = 0;
      if (correct) { score = 1 }

      // Save answer
      if (load != true) {
        saveAnswerToHashMap(current_question_uid, "rapid", score, 1, {
          answer: a,
          correct: correct
        });
      }

      break;
    case "image_answer":
      if (load == true) {
        //
        //                // If we are loading an answer we clear our answer list
        //                // and rebuild it from the saved answer.
        //                //$("#sortable-list").empty();
        //                //buildRankList(e['order'], data['answers']);
        console.log(ans["other"]["answer"]);
        $("#answer input").val(ans["other"]["answer"]);
        //                //i = 0;
        //                $("#answer-list li").each(function(index, option) {
        //                    $(option).find("input").val(e["answers"][option.getAttribute("data-option")]);
        //                    //i = i+1;
        //                });
      }

      var answers = {};

      var correct = false;

      correct_answers = $("#answer")
        .attr("data-answer")
        .split(",");

      a = $("#answer input").val();
      $("#answer input").attr("disabled", "disabled");
      best_sim = 0;
      best_answer = correct_answers[0];

      correct_answers.forEach(function (option) {
        sim = similarity(a.toLowerCase(), option.toLowerCase());
        if (sim > best_sim) {
          best_answer = option;
          best_sim = sim;
        }
      });

      if (best_sim < 1) {
        $.each(wordlist, function (key, value) {
          if (
            best_answer.toLowerCase().indexOf(key) != -1 &&
            a.toLowerCase().indexOf(value) != -1 &&
            best_answer.toLowerCase().indexOf(value) == -1
          ) {
            best_sim = -1;
          }

          if (
            best_answer.toLowerCase().indexOf(value) != -1 &&
            a.toLowerCase().indexOf(key) != -1 &&
            best_answer.toLowerCase().indexOf(key) == -1
          ) {
            best_sim = -1;
          }

          if (best_sim < 0) {
            $("#answer").append(
              $(document.createElement("span"))
                .attr({
                  id: "unique-words"
                })
                .text(key + " != " + value + ": ")
            );

            return false;
          }
        });
      }

      // Display a colour diff for similar answers
      if (best_sim < 1 && best_sim > min_colour_diff) {
        diff = JsDiff.diffChars(a.toLowerCase(), best_answer.toLowerCase());
        fragment = document.createDocumentFragment();
        span = null;
        diff.forEach(function (part) {
          // green for additions, red for deletions
          // grey for common parts
          color = part.added ? "green" : part.removed ? "red" : "grey";
          span = document.createElement("span");
          span.style.color = color;
          span.appendChild(document.createTextNode(part.value));
          fragment.appendChild(span);
        });
        $("#answer").append(fragment);
      }

      replaced_lower_case_answer = best_answer
        .toLowerCase()
        .replace("left", "")
        .replace("right", "");
      if (!(exam_mode && !exam_review_mode)) {
        $("#answer-block").append(
          $(document.createElement("span"))
            .attr({
              class: "label-correct-answer-text"
            })
            .text(best_answer)
            .append(
              $(document.createElement("span"))
                .attr({
                  class: "label-similarity"
                })
                .text("(" + Math.round(best_sim * 100) / 100 + ")")
            )
        );
        addAnatomySearchLinks("#answer-block", replaced_lower_case_answer);
      }

      if (!(exam_mode && !exam_review_mode)) {
        $("#answer-block").append(
          $(document.createElement("p"))
            .attr({
              id: "acceptable-answers"
            })
            .text("Acceptable answers: ")
        );
        correct_answers.forEach(function (option) {
          $("#acceptable-answers").append(option + ", ");
        });
      }

      correct = false;
      score = 0;
      if (best_sim >= similarity_limit) {
        if (!(exam_mode && !exam_review_mode)) {
          $("#answer input").addClass("correct");
          $("#answer input").addClass("similarity-correct");
        }
        // n_correct = n_correct + 1;
        correct = true;
        score = 1;
      } else {
        if (!(exam_mode && !exam_review_mode)) {
          $("#answer input").addClass("incorrect");
        }
      }

      $("#feedback").append("<br />");

      // Add explicit feedback in review mode
      if (exam_mode && exam_review_mode) {
        $("#feedback").append("<strong>Your answer:</strong> " + a + "<br/>");
      }

      $(".check-button").remove();

      // Save answer
      if (load != true) {
        saveAnswerToHashMap(current_question_uid, "image_answer", score, 1, {
          answer: a,
          correct: correct
        });
      }

      break;
    case "label":
      if (load == true) {
        // If we are loading an answer we clear our answer list
        // and rebuild it from the saved answer.
        //$("#sortable-list").empty();
        //buildRankList(e['order'], data['answers']);
        console.log(ans["other"]["answers"]);
        //i = 0;
        $("#answer-list li").each(function (index, option) {
          $(option)
            .find("input")
            .val(ans["other"]["answers"][option.getAttribute("data-option")]);
          //i = i+1;
        });
      }

      var answers = {};

      var correct = [];
      var n_correct = 0;

      var correct_answers = [];

      $("#answer-list li").each(function (index, option) {
        let aid = option.getAttribute("data-option");
        let correct_answer = option.getAttribute("data-answer");
        correct_answers.push(correct_answer);

        let input_box = $(option).find("input");
        let a = input_box.val();
        input_box.replaceWith(
          $(document.createElement("span"))
            .attr({
              class: "label-answer-text"
            })
            .text(a)
        );

        if (a.toLowerCase() == correct_answer.toLowerCase()) {
          if (!(exam_mode && !exam_review_mode)) {
            $(option).addClass("correct");
          }
          n_correct = n_correct + 1;
          correct.push("correct");
        } else {
          if (!(exam_mode && !exam_review_mode)) {
            $(option).append(
              $(document.createElement("span"))
                .attr({
                  class: "label-correct-answer-text"
                })
                .text(correct_answer)
            );
          }

          let sim = similarity(a, correct_answer);

          if (!(exam_mode && !exam_review_mode)) {
            $(option).append(
              $(document.createElement("span"))
                .attr({
                  class: "label-similarity"
                })
                .text("(" + Math.round(sim * 100) / 100 + ")")
            );
          }

          if (sim >= similarity_limit) {
            if (!(exam_mode && !exam_review_mode)) {
              $(option).addClass("correct");
              $(option).addClass("similarity-correct");
            }
            n_correct = n_correct + 1;
            correct.push("correct");
          } else {
            if (!(exam_mode && !exam_review_mode)) {
              $(option).addClass("incorrect");
            }
            correct.push("incorrect");
          }
        }
        let replaced_lower_case_answer = correct_answer
          .toLowerCase()
          .replace("left", "")
          .replace("right", "");

        addAnatomySearchLinks(option, replaced_lower_case_answer);

        answers[aid] = a;
      });

      $("#feedback").append("<br />");

      $(".check-button").remove();

      max_score = $("#answer-list li").length;

      // Save answer
      if (load != true) {
        saveAnswerToHashMap(current_question_uid, "label", n_correct, max_score, {
          answers: answers,
          correct: correct,
        });
      }

      break;
    case "rank":
      if (load == true) {
        // If we are loading an answer we clear our answer list
        // and rebuild it from the saved answer.
        $("#sortable-list").empty();
        buildRankList(ans["other"]["order"], data["answers"]);
      }

      order = [];

      correct_order = data["answer_order"].split("");

      map = {};

      for (i in correct_order) {
        map[correct_order[i]] = i;
      }

      number_options = correct_order.length;

      var i = 0;

      var neg_marks = 0;

      // Max score is based upon the vumber of options
      max_score = 0;
      for (var x = 1; x < number_options; x++) {
        max_score = max_score + x;
      }
      max_score = max_score + Math.floor(number_options / 2);

      $("#sortable-list li").each(function (index, option) {
        aid = option.getAttribute("data-option");
        order.push(aid);

        diff = Math.abs(i - map[aid]);

        // Only apply color coding if not in active exam mode
        if (!(exam_mode && !exam_review_mode)) {
          hue = ((number_options - 1 - diff) / (number_options - 1)) * 120;
          $(option).css({ "background-color": "hsl(" + hue + ", 100%, 50%)" });
        }

        neg_marks = neg_marks + diff;

        i++;
      });

      score = max_score - neg_marks;

      hue = (score / max_score) * 120;

      $("#feedback").append(
        "<span style='color: gray'>The current colour scheme probably gives to much of a positive impression (you have to really mess up your order to see red shades) and should therefore probably be given a more negative skew. Any advice or suggestions would be appreciated.</span>"
      );
      $("#feedback").append("<br />");
      $("#feedback").append(
        $("<p>Your score: " + score + "/" + max_score + "</p>").css({
          "background-color": "hsl(" + hue + ", 100%, 50%)"
        })
      );
      $("#feedback").append("<br />");
      if (!(exam_mode && !exam_review_mode)) {
        $("#feedback").append("The correct order is " + correct_order);

        $("#feedback").append(
          $(document.createElement("ol")).attr({
            id: "correct-list",
            //'class': 'answer-list allow-hover',
            "data-answered": 0
          })
        );

        for (item in correct_order) {
          option = correct_order[item];

          $("#correct-list").append(
            $(document.createElement("li"))
              .attr({
                id: "correct-answer-" + option,
                "data-option": option
                //'class': c,
                //'data-question-number': question_number
              })
              .text(option + " - " + data["answers"][option])
          );
        }
      }

      // Add explicit feedback in review mode
      if (exam_mode && exam_review_mode) {
        $("#feedback").append("<br/><strong>Your order:</strong> " + order.join(", "));
        $("#feedback").append("<br/><strong>Correct order:</strong> " + correct_order.join(", "));
      }

      // Disable the sortable (it may be good to allow multiple attempts)
      $("#sortable-list").sortable("disable");

      $("#feedback").append("<br />");

      $(".check-button").remove();

      // Save answer
      if (load != true) {
        saveAnswerToHashMap(current_question_uid, "rank", score, max_score, {
          order: order,
          correct_order: correct_order,
        });
      }

      break;
    case "tf":
      var save_answer = true;

      if (load == true) {
        var save_answer = false;

        $(".tf-answer-block li").each(function (index, option) {
          if (ans["other"].answer[index] == 1) {
            //$(option).find(".tf-true").addClass("tf-active");
            $(option).addClass("tf_answer_true");
          }
        });
      }

      answers = [];
      correct = [];
      n_correct = 0;
      let answer, answer_option;
      // True / False answers default to false if not selected

      $(".tf-answer-block li").each(function (index, option) {
        let feedback = option.getAttribute("data-feedback");

        //a = $(option).find(".tf-active");
        //a = $(option).find(".tf_answer_true");
        //

        if ($(option).hasClass("tf_answer_true")) {
          answer = 1;
          answers.push(1);
        } else {
          //$(option).find(".tf-false").addClass("tf-active");
          answer = 0;
          answers.push(0);
        }

        answer_option = "This is True. ";
        if ($(option).hasClass("0")) {
          answer_option = "This is False. ";
        }

        if ($(option).hasClass(answer)) {
          if (!(exam_mode && !exam_review_mode)) {
            $(option).addClass("correct");
          }
          correct.push("correct");
          n_correct = n_correct + 1;
          if (!(exam_mode && !exam_review_mode)) {
            $(option).append(
              "<br/><span class='emq-answer-feedback'>" +
              answer_option +
              feedback +
              "</span>"
            );
          }
        } else {
          if (!(exam_mode && !exam_review_mode)) {
            $(option).addClass("incorrect");
          }
          correct.push("incorrect");
          if (!(exam_mode && !exam_review_mode)) {
            $(option).append(
              "<br/><span class='emq-answer-feedback'>" +
              answer_option +
              feedback +
              "</span>"
            );
          }
        }
      });

      max_score = answers.length

      // Add explicit feedback in review mode
      if (exam_mode && exam_review_mode) {
        $("#feedback").append("<br/><strong>Review:</strong><br/>");
        $(".tf-answer-block li").each(function (index, option) {
          let question_text = $(option).find('.tf-question').text();
          let user_answer = $(option).hasClass("tf_answer_true") ? "True" : "False";
          let correct_answer = $(option).hasClass("1") ? "True" : "False";
          $("#feedback").append("Q: " + question_text + " - Your answer: " + user_answer + ", Correct: " + correct_answer + "<br/>");
        });
      }

      $(".tf-answer-block")
        .removeClass("allow-hover")
        .find("*")
        .each(function (index, e) {
          $(e).off();
        });

      if (save_answer == true) {
        saveAnswerToHashMap(current_question_uid,
          "tf",
          n_correct, max_score,
          {
            answer: answers,
            correct: correct,
          });
      }

      $(".check-button").remove();

      break;
  }

  // Remove unnecesary link tags
  $(".answer-option-link")
    .contents()
    .unwrap();

  // This may have been deleted if it was moved
  if ($("#feedback").length < 1) {
    $("#content").append('<div id="feedback"></div>');
  }

  if (!(exam_mode && !exam_review_mode)) {
    $("#feedback").prepend(data["feedback"]);
    $("#feedback").append("<br />");

    // Annotate simple citations in the feedback block so users can quickly
    // search them on PubMed or Google.
    try { annotateCitations($("#feedback")); } catch (e) { console.warn('annotateCitations failed', e); }

    if (data["external"] !== undefined) {
      $("#feedback").append("<br />");
      $("#feedback").append("<p>" + data["external"] + "</p>");
    }
  }

  // Check if we have a valid dicom displayed
  if ($(".single-dicom-viewer").length > 0) {
    // Move feedback location if we do
    $("#feedback").appendTo("#answer-block");
  }

  if (rebuild_score_list_on_answer && !(exam_mode && !exam_review_mode)) {
    buildActiveScoreList();
  }

  if (fix_broken_question_formatting) {
    $(".btn-link").remove();
    $(".btn-xs").remove();
  }

  last_answered_question = current_question_uid;

  createRemoteStoreButtonIfRequired();
}

function checkBestAnswer(e, load) {
  let target_id, save_answer, question_number, answer, text;
  console.log(e);
  if (load == true) {
    target_id = e["other"]["target_id"];
    save_answer = false;
    question_number = e["other"]["question_number"];
  } else {
    save_answer = true;
    target_id = e.currentTarget.getAttribute("id");
    question_number = e.currentTarget.getAttribute("data-question-number");
  }

  // Only show visual feedback if not in active exam mode
  if (!(exam_mode && !exam_review_mode)) {
    // Add the "correct" class to all answers that are correct
    $("#question-" + question_number + "-answers > .1").addClass("correct");
  }

  // Show selected answer during active exam mode
  if (exam_mode && !exam_review_mode) {
    $("#" + target_id).addClass("selected");
  }

  let score = 0;
  // Check if the selected answer is correct
  if ($("#" + target_id).hasClass("1")) {
    answer = "correct";
    score = 1;
    // Only add visual feedback if not in active exam mode
    if (!(exam_mode && !exam_review_mode)) {
      $("#" + target_id).addClass("correct");
    }
  } else {
    // If not we mark it as incorrect
    answer = "incorrect";
    // Only add visual feedback if not in active exam mode
    if (!(exam_mode && !exam_review_mode)) {
      $("#" + target_id).addClass("incorrect");
    }
  }

  // Add explicit feedback in review mode
  if (exam_mode && exam_review_mode) {
    let selected_answer_text = $("#" + target_id).text();
    let correct_answer_element = $("#question-" + question_number + "-answers > .1");
    let correct_answer_text = correct_answer_element.length > 0 ? correct_answer_element.text() : "Unknown";
    
    $("#feedback").append("<br/><strong>Your answer:</strong> " + selected_answer_text);
    $("#feedback").append("<br/><strong>Correct answer:</strong> " + correct_answer_text);
    $("#feedback").append("<br/>");
  }

  // Remove the click events from the answered question (but not in exam mode)
  if (!(exam_mode && !exam_review_mode)) {
    $("#question-" + question_number + "-answers")
      .removeClass("allow-hover")
      .children()
      .each(function (index, e) {
        $(e).off();
      });
  }

  // Add search links to answers
  $(".answer-list li").each(function (ind) {
    text = $(this).text();
    // Don't add links while the exam is in progress (only in exam review mode)
    if (exam_mode && !exam_review_mode) return;

    // Avoid appending duplicate link sets when answers are re-rendered.
    if ($(this).find('.answer-link').length > 0) return;

    // Build forms for statdx searches as it uses POST requests (only once per text)
    if ($("form[name='form" + text + "']").length === 0) {
      $("#main").append(
        $(
          `
            <form method="post" action="https://app.statdx.com/search"
            target="_blank" name="form` +
          text +
          `" style="display:none">
            <input type="hidden" name="startIndex" value="0">
            <input type="hidden" name="category" value="All">
            <input type="hidden" name="searchType" value="documents">
            <input type="hidden" name="documentTypeFilters" value='["all"]'>
            <input type="hidden" name="searchTerm" value="` +
          text +
          `">
            <input type="submit" value="Open results in a new window"> 
            </form>
        `
        )
      );
    }

    $(this)
      .append(
        $(document.createElement("a"))
          .attr({
            href: "https://www.google.com/search?q=" + text,
            target: "newtab",
            class: "google-answer answer-link",
            title: "Search Google for " + text
          })
          .text("G")
      )
      .append(
        $(document.createElement("a"))
          .attr({
            href:
              "https://radiopaedia.org/search?q=" +
              text.replace(/[^a-zA-Z0-9-_ ]/g, ""),
            target: "newtab",
            class: "radiopaedia-answer answer-link",
            title: "Search Radiopaedia for " + text
          })
          .text("R")
      )
      .append(
        $(document.createElement("a"))
          .attr({
            href: "https://statdx.com/search?q=" + text, // not actually used
            target: "newtab",
            class: "statdx-answer answer-link",
            title: "Search StatDx for " + text,
            onClick:
              "document.forms['form" + text + "'].submit(); return false;"
          })
          .text("S")
      );
  });


  return {
    t: target_id,
    q: question_number,
    a: answer,
    text: $("#" + target_id).text(),
    s: save_answer,
    score: score
  };
}

function saveAnswerToHashMap(qid, type, score, max_score, other) {
  if (exam_mode) {
    exam_answers[qid] = { score, max_score, correct: score === max_score };
    // Save exam state for persistence across page reloads
    saveExamState();
    // Save exam-specific answers with compound key
    const examSpecificQid = `${current_exam_id}_${qid}`;
    window.db.answers.put({ qid: examSpecificQid, date: Date(), type: type, score: score, max_score: max_score, other: other });
  } else {
    // Save regular answers
    window.db.answers.put({ qid: qid, date: Date(), type: type, score: score, max_score: max_score, other: other });
  }
  remote_store_synced = false;
}

function addAnatomySearchLinks(target, ans) {
  $(target)
    .append(
      $(document.createElement("a"))
        .attr({
          href: "https://www.google.com/search?q=" + ans,
          target: "newtab",
          class: "google-answer answer-link-perm",
          title: "Search Google for: " + ans
        })
        .text("G")
    )
    .append(
      $(document.createElement("a"))
        .attr({
          href: "https://www.imaios.com/en/content/search?SearchText=" + ans,
          target: "newtab",
          class: "imaios-answer answer-link-perm",
          title: "Search Imaois for: " + ans
        })
        .text("I")
    )
    .append(
      $(document.createElement("a"))
        .attr({
          href: "https://radiopaedia.org/search?q=" + ans,
          target: "newtab",
          class: "radiopaedia-answer answer-link-perm",
          title: "Search Radiopaedia for: " + ans
        })
        .text("R")
    );
}

window.loadQuestion = loadQuestion;
