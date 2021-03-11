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
import * as dicomViewer from "./dicomViewer.js"


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

// Object to store all the answers given to a particualar question
var hash_answer_map = {};

//var flagged_questions = new Set();

// uid of the currently loaded question
let current_question_uid = 0;

var search_string = false;

var show_answered_questions = true;
var show_only_flagged_questions = false;

// let questions_answered = 0;
// let questions_correct = 0;

var last_answered_question = false;

var min_colour_diff = 0.6;

let store = false;

var db = new Dexie("user_interface");
db.version(1).stores({
  //mouse_bindings: "button,mode,tool",
  element_position: "[type+element],x,y",
  answers: "qid,date,type,score,max_score,other",
  flagged: "&qid",
  //question_cache: "qid,date,type,score,max_score,other"
});

window.db = db;

window.element_positions = {
  //rapid: { "answer-block": { x: 0, y: 0 } }
};

// Load saved UI element positions into local memory
db.element_position.each(data => {
  if(data == undefined) {
    return;
  }

  // Create object / dict as required
  if(!window.element_positions.hasOwnProperty(data.type)) {
    window.element_positions[data.type] = {};
  }
  if(!window.element_positions[data.type].hasOwnProperty(data.element)) {
    window.element_positions[data.type][data.element] = {};
  }

  window.element_positions[data.type][data.element] = { x: data.x, y: data.y };
});

var remote_store = false;
var remote_store_synced = false;
var remote_data = {};

var control_pressed = false;

// Settings regarding labelling questions
var similarity_limit = 0.8;

var image_viewer = "cornerstone";

var preload_images = 5;

function loadExtraQuestionsCallback(i) {
  return function (e) {
    loadExtraQuestions(i);
    saveLoadedQuestionSet(i);
    $("#options").slideToggle("slow");
  };
}

function buildQuestionList(data, textStatus) {
  let list = data["questions"];
  list.sort();
  for(let key in list) {
    var f = list[key];
    let $input = $(
      '<input type="button" class="question-load-button" value="' +
      f.replace(/_/g, " ") +
      '" />'
    );
    $input.click(loadExtraQuestionsCallback("questions/" + f));
    $input.appendTo($("#extra-questions"));
  }
}

function loadExtraQuestions(q) {
  $.getJSON(q, loadData)
    .fail(function (jqxhr, textStatus, error) {
      toastr.warning(
        "Unable to load questions<br/><br/>Perhaps you wish to try loading them manually?"
      );
    })
    .done(function () {
      toastr.info(Object.size(questions) + " questions loaded");
    });
}

function loadData(data, textStatus) {
  $.extend(questions, data);
  //filtered_questions = data;
  setUpFilters();

  buildActiveScoreList();
}

