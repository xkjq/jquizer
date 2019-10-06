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
var filtered_questions = [];

// Object which stores the inverse of the filtered questions array
// Allows the lookup of a questions hash by its current number.
var hash_n_map = {};

// Object to store all the answers given to a particualar question
var hash_answer_map = {};

var flagged_questions = new Set();

// uid of the currently loaded question
var current_question_uid = 0;

var search_string = false;

var show_answered_questions = true;
var show_only_flagged_questions = false;


var questions_answered = 0;
var questions_correct = 0;

var last_answered_question = false;

var min_colour_diff = 0.6;

var store = false;


var remote_store = false;
var remote_store_synced = false;
var remote_data = {};

var help_image_map = {};

// Settings regarding labelling questions
var similarity_limit = 0.8;

var use_dwv_as_image_viewer = true;

var preload_images = 5;

dwv.gui.getElement = dwv.gui.base.getElement;
dwv.gui.displayProgress = function (percent) {};

function loadExtraQuestionsCallback(i) {
    return function(e) {
        loadExtraQuestions(i);
        saveLoadedQuestionSet(i);
        $("#filters").slideToggle("slow"); 
        };
    }


function buildQuestionList(data, textStatus) {
    list = data["questions"];
    list.sort()
    for (key in list) {
        var f = list[key];
        $input = $('<input type="button" class="question-load-button" value="'+f.replace(/_/g, " ")+'" />');
        $input.click(loadExtraQuestionsCallback("questions/"+f));
        $input.appendTo($("#extra-questions"));
        }

}

function loadExtraQuestions(q) {
    $.getJSON(q, loadData).fail(function(jqxhr, textStatus, error) { 

        toastr.warning("Unable to load questions<br/><br/>Perhaps you wish to try loading them manually?");

    }).success(function () {

        toastr.info(Object.size(questions) + " questions loaded");


    });

}

function loadHelpImageMap(data, textStatus) {
    $.extend(help_image_map, data);

}

function loadData(data, textStatus) {

    $.extend(questions, data);
    //filtered_questions = data;
    setUpFilters();

    buildActiveScoreList();

}


$(document).ready(function() {
    // Load lawnchair store
    // ereader
    store = new Lawnchair({adapter: "dom", name:"jquiz"}, function(store) { });

    //Populate version info
    $("#version-info").text("version: " + quiz_version);

    toastr.options.positionClass = "toast-bottom-right";

    $("#loading").addClass("show");

    $.getJSON("questions/question_list", buildQuestionList).fail(function(jqxhr, textStatus, error) { 

        toastr.warning("Unable to load questions list<br/><br/>Perhaps you wish to try loading them manually?");

    }).success(function () {

    });

    // Load previous question set
    store.exists("current_question_set", function(exists) {
        console.log("load question set")
        if (exists) {
            store.get("current_question_set", function(obj) {
                n = obj["value"];
                questions_to_load = n;
            });
        } else {
            questions_to_load = default_question_set;
        }
    });

    //$.getJSON("../sbas/question/json/all", loadData).fail(function(jqxhr, textStatus, error) { 
    $.getJSON(questions_to_load, loadData).fail(function(jqxhr, textStatus, error) { 

        toastr.warning("Unable to load questions<br/><br/>Perhaps you wish to try loading them manually?");

    }).success(function () {

        toastr.info(Object.size(questions) + " questions loaded");


    }).always(function() {

        $("#loading").removeClass("show");

        $("#filter-toggle, #hide-options-button").click(function() { 
            $("#filters").slideToggle("slow"); 
        });

        $("#question-details-toggle").click(function() { 
            $("#question-details").slideToggle("slow"); 
        });

        $("#load-remote-server-button").click(function() { 
            loadRemoteServer();
        });

        $("#score-toggle").click(function() { 
            $("#score").slideToggle("slow"); 
        });

        $("#about-toggle, #about-close").click(function() { 
            $("#about").slideToggle("slow"); 
        });

        $("#goto-question-button").click(function() {
            val = $("#goto-question-input").val();
            if (val && !isNaN(val)) {
                loadQuestion(parseInt($("#goto-question-input").val())-1);
                $("#goto-question-input").blur();
            } else {
                toastr.warning("Invalid question.");
            }
        });

        $("#goto-question-hide-button").click(function() {
            //duplicate stuff....
            val = $("#goto-question-input").val();
            if (val && !isNaN(val)) {
                loadQuestion(parseInt($("#goto-question-input").val())-1);
                $("#goto-question-input").blur();
            } else {
                toastr.warning("Invalid question.");
            }
            $("#goto-question-input").blur();
            $("#filters").slideToggle("slow"); 
        });

        $("#search-button").click(function() {
            startSearch($("#search-input").val());
            $("#search-input").blur();
        });

        $("#delete-answers-button").click(function() {
            resetAnswers();
        });

        $("#use-dwv-button").click(function() {
            use_dwv_as_image_viewer = false;
        });

        $("#save-answers-button").click(function() {
            saveAnswersAsFile();
        });

        $("#unload-questions-button").click(function() {
            // Reset all variables
            questions = {}; 
            filtered_questions = [];
            hash_n_map = {};
            current_question_uid = 0;
            setUpFilters();
        });

        $("#toggle-css").click(function() {
            $("#dark-css").prop('disabled', function(i, v) { return !v; });
            $("#light-css").prop('disabled', function(i, v) { return !v; });
        });

        $("#answers-file").on('change', 
        handleAnswersFileSelect);

        $("#questions-file").on('change', 
        handleQuestionsFileSelect);

        progress = document.querySelector('.percent');

        $(document).keypress(keyPress);
    });

    loadAnswersFromStorage();

    loadFlaggedQuestionsFromStorage();

    $("#content").swipe({
        swipeLeft:function(event, direction, distance, duration, fingerCount) {
            nextQuestion(event);
        },
        swipeRight:function(event, direction, distance, duration, fingerCount) {
            previousQuestion(event);
        },
        fallbackToMouseEvents:false
    });

    window.addEventListener("beforeunload", function (e) {
        if ((remote_store == true) && (remote_store_synced == false)) {
            var confirmationMessage = "Questions have not been saved remotely. Continue?";

            (e || window.event).returnValue = confirmationMessage; //Gecko + IE
            return confirmationMessage;                            //Webkit, Safari, Chrome
        }
    });

    $.getJSON("imagehelp/map", loadHelpImageMap).fail(function(jqxhr, textStatus, error) { 

        toastr.warning("Unable to help image map");

    }).success(function () {

        toastr.info(Object.size(help_image_map) + " help images loaded");


    });
    

});

function escaper(expression) {
    return expression.replace(/[!"#$%&'()*+,.\/:;<=>?@\[\\\]^`{|}~]/g, '').replace(/ /g, "_");
}

Object.size = function(obj) {
    var size = 0, key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) size++;
    }
    return size;
};

function saveAnswersToStorage() {
    // Yes - it is (probably) bad practice to try / catch every access to localStorage
    // TODO: switch to lawnchair
    //ereader
    store.save({key: "answers", value: JSON.stringify(hash_answer_map)});
//    try {
//        localStorage.setItem('answers', JSON.stringify(hash_answer_map));
//    } catch(e) {
//        msg = "Local storage not supported";
//        return false;
//    }
}

function saveCheckboxState(id) {
    // There should be a better way to do this
    //ereader
    store.save({key: 'checkbox-'+id, value: 1});
//    try {
//        localStorage.setItem('checkbox-'+id, 1);
//    } catch(e) {
//        msg = "Local storage not supported";
//        return false;
//    }
}

function saveOpenQuestion(n) {
    // This will fail if filters are changed
    // (may be better ot use hashes instead)
    store.save({key: "current_question", value: n});
}

function saveFlaggedQuestions() {
    // JSON.stringify doesn't suport sets...
    store.save({key: "flagged_questions", value: JSON.stringify([...flagged_questions])});
}

function saveLoadedQuestionSet(n) {
    // This will fail if filters are changed
    // (may be better ot use hashes instead)
    console.log("Save", n);
    store.save({key: "current_question_set", value: n});
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
        store.keys("store_keys = keys")
        for (i in store_keys) {
            if (/^(checkbox-)/.test(store_keys[i])) {
               store.remove(store_keys[i]);
                //localStorage.removeItem(key);
            }
        };
}