$(document).ready(function () {
  // TODO: conside switching the following all to indexdb
  // Load lawnchair store
  // ereader
  store = new Lawnchair({ adapter: "dom", name: "jquiz" }, function (store) { });

  //Populate version info
  $("#version-info").text("version: " + quiz_version);

  toastr.options.positionClass = "toast-bottom-right";

  $("#loading").addClass("show");

  $.getJSON("questions/question_list", buildQuestionList)
    .fail(function (jqxhr, textStatus, error) {
      toastr.warning(
        "Unable to load questions list<br/><br/>Perhaps you wish to try loading them manually?"
      );
    })
    .done(function () { });

  // Load previous question set
  let questions_to_load = default_question_set;
  store.exists("current_question_set", function (exists) {
    console.log("load question set");
    if(exists) {
      store.get("current_question_set", function (obj) {
        let n = obj["value"];
        questions_to_load = n;
      });
    } else {
      //let questions_to_load = default_question_set;
    }
  });

  //$.getJSON("../sbas/question/json/all", loadData).fail(function(jqxhr, textStatus, error) {
  $.getJSON(questions_to_load, loadData)
    .fail(function (jqxhr, textStatus, error) {
      toastr.warning(
        "Unable to load questions<br/><br/>Perhaps you wish to try loading them manually?"
      );
    })
    .done(function () {
      toastr.info(Object.size(questions) + " questions loaded");
    })
    .always(function () {
      $("#loading").removeClass("show");

      $("#filter-toggle, #hide-options-button").click(function () {
        $("#options").slideToggle("slow");
      });

      $("#question-details-toggle").click(function () {
        $("#question-details").slideToggle("slow");
      });

      $("#load-remote-server-button").click(function () {
        loadRemoteServer();
      });

      $("#score-toggle").click(function () {
        $("#score").slideToggle("slow");
      });

      $("#about-toggle, #about-close").click(function () {
        $("#about").slideToggle("slow");
      });

      $("#goto-question-button").click(function () {
        let val = $("#goto-question-input").val();
        if(val && !isNaN(val)) {
          loadQuestion(parseInt($("#goto-question-input").val()) - 1);
          $("#goto-question-input").blur();
        } else {
          toastr.warning("Invalid question.");
        }
      });

      $("#goto-question-hide-button").click(function () {
        //duplicate stuff....
        let val = $("#goto-question-input").val();
        if(val && !isNaN(val)) {
          loadQuestion(parseInt($("#goto-question-input").val()) - 1);
          $("#goto-question-input").blur();
        } else {
          toastr.warning("Invalid question.");
        }
        $("#goto-question-input").blur();
        $("#options").slideToggle("slow");
      });

      $("#search-button").click(function () {
        startSearch($("#search-input").val());
        $("#search-input").blur();
      });

      $("#delete-answers-button").click(function () {
        resetAnswers();
      });

      $("#save-answers-button").click(function () {
        saveAnswersAsFile();
      });

      $("#unload-questions-button").click(function () {
        // Reset all variables
        questions = {};
        filtered_questions = [];
        hash_n_map = {};
        current_question_uid = 0;
        setUpFilters();
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

      $("#randomise-question-order-btn").click(e => {
        shuffle(filtered_questions);
        saveLoadedQuestionSetOrder(filtered_questions);
        loadFilters();
        loadQuestion(0);
      });

      $("#answers-file").on("change", handleAnswersFileSelect);

      $("#questions-file").on("change", handleQuestionsFileSelect);

      progress = document.querySelector(".percent");

      //$(document).keypress(keyPress);
      $(document).keydown(keyDownHandler);
      $(document).keyup(keyUpHandler);
    });

  //loadAnswersFromStorage();

  //loadFlaggedQuestionsFromStorage();

  $("#content").swipe({
    swipeLeft: function (event, direction, distance, duration, fingerCount) {
      nextQuestion(event);
    },
    swipeRight: function (event, direction, distance, duration, fingerCount) {
      previousQuestion(event);
    },
    fallbackToMouseEvents: false
  });

  window.addEventListener("beforeunload", function (e) {
    if(remote_store == true && remote_store_synced == false) {
      var confirmationMessage =
        "Questions have not been saved remotely. Continue?";

      (e || window.event).returnValue = confirmationMessage; //Gecko + IE
      return confirmationMessage; //Webkit, Safari, Chrome
    }
  });
});

function escaper(expression) {
  return expression
    .replace(/[!"#$%&'()*+,.\/:;<=>?@\[\\\]^`{|}~]/g, "")
    .replace(/ /g, "_");
}

Object.size = function (obj) {
  var size = 0,
    key;
  for(key in obj) {
    if(obj.hasOwnProperty(key)) size++;
  }
  return size;
};

// function saveAnswersToStorage() {
//   // Yes - it is (probably) bad practice to try / catch every access to localStorage
//   // TODO: switch to lawnchair
//   //ereader
//   store.save({ key: "answers", value: JSON.stringify(hash_answer_map) });
// }

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
  store.exists("current_question", function(exists) {
    if (exists) {
      store.get("current_question", function(obj) {
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
  for(let i in store_keys) {
    if(/^(checkbox-)/.test(store_keys[i])) {
      store.remove(store_keys[i]);
      //localStorage.removeItem(key);
    }
  }
}

// Deletes saved answers from localStorage
function resetAnswers() {
  var msg =
    "Are you sure you wish to delete all your answers?\n\nThis is non-recoverable!";

  if(confirm(msg)) {
    // hash_answer_map = {};
    //localStorage.setItem('answers', {});
    //ereader
    // store.save({ key: "answers", value: {} });

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

//function loadAnswersAndFeedback(data) {
//  console.log("LAF");
//  d = data;
//  console.log(d);
//  answers = d["answers"];
//  flagged_questions = d["flagged_questions"];
//  loadAnswers(answers);
//  loadFlaggedQuestions(flagged_questions);
//  saveAnswersToStorage();
//  saveFlaggedQuestions();
//}

//function loadAnswers(answers) {
  // TODO: implement with indexed db
  // // Rather than simply replacing the answers we merge them.
  // console.log(answers);
  // console.log(answers.length);
  // if(Object.keys(answers).length > 0) {
  //   if(Object.keys(hash_answer_map).length < 1) {
  //     console.log("DIRECT LOAD");
  //     hash_answer_map = answers;
  //   } else {
  //     for(q in answers) {
  //       if(hash_answer_map.hasOwnProperty(q)) {
  //         ans = hash_answer_map[q].concat(answers[q]);
  //         ans = ans.filter(
  //           (ans, index, self) =>
  //             index === self.findIndex(t => t.date === ans.date)
  //         );
  //         ans.sort(dynamicSort("date"));
  //         hash_answer_map[q] = ans;
  //       } else {
  //         hash_answer_map[q] = answers[q];
  //       }
  //     }
  //     console.log(hash_answer_map);
  //   }
  //   toastr.info(Object.keys(answers).length + " answers loaded.");
  // }
//}

// Attempt to load answers from localStorage
//function loadAnswersFromStorage() {
//  //ereader
//  store.exists("answers", function (exists) {
//    if(exists) {
//      store.get("answers", function (obj) {
//        console.log("load", obj["value"])
//        let loaded_answers = JSON.parse(obj["value"]);
//        loadAnswers(loaded_answers);
//      });
//    }
//  });
//}

//function loadFlaggedQuestions(flagged) {
//  // JSON returns set as an array
//  if(flagged.length > 0) {
//    flagged_questions = new Set([...flagged_questions, ...flagged]);
//    toastr.info("Flagged question data loaded.");
//  }
//}

//// Attempt to load answers from localStorage
//function loadFlaggedQuestionsFromStorage() {
//  //ereader
//  store.exists("flagged_questions", function (exists) {
//    if(exists) {
//      store.get("flagged_questions", function (obj) {
//        let fq = JSON.parse(obj["value"]);
//        loadFlaggedQuestions(fq);
//      });
//    }
//  });
//}

// Generates the score section
async function buildActiveScoreList() {
  // TODO: Consider caching the score list so it is now rebuilt everytime
  //       a question is loaded

  let list = $("#score-list");

  // Don't build the score list if it is not visible
  if(list.is(":hidden")) {
    return;
  }

  // Empty any previously shown scores
  list.empty();

  // Build an array of answered questions (numerical number in all questions)
  var answers = [];
  var filtered_answers = [];

  // Retrieve answers of all currently loaded questions
  answers = await window.db.answers.where("qid").anyOf(Object.keys(hash_n_map)).toArray();


  let answers_by_qid = {}

  answers.forEach(ans => {
    // TODO: multiple answers
    // currently will just use the latest....
    answers_by_qid[ans.qid] = ans;

    let filtered_answer_id = filtered_questions.indexOf(ans.qid);
    if(filtered_answer_id > -1) {
      filtered_answers.push(filtered_answer_id);
    }

  })

  let questions_correct = 0;
  let questions_answered = 0;

  // If no answered questions loaded break;
  if(filtered_answers.length < 1) {
    $("#score-percent")
      .empty()
      .append("No questions answered.");
    return;
  }

  filtered_answers.sort(function (a, b) {
    return a - b;
  });


  for(let ans in filtered_answers) {
    let i = filtered_answers[ans];

    let answer = answers_by_qid[filtered_questions[i]];

    var n = i + 1; // The question number starts from 1

    // To generate the correct colour we use HSL were
    // the hue going from 0 -> 60 - 120 represents
    // green -> yellow -> red
    let ratio = answer.score / answer.max_score;
    let hue = ratio * 120;

    list.append(
      $(document.createElement("li"))
        .attr({
          id: "score-" + i,
          class: "tf",
          title: n
        })
        .text(
          n +
          " (" +
          answer.score +
          "/" +
          answer.max_score +
          ")"
        )
        .css({ "background-color": "hsl(" + hue + ", 100%, 50%)" })
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
  if(list_items.length > trucate_score_list_at && show_all_scores == false) {
    list_items.hide();
    list_items.slice(-trucate_score_list_at).show();
    truncated = true;
  }

  $("#score-list").append(
    $(document.createElement("span")).attr({
      id: "toggle-score-vis"
    })
  );

  if(show_all_scores) {
    $("#toggle-score-vis")
      .text("--Show Less--")
      .click(function () {
        show_all_scores = false;
        buildActiveScoreList();
      });
  } else if(truncated) {
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
  if(e.key == "Control") {
    dicomViewer.registerPrimaryDicomInterface(e);
    control_pressed = false;
  }
}

function keyDownHandler(e) {
  // Ignore our custom keybindings if we are currently in a field that
  // accepts some kind of input
  if($("*:focus:not(disabled)").is("textarea, input")) {
    // unless a modifier key is pressed (not shift)
    if(e.altKey ? true : false || e.ctrlKey ? true : false) {
    } else {
      return;
    }
  }

  if(e.key == "Control") {
    if(control_pressed == false) {
      control_pressed = true;
      dicomViewer.registerAltDicomInterface(e);
    }
  }

  var charCode = typeof e.which == "number" ? e.which : e.keyCode;
  console.log(e, charCode);

  function numberKeyPressed(e, x) {
    if(e.altKey ? true : false) {
      dicomViewer.selectThumb(x);
      e.preventDefault();
    } else {
      $(".answer-list li:eq(" + x + ")").click();
    }
  }

  switch(charCode) {
    case 13: // Return
      if(e.shiftKey ? true : false) {
        $(".next-button:last").click();
      } else {
        $(".check-button:last").click();
      }
      break;
    case 32: // Space
      if(e.shiftKey ? true : false) {
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
  if(str.length > 0) {
    search_string = str;
    $("#search-form").append(
      $(document.createElement("button"))
        .attr({ id: "clear-search-button" })
        .text("X")
        .click(startSearch)
    );
    $("#clear-search-button").wrap("<a href='#'></a>");
  } else {
    search_string = false;
  }
  loadFilters();
}

function setUpFilters() {
  let specialty_filters = {};
  let source_filters = {};
  $("#specialty-filters").empty();
  $("#source-filters").empty();
  for(let q in questions) {
    for(let s in questions[q]["specialty"]) {
      specialty_filters[questions[q]["specialty"][s]] = true;
    }
    source_filters[questions[q]["source"]] = true;
  }

  // This bit is rather fucked. It does work though.
  var specialty_filter_keys = Object.keys(specialty_filters);

  specialty_filter_keys.sort();

  let i = 0;
  for(let s in specialty_filter_keys) {
    i = i + 1;
    $("#specialty-filters")
      .append(
        $(document.createElement("li")).attr({
          id: "filter-specialty-" + i
        })
      )
      .append(
        $(document.createElement("input")).attr({
          type: "checkbox",
          id: "filter-specialty-" + escaper(specialty_filter_keys[s]),
          name: "filter-specialty-checkbox",
          label: specialty_filter_keys[s],
          value: specialty_filter_keys[s]
        })
      )
      .append(specialty_filter_keys[s]);

    //$("#filter-specialty-"+i));

    //$("#filter-specialty-"+i).append(s);
  }

  if($("[name='filter-specialty-checkbox']").length > 1) {
    $("#specialty-filters").append(
      $(document.createElement("li"))
        .attr({ class: "select-all" })
        .text("Select All")
        .click(function () {
          checkBoxes = $("[name='filter-specialty-checkbox']");
          checkBoxes.prop("checked", !checkBoxes.prop("checked"));

          loadFilters();
        })
    );
  }

  i = 0;
  for(let s in source_filters) {
    i = i + 1;
    $("#source-filters").append(
      $(document.createElement("li"))
        .attr({ id: "filter-source-" + i })
        .append(
          $(document.createElement("input")).attr({
            type: "checkbox",
            id: "filter-source-" + escaper(s),
            name: "filter-source-checkbox",
            label: s,
            value: s
          })
        )
        .append(s)
    );
  }

  if($("[name='filter-source-checkbox']").length > 1) {
    $("#source-filters").append(
      $(document.createElement("li"))
        .attr({ class: "select-all" })
        .text("Select All")
        .click(function () {
          checkBoxes = $("[name='filter-source-checkbox']");
          checkBoxes.prop("checked", !checkBoxes.prop("checked"));

          loadFilters();
        })
    );
  }

  // Restore previously selected filters (before we attach the events)
  // ereader
  store.keys("store_keys = keys");
  for(let i in store_keys) {
    if(/^(checkbox-)/.test(store_keys[i])) {
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

  if(search_string) {
    search_string = new RegExp(search_string, "i");
  }

  // There must be a better way to do this!
  let flagged_questions = await db.flagged.toArray()
  flagged_questions = flagged_questions.map((d) => {return d.qid});
  let answered_questions = await db.answers.toArray();
  answered_questions = answered_questions.map((d) => {return d.qid});

  console.log("flagged", flagged_questions)
  console.log("answer", answered_questions)

  for(let n in questions) {
    let q = questions[n];


    // Filter questions that have an answer saved
    if(!show_answered_questions) {
      if(answered_questions.includes(n)) {
        continue;
      }
    }

    // Filter questions that have not been flagged
    if(show_only_flagged_questions) {
      if(!flagged_questions.includes(n)) {
        continue;
      }
    }

    if(filter_specialty) {
      var specialty_exists = false;
      for(let s in q["specialty"]) {
        if(active_specialty_filters.hasOwnProperty(q["specialty"][s])) {
          specialty_exists = true;
          break;
        } else {
          specialty_exists = false;
        }
      }
      if(!specialty_exists) {
        continue;
      }
    }

    if(filter_source) {
      if(!active_source_filters.hasOwnProperty(q["source"])) {
        continue;
      }
    }

    if(search_string) {
      if(!searchObject(q, search_string)) {
        continue;
      }
    }

    //filtered_questions[n] = q;
    filtered_questions.push(n);
  }

  // Try and load previous question order
  store.exists("question_order", function(exists) {
    if (exists) {
      store.get("question_order", function(obj) {
        let loaded_question_order = obj["value"];

        // Check we have the same question set (apparently javasrcipt sets are useless...)
        if (areEqualArrays(loaded_question_order, filtered_questions)) {
          // If so use the loaded one
          filtered_questions = loaded_question_order
        }
      });
    } else {
    }
  });

  for (let n in filtered_questions) {
    hash_n_map[filtered_questions[n]] = parseInt(n);
  }

  //loadQuestion(0);
  loadPreviousQuestion();

  search_string = false;
}

function getQuestionDataByNumber(n) {
  let qid = filtered_questions[n];
  return questions[qid];
}

function previousQuestion(e) {
  if(e && e.shiftKey) {
    loadQuestion(hash_n_map[current_question_uid] - 10);
  } else {
    loadQuestion(hash_n_map[current_question_uid] - 1);
  }
}

function nextQuestion(e) {
  if(e && e.shiftKey) {
    loadQuestion(hash_n_map[current_question_uid] + 10);
  } else {
    loadQuestion(hash_n_map[current_question_uid] + 1);
  }
}

function isEmptyObject(obj) {
  return Object.getOwnPropertyNames(obj).length === 0;
}

// Searches within a object for a specified regex.
// If found return true, else false
function searchObject(o, search_str) {
  for(var i in o) {
    if(typeof o[i] == "object") {
      // Recursively search the object tree
      if(searchObject(o[i], search_str)) {
        return true;
      }
    } else {
      if(
        String(o[i]).search(search_str) > -1 ||
        String(i).search(search_str) > -1
      ) {
        return true;
      }
    }
  }
  return false;
}

// TODO: fix
function saveAnswersAsFile() {
  var textToWrite = JSON.stringify({
    answers: hash_answer_map,
    flagged_questions: [...flagged_questions]
  });
  var textFileAsBlob = new Blob([textToWrite], { type: "text/plain" });
  var fileNameToSaveAs = "answers";

  var downloadLink = document.createElement("a");
  downloadLink.download = fileNameToSaveAs;
  downloadLink.innerHTML = "Download File";
  if(window.webkitURL != null) {
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
  if(toLower == true) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
  }

  if(stripWhitespace) {
    s1 = s1.replace(/ /g, "");
    s2 = s2.replace(/ /g, "");
  }
  var longer = s1;
  var shorter = s2;
  if(s1.length < s2.length) {
    longer = s2;
    shorter = s1;
  }
  var longerLength = longer.length;
  if(longerLength == 0) {
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
  for(var i = 0; i <= s1.length; i++) {
    var lastValue = i;
    for(var j = 0; j <= s2.length; j++) {
      if(i == 0) costs[j] = j;
      else {
        if(j > 0) {
          var newValue = costs[j - 1];
          if(s1.charAt(i - 1) != s2.charAt(j - 1))
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if(i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

function dynamicSort(property) {
  var sortOrder = 1;
  if(property[0] === "-") {
    sortOrder = -1;
    property = property.substr(1);
  }
  return function (a, b) {
    var result =
      a[property] < b[property] ? -1 : a[property] > b[property] ? 1 : 0;
    return result * sortOrder;
  };
}

function createRemoteStoreButtonIfRequired() {
  if(
    $("#save-remote-data-button").length == 0 &&
    remote_store &&
    remote_store_synced == false
  ) {
    $("#header-next-button").after(
      $(document.createElement("button"))
        .attr({ id: "save-remote-data-button" })
        .text("Save answers to Google")
        .click(function () {
          document
            .getElementById("remote-frame")
            .contentWindow.saveRemoteAnswers();
        })
    );
  }
}

function loadRemoteServer() {
  $("body").append('<iframe id="remote-frame" src="gapp.html">');
  $("#load-remote-server-button").remove();
}

function toggleFlagged() {
  db.flagged.get(current_question_uid).then((d) => {
    if (d == undefined) {
      db.flagged.put({qid: current_question_uid})
      $("#flagged-button").text("FLAGGED");
      toastr.info("Question flagged.");
    } else {
      $("#flagged-button").text("NOT FLAGGED");
      db.flagged.delete(current_question_uid)
      toastr.info("Question unflagged.");
    }
  // We handle the error above
  }).catch(() => {})

  remote_store_synced = false;
}

function stopAnswersAutoloading() {
  for(qid in hash_answer_map) {
    hash_answer_map[qid].slice(-1)[0]["autoload"] = false;
  }
}

// Popup search option for selected text
function getSelected() {
  if(window.getSelection) {
    return window.getSelection();
  } else if(document.getSelection) {
    return document.getSelection();
  } else {
    var selection = document.selection && document.selection.createRange();
    if(selection.text) {
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
    if(selection == "") {
      $("span.popup-tag").css("display", "none");
    }
  });

  $("#main, #feedback").mouseup(function (event) {
    // Fix bug in cornerstone tools magnfiy??
    //$(".magnifyTool").hide();

    var selection = getSelected();
    selection = $.trim(selection);
    if(selection != "") {
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
   if(first.length !== second.length){
      return false;
   };
   for(let i = 0; i < first.length; i++){
      if(!second.includes(first[i])){
         return false;
      };
   };
   return true;
};

function loadQuestion(n) {
  saveOpenQuestion(n);
  //question_number = Object.size(filtered_questions);
  //console.log(filtered_questions)
  let question_number = filtered_questions.length;

  $("#header").empty();
  $("#main").empty();
  $("#feedback").empty();
  $("#question-details").empty();

  // Hide any open search popups
  $("span.popup-tag").css("display", "none");

  if(question_number == 0) {
    $("#header").append(
      "No questions to show. Refine your filter(s)/search or load more questions."
    );
    return;
  }

  // Stop trying to load negative questions
  n = Math.max(0, n);
  n = Math.min(question_number - 1, n);

  // convert n to the hash
  let qid = filtered_questions[n];
  let data = getQuestionDataByNumber(n);

  let question_type = data["type"];

  current_question_uid = qid;

  let m = n + 1;

  $("#header").append(
    $(document.createElement("button"))
      .attr({
        //'type': 'button',
        class: "previous-button",
        value: "Previous"
      })
      .text("Previous")
  );

  $("#header").append(
    $(document.createElement("span"))
      .attr({
        id: "header-text"
      })
      .text("Question " + m + " of " + question_number)
  );

  $("#header").append(
    $(document.createElement("button"))
      .attr({
        //'type': 'button',
        class: "next-button",
        id: "header-next-button",
        value: "Next"
      })
      .text("Next")
  );

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
  }).catch(() => {})

  // Set up the question details block
  $("#question-details").append("Question details...<br />");
  $("#question-details").append("-------------------<br />");
  $("#question-details").append("ID: " + qid + "<br />");
  $("#question-details").append("Type: " + data["type"] + "<br />");
  $("#question-details").append("Source: " + data["source"] + "<br />");
  $("#question-details").append("Specialties: " + data["specialty"] + "<br />");
  $("#question-details").append("Meta: " + data["meta"] + "<br />");
  $("#question-details").append("Date: " + data["date"] + "<br />");

  $("#main").append(
    $(document.createElement("div")).attr({
      id: "question-block"
    })
  );

  let answer_block_x = 0;
  let answer_block_y = 0;
  if(
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
      if($("#options, #dicom-settings-panel").is(":visible")) {
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
          if(e.keyCode == 13) {
            $(".check-button").click();
          }
        });

  }

  // Reposition element if saved in db

  let question, answers, options;
  switch(question_type) {
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

      for(n in answer_options) {
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

      for(a in answers) {
        selector = $(document.createElement("select")).attr({
          class: "emq-select-box"
        });

        // I can't decide if we should allow this flexibility
        // (currently also allowed for true false questions
        if(answers[a] instanceof Array) {
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

      for(i in data["question"]) {
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

      enterKeyChecks( $("#answer-block input") .focus())

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
      for(var i = 0; i < options.length; i++) {
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

      enterKeyChecks( $("#main input") .focus())

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
          class: "tf-answer-block answer-list allow-hover",
          "data-answered": 0
        })
      );

      options = Object.keys(answers);

      let ordered = false;

      let tf =
        "<span class='tf-answer-options'><span class='tf-true'>True</span> / <span class='tf-false'>False</span></span>";

      // Test if it is an ordered list
      if(options[0].substring(0, 2).match(/[A-Z]\./i)) {
        options.sort();
        // If it is we must maintain the order. Otherwise
        // we can randomise it. (NOT YET IMPLEMENTED)
        ordered = true;
      }

      i = 0;
      for(n in options) {
        let a = options[n];

        // I can't decide if we should allow this flexibility
        let actual_answer, feedback;
        if(answers[a] instanceof Array) {
          actual_answer = answers[a][0];
          feedback = answers[a][1];
        } else {
          feedback = "";
          actual_answer = answers[a];
        }

        let c = actual_answer;
        if(ordered) {
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
            .append("<a href='#/' class='answer-option-link'>" + a + "</a>")
            .append(tf)
            .click(function (e) {
              $(e.currentTarget).toggleClass("tf_answer_true");
              //if ($(e.currentTarget).find(".tf-active").length > 0) {
              //    $(e.currentTarget).find(".tf-true, .tf-false").toggleClass("tf-active");

              //} else {
              //    $(e.currentTarget).find(".tf-true").addClass("tf-active");
              //}
            })
        );
        i = i + 1;
      }

      $(".tf-true, .tf-false")
        .off()
        .click(function (e) {
          $(e.currentTarget).toggleClass("tf_answer_true");
          //$(e.currentTarget.parentNode).children().removeClass("tf-active");
          //$(e.currentTarget).addClass("tf-active");
          e.stopPropagation();
        });

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
    $(e).click(previousQuestion);
  });

  $(".next-button").off();
  $(".next-button").each(function (index, e) {
    $(e).click(nextQuestion);
  });

  // if(hash_answer_map.hasOwnProperty(qid) && auto_load_previous_answers) {
  //   let ans = hash_answer_map[qid].slice(-1)[0];
  //   console.log(ans)
  //   if(!ans.hasOwnProperty("autoload") || ans["autoload"] == true) {
  //     checkAnswer(ans, true);
  //   }
  //   //switch(question_type) {
  //   //    case "sba":
  //   //        checkAnswer(hash_answer_map[qid], true);
  //   //        break
  //   //}
  // }
  if(auto_load_previous_answers) {
    console.log(qid)
    window.db.answers.where("qid").equals(qid).first((ans) => {
      // if(!ans.hasOwnProperty("autoload") || ans["autoload"] == true) {
      //   checkAnswer(ans, true);
      // }
      if(ans != undefined) {
        checkAnswer(ans, true);
      }

    });
  }

  //scrollTo(0, $("#content").position().top);

  if(fix_broken_question_formatting) {
    $(".btn-link").remove();
    $(".btn-xs").remove();
  }
  //MathJax.Hub.Queue(["Typeset", MathJax.Hub, "MathExample"]);
  createRemoteStoreButtonIfRequired();

  // Preload images for the next N questions
  // (N = preload_images value)
  let x = 1;
  while(x <= preload_images) {
    let data = getQuestionDataByNumber(n + x);

    // TODO: This should be rewritten
    if(typeof data !== "undefined" && data.hasOwnProperty("images")) {
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

  if(!window.element_positions.hasOwnProperty(question_type)) {
    window.element_positions[question_type] = {};
  }
  if(!window.element_positions[question_type].hasOwnProperty(element.id)) {
    window.element_positions[question_type][element.id] = {};
  }

  window.element_positions[question_type][element.id] = {
    x: x,
    y: y
  };
}

function loadImage(data) {
  if(image_viewer == "cornerstone") {
    dicomViewer.loadCornerstone($("#main"), db, data["images"], data["annotations"]);
  } else {
    $("#main")
      .append("<br>")
      .append(data["question"])
      .append("<br>");

    if(data["images"] != undefined) {
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
  if(options[0].substring(0, 2).match(/[A-Z]\./i)) {
    options.sort();
    // If it is we must maintain the order. Otherwise
    // we can randomise it. (NOT YET IMPLEMENTED)
    ordered = true;
  }

  let i = 0;
  for(let n in options) {
    let a = options[n];

    let c = answers[a];
    if(ordered) {
      c = c + " alpha-list";
      a = options[n].substring(2);
    }

    $("#question-" + question_number + "-answers").append(
      $(document.createElement("li"))
        .attr({
          id: "q" + question_number + "a" + i,
          class: c,
          "data-question-number": question_number
        })
        .append("<a href='#/' class='answer-option-link'>" + a + "</a>")
        .on("click", checkAnswer)
    );
    i = i + 1;
  }

  $("#main").append("<br />");

  //MathJax.Hub.Queue(["Typeset", MathJax.Hub, "body"]);
}

function buildRankList(options, answers) {
  for(var i = 0; i < options.length; i++) {
    option = options[i];

    //c = answers[n];

    $("#sortable-list").append(
      $(document.createElement("li"))
        .attr({
          id: "answer-" + option,
          "data-option": option
          //'class': c,
          //'data-question-number': question_number
        })
        .text(option + " - " + answers[option])
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

  let best_sim, best_answer, sim, replaced_lower_case_answer, score, max_score, a, diff, fragment, span, color;

  switch(question_type) {
    case "sba":
      let return_value = checkBestAnswer(ans, load);

      if(return_value.s) {
        saveAnswerToHashMap(current_question_uid, "sba", return_value.score, 1, {
          target_id: return_value.t,
          question_number: return_value.q,
          answer: return_value.a
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
      if(load == true) {
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

      if(is_normal == "true") {
        // Correct normal
        if(a.toLowerCase() == "normal" || a == "") {
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
        if(a.toLowerCase() == "normal" || a == "") {
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
            if(sim > best_sim) {
              best_answer = option;
              best_sim = sim;
            }
          });

          replaced_lower_case_answer = best_answer
            .toLowerCase()
            .replace("left", "")
            .replace("right", "");

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

          if(best_sim >= similarity_limit) {
            $("#answer").addClass("correct");
            $("#answer").addClass("similarity-correct");
            // n_correct = n_correct + 1;
            correct = true;
          } else {
            $("#answer").addClass("incorrect");
          }
        }
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

      $("#feedback").append("<br />");

      $("#normal-button").remove();
      $(".check-button").remove();

      score = 0;
      if(correct) { score = 1 }

      // Save answer
      if(load != true) {
        saveAnswerToHashMap(current_question_uid, "rapid", score, 1, {
          answer: a,
          correct: correct
        });
      }

      break;
    case "image_answer":
      if(load == true) {
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
        if(sim > best_sim) {
          best_answer = option;
          best_sim = sim;
        }
      });

      if(best_sim < 1) {
        $.each(wordlist, function (key, value) {
          if(
            best_answer.toLowerCase().indexOf(key) != -1 &&
            a.toLowerCase().indexOf(value) != -1 &&
            best_answer.toLowerCase().indexOf(value) == -1
          ) {
            best_sim = -1;
          }

          if(
            best_answer.toLowerCase().indexOf(value) != -1 &&
            a.toLowerCase().indexOf(key) != -1 &&
            best_answer.toLowerCase().indexOf(key) == -1
          ) {
            best_sim = -1;
          }

          if(best_sim < 0) {
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
      if(best_sim < 1 && best_sim > min_colour_diff) {
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

      correct = false;
      score = 0;
      if(best_sim >= similarity_limit) {
        $("#answer input").addClass("correct");
        $("#answer input").addClass("similarity-correct");
        // n_correct = n_correct + 1;
        correct = true;
        score = 1;
      } else {
        $("#answer input").addClass("incorrect");
      }

      $("#feedback").append("<br />");

      $(".check-button").remove();

      // Save answer
      if(load != true) {
        saveAnswerToHashMap(current_question_uid, "image_answer", score, 1, {
          answer: a,
          correct: correct
        });
      }

      break;
    case "label":
      if(load == true) {
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

        if(a.toLowerCase() == correct_answer.toLowerCase()) {
          $(option).addClass("correct");
          n_correct = n_correct + 1;
          correct.push("correct");
        } else {
          $(option).append(
            $(document.createElement("span"))
              .attr({
                class: "label-correct-answer-text"
              })
              .text(correct_answer)
          );

          let sim = similarity(a, correct_answer);

          $(option).append(
            $(document.createElement("span"))
              .attr({
                class: "label-similarity"
              })
              .text("(" + Math.round(sim * 100) / 100 + ")")
          );

          if(sim >= similarity_limit) {
            $(option).addClass("correct");
            $(option).addClass("similarity-correct");
            n_correct = n_correct + 1;
            correct.push("correct");
          } else {
            $(option).addClass("incorrect");
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
      if(load != true) {
        saveAnswerToHashMap(current_question_uid, "label", n_correct, max_score, {
          answers: answers,
          correct: correct,
        });
      }

      break;
    case "rank":
      if(load == true) {
        // If we are loading an answer we clear our answer list
        // and rebuild it from the saved answer.
        $("#sortable-list").empty();
        buildRankList(ans["other"]["order"], data["answers"]);
      }

      order = [];

      correct_order = data["answer_order"].split("");

      map = {};

      for(i in correct_order) {
        map[correct_order[i]] = i;
      }

      number_options = correct_order.length;

      var i = 0;

      var neg_marks = 0;

      // Max score is based upon the vumber of options
      max_score = 0;
      for(var x = 1; x < number_options; x++) {
        max_score = max_score + x;
      }
      max_score = max_score + Math.floor(number_options / 2);

      $("#sortable-list li").each(function (index, option) {
        aid = option.getAttribute("data-option");
        order.push(aid);

        diff = Math.abs(i - map[aid]);

        hue = ((number_options - 1 - diff) / (number_options - 1)) * 120;

        $(option).css({ "background-color": "hsl(" + hue + ", 100%, 50%)" });

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
      $("#feedback").append("The correct order is " + correct_order);

      $("#feedback").append(
        $(document.createElement("ol")).attr({
          id: "correct-list",
          //'class': 'answer-list allow-hover',
          "data-answered": 0
        })
      );

      for(item in correct_order) {
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

      // Disable the sortable (it may be good to allow multiple attempts)
      $("#sortable-list").sortable("disable");

      $("#feedback").append("<br />");

      $(".check-button").remove();

      // Save answer
      if(load != true) {
        saveAnswerToHashMap(current_question_uid, "rank", score, max_score, {
          order: order,
          correct_order: correct_order,
        });
      }

      break;
    case "tf":
      var save_answer = true;

      if(load == true) {
        var save_answer = false;

        $(".tf-answer-block li").each(function (index, option) {
          if(ans["other"].answer[index] == 1) {
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

        if($(option).hasClass("tf_answer_true")) {
          answer = 1;
          answers.push(1);
        } else {
          //$(option).find(".tf-false").addClass("tf-active");
          answer = 0;
          answers.push(0);
        }

        answer_option = "This is True. ";
        if($(option).hasClass("0")) {
          answer_option = "This is False. ";
        }

        if($(option).hasClass(answer)) {
          $(option).addClass("correct");
          correct.push("correct");
          n_correct = n_correct + 1;
          $(option).append(
            "<br/><span class='emq-answer-feedback'>" +
            answer_option +
            feedback +
            "</span>"
          );
        } else {
          $(option).addClass("incorrect");
          correct.push("incorrect");
          $(option).append(
            "<br/><span class='emq-answer-feedback'>" +
            answer_option +
            feedback +
            "</span>"
          );
        }
      });

      max_score = answers.length

      $(".tf-answer-block")
        .removeClass("allow-hover")
        .find("*")
        .each(function (index, e) {
          $(e).off();
        });

      if(save_answer == true) {
        saveAnswerToHashMap(current_question_uid,
          "tf",
          score, max_score,
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
  if($("#feedback").length < 1) {
    $("#content").append('<div id="feedback"></div>');
  }

  $("#feedback").prepend(data["feedback"]);
  $("#feedback").append("<br />");

  if(data["external"] !== undefined) {
    $("#feedback").append("<br />");
    $("#feedback").append("<p>" + data["external"] + "</p>");
  }

  // Check if we have a valid dicom displayed
  if($(".single-dicom-viewer").length > 0) {
    // Move feedback location if we do
    $("#feedback").appendTo("#answer-block");
  }

  if(rebuild_score_list_on_answer) {
    buildActiveScoreList();
  }

  if(fix_broken_question_formatting) {
    $(".btn-link").remove();
    $(".btn-xs").remove();
  }

  last_answered_question = current_question_uid;

  createRemoteStoreButtonIfRequired();
}

function checkBestAnswer(e, load) {
  let target_id, save_answer, question_number, answer, text;
  console.log(e);
  if(load == true) {
    target_id = e["other"]["target_id"];
    save_answer = false;
    question_number = e["other"]["question_number"];
  } else {
    save_answer = true;
    target_id = e.currentTarget.getAttribute("id");
    question_number = e.currentTarget.getAttribute("data-question-number");
  }

  // Add the "correct" class to all answers that are correct
  $("#question-" + question_number + "-answers > .1").addClass("correct");

  let score = 0;
  // Check if the selected answer is correct
  if($("#" + target_id).hasClass("1")) {
    answer = "correct";
    score = 1;
  } else {
    // If not we mark it as incorrect
    $("#" + target_id).addClass("incorrect");
    answer = "incorrect";
  }

  // Remove the click events from the answered question
  $("#question-" + question_number + "-answers")
    .removeClass("allow-hover")
    .children()
    .each(function (index, e) {
      $(e).off();
    });

  // Add search links to answers
  $(".answer-list li").each(function (ind) {
    text = $(this).text();

    // Build forms for statdx searches as it uses POST requests
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
    s: save_answer,
    score: score
  };
}

function saveAnswerToHashMap(qid, type, score, max_score, other) {

  window.db.answers.put({ qid: qid, date: Date(), type: type, score: score, max_score: max_score, other: other });

  // if(!Array.isArray(hash_answer_map[qid])) {
  //   hash_answer_map[qid] = [];
  // }

  //hash_answer_map[qid].push(ans);

  //saveAnswersToStorage();
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