// Deletes saved answers from localStorage
function resetAnswers() {
    var msg = "Are you sure you wish to delete all your answers?\n\nThis is non-recoverable!";

    if (confirm(msg)) {
        hash_answer_map = {};
        //localStorage.setItem('answers', {});
        //ereader
        store.save({key: "answers", value: {}});
        loadFilters();
    }
}

function loadAnswersAndFeedback(data) {
            console.log("LAF");
            d = data;
            console.log(d);
            answers = d["answers"]
            flagged_questions = d["flagged_questions"]
            loadAnswers(answers);
            loadFlaggedQuestions(flagged_questions);
            saveAnswersToStorage();
            saveFlaggedQuestions();
}

function loadAnswers(answers) {
    // Rather than simply replacing the answers we merge them.
    console.log(answers);
    console.log(answers.length);
    if (Object.keys(answers).length > 0) {
        if (Object.keys(hash_answer_map).length < 1) {
            console.log("DIRECT LOAD");
            hash_answer_map = answers;
        } else {
            for (q in answers) {
                if (hash_answer_map.hasOwnProperty(q)) {
                    ans = hash_answer_map[q].concat(answers[q]);
                    ans = ans.filter((ans, index, self) =>
                        index === self.findIndex((t) => (
                            t.date === ans.date
                            ))
                            );
                    ans.sort(dynamicSort("date"));
                    hash_answer_map[q] = ans;

                } else {
                    hash_answer_map[q] = answers[q];
                }
                    

            }
        console.log(hash_answer_map);
        }
        toastr.info(Object.keys(answers).length + " answers loaded.");
    }
}

// Attempt to load answers from localStorage
function loadAnswersFromStorage() {
    //ereader
    store.exists("answers", function(exists) {
        if (exists) {
            store.get("answers", function(obj) {
                loaded_answers = JSON.parse(obj["value"]);
                loadAnswers(loaded_answers);

            });
        }
    });
}

function loadFlaggedQuestions(flagged) {
    // JSON returns set as an array
    if (flagged.length > 0) {
        flagged_questions = new Set([...flagged_questions, ...flagged]);
        toastr.info("Flagged question data loaded.");
    }
}

// Attempt to load answers from localStorage
function loadFlaggedQuestionsFromStorage() {
    //ereader
    store.exists("flagged_questions", function(exists) {
        if (exists) {
            store.get("flagged_questions", function(obj) {
                fq = JSON.parse(obj["value"]);
                loadFlaggedQuestions(fq);

            });
        }
    });
}

//    if (localStorage) {
//        try {
//            loaded_answers = localStorage.getItem('answers');
//
//            if (loaded_answers == null || loaded_answers == "null") {
//
//            } else {
//
//                loadAnswers(loaded_answers);
//
//            }
//        } catch (error) {
//            msg = "There was a problem loaded your saved answers.\n\n"+error;
//
//            toastr.warning(msg);
//            hash_answer_map = {};
//        }
//    } else {
//
//        toastr.warning("It appears your browser does not support localStorage. Your answers will not be saved.");
//    }

// Generates the score section
function buildActiveScoreList() {
    // TODO: Consider caching the score list so it is now rebuilt everytime
    //       a question is loaded

    list = $("#score-list");

    // Don't build the score list if it is not visible
    if (list.is(":hidden")) {
        return
    }

    // Empty any previously shown scores
    list.empty();

    questions_correct = 0;
    questions_answered = 0;

    // Build an array of answered questions (numerical number in all questions)
    var answers = [];
    var filtered_answers = [];

    // Loop through all saved answers
    for (qid in hash_answer_map) {
        // Check if the answer relates to a currently loaded question 
        if (hash_n_map.hasOwnProperty(qid)) {
            answers.push(hash_n_map[qid]);

            filtered_answer_id = filtered_questions.indexOf(qid);
            if (filtered_answer_id > -1) {
                filtered_answers.push(filtered_answer_id);
            }

        }
    }

    // If no answered questions loaded break;
    if (filtered_answers.length < 1) {
        $("#score-percent").empty().append("No questions answered.");
        return
        }


    filtered_answers.sort(function(a,b) { return a-b });

    for (ans in filtered_answers) {


        i = filtered_answers[ans];

        answer = hash_answer_map[filtered_questions[i]].slice(-1)[0];

        type = answer['type'];

        var n = i+1; // The question number starts from 1

        switch (type)
        {
            case "rapid":

                list.append($(document.createElement("li")).attr({
                    'id': 'score-' + i,
                    'class': answer["correct"],
                    'title': n
                }).text(n));

                if (answer["correct"]) {
                    questions_correct++;
                }
                questions_answered++;
                break;
            case "image_answer":

                list.append($(document.createElement("li")).attr({
                    'id': 'score-' + i,
                    'class': answer["correct"],
                    'title': n
                }).text(n));

                if (answer["correct"]) {
                    questions_correct++;
                }
                questions_answered++;
                break;

            case "sba":

                list.append($(document.createElement("li")).attr({
                    'id': 'score-' + i,
                    'class': answer["answer"],
                    'title': n
                }).text(n));

                if (answer["answer"] == "correct") {
                    questions_correct++;
                }
                questions_answered++;
                break;

            case "emq":

                // To generate the correct colour we use HSL were
                // the hue going from 0 -> 60 - 120 represents
                // green -> yellow -> red
                ratio = answer['n_correct'] / answer['answer'].length;
                hue = ratio * 120;

                list.append($(document.createElement("li")).attr({
                    'id': 'score-' + i,
                    'class': 'emq',
                    'title': n
                }).text(n + " ("+answer['n_correct']+"/"+answer['answer'].length+")").css({"background-color": "hsl("+hue+", 100%, 50%)"}));

                questions_correct = questions_correct + parseInt(answer['n_correct']);
                questions_answered = questions_answered + parseInt(answer['answer'].length);
                break;

            case "mba":
                correct = 0;
                q_number = 0;

                for (i in answer['answers']) {

                    if (answer["answers"][i]['answer'] == "correct") {
                        correct++;
                    }
                    q_number++;
                }

                ratio = correct / q_number;

                hue = ratio * 120;



                list.append($(document.createElement("li")).attr({
                    'id': 'score-' + i,
                    'class': "mba",
                    'title': n
                }).text(n + " ("+correct+"/"+q_number+")").css({"background-color": "hsl("+hue+", 100%, 50%)"}));

                questions_correct = questions_correct + correct;
                questions_answered = questions_answered + q_number;

                break;

            case "rank":
                // TODO
                console.log(answer);

                break;

            case "tf":
                ratio = answer['n_correct'] / answer['answer'].length;
                hue = ratio * 120;

                list.append($(document.createElement("li")).attr({
                    'id': 'score-' + i,
                    'class': 'tf',
                    'title': n
                }).text(n + " ("+answer['n_correct']+"/"+answer['answer'].length+")").css({"background-color": "hsl("+hue+", 100%, 50%)"}));

                questions_correct = questions_correct + parseInt(answer['n_correct']);
                questions_answered = questions_answered + parseInt(answer['answer'].length);

                break;

        }

        // Scores should link to their question
        $("#score-"+i).click(function(n) {
            loadQuestion(parseInt(n.currentTarget.title)-1);
        })


    }


    // Calculate users overall score
    percent = questions_correct/questions_answered*100;

    $("#score-percent").empty().append(percent.toFixed(2) + "% ("+questions_correct+"/"+questions_answered+" over "+Object.size(hash_answer_map)+" questions)");

    list_items = $("#score-list li");

    truncated = false;

    // Trucate the score list
    if (list_items.length > trucate_score_list_at && show_all_scores == false) {
        list_items.hide();
        list_items.slice(-trucate_score_list_at).show();
        truncated = true;
    }

    $("#score-list").append($(document.createElement("span")).attr({
        'id': 'toggle-score-vis',
    }));

    if (show_all_scores) {
        $("#toggle-score-vis").text("--Show Less--").click(function () {
            show_all_scores = false;
            buildActiveScoreList();
        });
    } else if (truncated) {
        $("#toggle-score-vis").text("--Show More--").click(function () {
            show_all_scores = true;
            buildActiveScoreList();
        });
    }

}



// Key bindings
function keyPress(e) {

    // Ignore our custom keybindings if we are currently in a field that
    // accepts some kind of input
    if ( $("*:focus:not(disabled)").is("textarea, input") ) return;


    var charCode = (typeof e.which == "number") ? e.which : e.keyCode
    console.log(charCode);

    switch(charCode)
    {
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
            $(".answer-list li:eq(0)").click();
            break;
        case 50: // 2
            $(".answer-list li:eq(1)").click();
            break;
        case 51: // 3
            $(".answer-list li:eq(2)").click();
            break;
        case 52: // 4
            $(".answer-list li:eq(3)").click();
            break;
        case 53:  // 5
            $(".answer-list li:eq(4)").click();
            break;
        case 54:  // 6
            $(".answer-list li:eq(5)").click();
            break;
        case 55:  // 7
            $(".answer-list li:eq(6)").click();
            break;
        case 56:  // 8
            $(".answer-list li:eq(7)").click();
            break;
        case 57:  // 9
            $(".answer-list li:eq(8)").click();
            break;
        case 72:  // H
            previousQuestion();
            break;
        case 76:  // L
            nextQuestion();
            break;

        case 102: // f
            $("#filter-toggle").click();
            break;
        case 103: // g
            $("#filters").slideDown("slow");
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
        $("#search-form").append($(document.createElement("button")).attr({ 'id': "clear-search-button" }).text("X").click(startSearch));
        $("#clear-search-button").wrap("<a href='#'></a>");
    } else {
        search_string = false;
    }
    loadFilters();
}

function setUpFilters() {
    specialty_filters = {};
    source_filters = {};
    $("#specialty-filters").empty();
    $("#source-filters").empty();
    for (q in questions) {

        for (s in questions[q]['specialty']) {
            specialty_filters[questions[q]['specialty'][s]] = true;
        }
        source_filters[questions[q]['source']] = true;

    }


    // This bit is rather fucked. It does work though.
    var specialty_filter_keys = Object.keys(specialty_filters);

    specialty_filter_keys.sort();

    i = 0;
    for (s in specialty_filter_keys) {
        i = i + 1;
        $("#specialty-filters").append(
            $(document.createElement("li")).attr(
                {
                    'id': 'filter-specialty-' + i,
                })).append(
                    $(document.createElement("input")).attr({
                        'type': 'checkbox',
                        'id': 'filter-specialty-' + escaper(specialty_filter_keys[s]),
                        'name': 'filter-specialty-checkbox',
                        'label': specialty_filter_keys[s],
                        'value': specialty_filter_keys[s]
                    })).append(specialty_filter_keys[s]);


                    //$("#filter-specialty-"+i));

                    //$("#filter-specialty-"+i).append(s);


    }

    if ($("[name='filter-specialty-checkbox']").length > 1) { 
        $("#specialty-filters").append(
            $(document.createElement("li")).attr({"class" : "select-all"}).text("Select All").click(function() { 
                checkBoxes = $("[name='filter-specialty-checkbox']")
                checkBoxes.prop("checked", !checkBoxes.prop("checked")); 

                loadFilters();
            }));
    }

    i = 0;
    for (s in source_filters) {
        i = i + 1;
        $("#source-filters").append(
            $(document.createElement("li")).attr(
            { id: 'filter-source-' + i, }).append(
                $(document.createElement("input")).attr({
                    'type': 'checkbox',
                    'id': 'filter-source-' + escaper(s),
                    'name': 'filter-source-checkbox',
                    'label': s,
                    'value': s
                })).append(s));
    }

    if ($("[name='filter-source-checkbox']").length > 1) { 
        $("#source-filters").append($(document.createElement("li")).attr({"class" : "select-all"}).text("Select All").click(function() { 
            checkBoxes = $("[name='filter-source-checkbox']")
            checkBoxes.prop("checked", !checkBoxes.prop("checked")); 

            loadFilters();
        }));
    }




    // Restore previously selected filters (before we attach the events)
    // ereader
    store.keys("store_keys = keys")
    for (i in store_keys) {
        if (/^(checkbox-)/.test(store_keys[i])) {
                id = store_keys[i].substr(9);

                $("#"+id).prop("checked", "checked");
        }
    };
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
    $("input[name=filter-specialty-checkbox],input[name=filter-source-checkbox]").change(function (e) {
        loadFilters();
    });

    $("#show-answered-questions-button").click(function () {
        show_answered_questions = !($("#show-answered-questions-button").is(":checked"));
        loadFilters();
    });

    $("#show-only-flagged-questions-button").click(function () {
        show_only_flagged_questions = ($("#show-only-flagged-questions-button").is(":checked"));
        loadFilters();
    });

    $("#auto-load-previous-answers-button").click(function () {
        auto_load_previous_answers = ($("#auto-load-previous-answers-button").is(":checked"));
    });

    loadFilters();

}


function loadFilters() {

    filtered_questions = [];

    active_specialty_filters = {};

    clearSavedCheckboxStates();

    $("input[name=filter-specialty-checkbox]:checked").each(
        function(index, e) {
            active_specialty_filters[e.value] = true;
            saveCheckboxState(e.id);
        });

        filter_specialty = !isEmptyObject(active_specialty_filters);


        active_source_filters = {};

        $("input[name=filter-source-checkbox]:checked").each(
            function(index, e) {
                active_source_filters[e.value] = true;
                saveCheckboxState(e.id);
            });

            filter_source = !(isEmptyObject(active_source_filters));


            if (search_string) { search_string = new RegExp(search_string, "i") }


            for (n in questions) {
                q = questions[n];

                // Filter questions that have an answer saved
                if (!show_answered_questions) {
                    if (hash_answer_map.hasOwnProperty(n)) {
                        continue;
                    }
                }

                // Filter questions that have not been flagged
                if (show_only_flagged_questions) {
                    if (!flagged_questions.has(n)) {
                        continue;
                    }
                }


                if (filter_specialty) {
                    var specialty_exists = false;
                    for (s in q['specialty']) {
                        if (active_specialty_filters.hasOwnProperty(q['specialty'][s])) {
                            specialty_exists = true;
                            break;
                        } else {
                            specialty_exists = false;
                        }
                    }
                    if (!specialty_exists) { continue; }
                }

                if (filter_source) {
                    if (!active_source_filters.hasOwnProperty(q['source'])) {
                        continue;
                    }
                }

                if (search_string) {
                    if (!searchObject(q, search_string)) {
                        continue
                    }
                }

                //filtered_questions[n] = q;
                filtered_questions.push(n);

            }

            for (n in filtered_questions) {
                hash_n_map[filtered_questions[n]] = parseInt(n);
            }


            //loadQuestion(0);
            //ereader
            loadPreviousQuestion();

            search_string = false;

}

function getQuestionDataByNumber(n) {
    qid = filtered_questions[n];
    return questions[qid];
}


function previousQuestion(e) {
    if (e && e.shiftKey) {
        loadQuestion(hash_n_map[current_question_uid] - 10);
    } else { 
        loadQuestion(hash_n_map[current_question_uid] - 1);
    }
}

function nextQuestion(e) {
    if (e && e.shiftKey) {
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
    for (var i in o) {

        if (typeof(o[i]) == "object") {
            // Recursively search the object tree
            if (searchObject(o[i], search_str)) {
                return true;
            }
        } else {
            if (String(o[i]).search(search_str) > -1 || String(i).search(search_str) > -1) {
                return true;
            }
        }
    }
    return false;
}

function saveAnswersAsFile()
{
    var textToWrite = JSON.stringify({"answers":hash_answer_map, "flagged_questions":[...flagged_questions]});
    var textFileAsBlob = new Blob([textToWrite], {type:'text/plain'});
    var fileNameToSaveAs = "answers";

    var downloadLink = document.createElement("a");
    downloadLink.download = fileNameToSaveAs;
    downloadLink.innerHTML = "Download File";
    if (window.webkitURL != null)
    {
        // Chrome allows the link to be clicked
        // without actually adding it to the DOM.
        downloadLink.href = window.webkitURL.createObjectURL(textFileAsBlob);
    }
    else
    {
        // Firefox requires the link to be added to the DOM
        // before it can be clicked.
        downloadLink.href = window.URL.createObjectURL(textFileAsBlob);
        downloadLink.onclick = destroyClickedElement;
        downloadLink.style.display = "none";
        document.body.appendChild(downloadLink);
    }

    downloadLink.click();
}

function similarity(s1, s2, toLower=true, stripWhitespace=true) {

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
  return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}

function editDistance(s1, s2) {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();

  var costs = new Array();
  for (var i = 0; i <= s1.length; i++) {
    var lastValue = i;
    for (var j = 0; j <= s2.length; j++) {
      if (i == 0)
        costs[j] = j;
      else {
        if (j > 0) {
          var newValue = costs[j - 1];
          if (s1.charAt(i - 1) != s2.charAt(j - 1))
            newValue = Math.min(Math.min(newValue, lastValue),
              costs[j]) + 1;
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0)
      costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

function dynamicSort(property) {
    var sortOrder = 1;
    if(property[0] === "-") {
        sortOrder = -1;
        property = property.substr(1);
    }
    return function (a,b) {
        var result = (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
        return result * sortOrder;
    }
}

function createRemoteStoreButtonIfRequired() {
console.log("START")
    if (($("#save-remote-data-button").length == 0) && (remote_store) && (remote_store_synced == false)) {
console.log("GO")
        $("#header-next-button").after($(document.createElement("button")).attr({ 'id': "save-remote-data-button" }).text("Save answers to Google").click(function () { document.getElementById("remote-frame").contentWindow.saveRemoteAnswers();}))
    }

}

function loadRemoteServer() {
$("body").append('<iframe id="remote-frame" src="gapp.html">');
$("#load-remote-server-button").remove();
}

function toggleFlagged() {
    console.log("TEST, fl");

    if (flagged_questions.has(current_question_uid)) {
        $("#flagged-button").text("NOT FLAGGED");
        flagged_questions.delete(current_question_uid);
        toastr.info("Question unflagged.")
    } else {
        $("#flagged-button").text("FLAGGED");
        console.log("add", current_question_uid)
        flagged_questions.add(current_question_uid);
        toastr.info("Question flagged.")
    }
    saveFlaggedQuestions();
    remote_store_synced = false;
}

function stopAnswersAutoloading() {
    for (qid in hash_answer_map) {
        console.log(qid);
        hash_answer_map[qid].slice(-1)[0]["autoload"] = false;
    }
}


// Popup search option for selected text
function getSelected() {
	if(window.getSelection) { return window.getSelection(); }
	else if(document.getSelection) { return document.getSelection(); }
	else {
		var selection = document.selection && document.selection.createRange();
		if(selection.text) { return selection.text; }
		return false;
	}
	return false;
}

// TODO: merge with rest of document.ready
/* create sniffer */
$(document).ready(function() {
		$('#main, #feedback').mouseup(function(event) {
				var selection = getSelected();
				console.log(selection);
				selection = $.trim(selection);
				if(selection != ''){

				$("span.popup-tag").empty();
				$("span.popup-tag").css("display","block");
				$("span.popup-tag").css("top",event.clientY);
				$("span.popup-tag").css("left",event.clientX);
				//$("span.popup-tag").text(selection);

        text = selection;

		// TODO: remove dulpication (also in checkAnswer.js
        // Build forms for statdx searches as it uses POST requests
        $(".popup-tag").append($(`
            <form method="post" action="https://app.statdx.com/search"
            target="_blank" name="form`+text+`" style="display:none">
            <input type="hidden" name="startIndex" value="0">
            <input type="hidden" name="category" value="All">
            <input type="hidden" name="searchType" value="documents">
            <input type="hidden" name="documentTypeFilters" value='["all"]'>
            <input type="hidden" name="searchTerm" value="`+text+`">
            <input type="submit" value="Open results in a new window"> 
            </form>
        `));

        $(".popup-tag").append($(document.createElement("a")).attr({
            "href": "https://www.google.com/search?q="+text,
            "target": "newtab",
            "class": "google-answer answer-link",
        }).text("G")).append($(document.createElement("a")).attr({
            "href": "https://radiopaedia.org/search?q="+text,
            "target": "newtab",
            "class": "radiopaedia-answer answer-link",
        }).text("R")).append($(document.createElement("a")).attr({
            "href": "STATDX",
            "target": "newtab",
            "class": "statdx-answer answer-link",
            "onClick": "document.forms['form"+text+"'].submit(); return false;",
        }).text("S"));

				}else{
				$("span.popup-tag").css("display","none");
				}
				});
		});

