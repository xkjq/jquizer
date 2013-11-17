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


// Settings
var auto_load_previous_answers = true;
var rebuild_score_list_on_answer = true;

var trucate_score_list_at = 20;

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

// uid of the currently loaded question
var current_question_uid = 0;

var search_string = false;

var show_answered_questions = true;

var mba_answers = {};


var questions_answered = 0;
var questions_correct = 0;


function loadData(data, textStatus) {

    questions = data;
    //filtered_questions = data;
    setUpFilters();

}


$(document).ready(function() {

        //Populate version info
        $("#version-info").text("version: " + quiz_version);

        toastr.options.positionClass = "toast-bottom-right";

        $("#loading").addClass("show");

        $.getJSON("questions", loadData).fail(function(jqxhr, textStatus, error) { 

            toastr.warning("Unable to load questions<br/><br/>Perhaps you wish to try loading them manually?");

            }).success(function () {

                toastr.info(Object.size(questions) + " questions loaded");


                }).always(function() {

                    $("#loading").removeClass("show");

                    $("#filter-toggle").click(function() { 
                        $("#filters").slideToggle("slow"); 
                        });

                    $("#question-details-toggle").click(function() { 
                        $("#question-details").slideToggle("slow"); 
                        });

                    $("#score-toggle").click(function() { 
                        $("#score").slideToggle("slow"); 
                        });

                    $("#about-toggle, #about-close").click(function() { 
                        $("#about").slideToggle("slow"); 
                        });

                    $("#goto-question-button").click(function() {
                        loadQuestion($("#goto-question-input").val()-1);
                        $("#goto-question-input").blur();
                        });

                    $("#search-button").click(function() {
                            startSearch($("#search-input").val());
                            $("#search-input").blur();
                            });

                    $("#delete-answers-button").click(function() {
                            resetAnswers();
                            });

                    $("#save-answers-button").click(function() {
                            saveAnswersAsFile();
                            });

                    $(document).keypress(keyPress);
            });

        loadAnswersFromStorage();

$("#content").swipe({
  swipeLeft:function(event, direction, distance, duration, fingerCount) {
    nextQuestion(event);
  },
  swipeRight:function(event, direction, distance, duration, fingerCount) {
    previousQuestion(event);
  },
  fallbackToMouseEvents:false
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
    try {
        localStorage.setItem('answers', JSON.stringify(hash_answer_map));
    } catch(e) {
        msg = "Local storage not supported";
        return false;
    }
}

function saveCheckboxState(id) {
    try {
        localStorage.setItem('checkbox-'+id, 1);
    } catch(e) {
        msg = "Local storage not supported";
        return false;
    }
}

// Check all keys in the localStorage. If it starts with checkbox- remove it.
function clearSavedCheckboxStates() {
    try {
        Object.keys(localStorage).forEach(function(key) {
                if (/^(checkbox-)/.test(key)) {
                localStorage.removeItem(key);
                }
                });
    } catch(e) {
        msg = "Local storage not supported";
        return false;
    }
}

// Deletes saved answers from localStorage
function resetAnswers() {
    var msg = "Are you sure you wish to delete all your answers?\n\nThis is non-recoverable!";

    if (confirm(msg)) {
        hash_answer_map = {};
        localStorage.setItem('answers', {});
        loadFilters();
    }
}


// Attempt to load answers from localStorage
function loadAnswersFromStorage() {
    if (localStorage) {
        try {
            loaded_answers = localStorage.getItem('answers');

            if (loaded_answers == null || loaded_answers == "null") {

            } else {

                hash_answer_map = JSON.parse(loaded_answers);

                toastr.info(Object.size(hash_answer_map) + " answers loaded.");

            }
        } catch (error) {
            msg = "There was a problem loaded your saved answers.\n\n"+error;

            toastr.warning(msg);
            hash_answer_map = {};
        }
    } else {

        toastr.warning("It appears your browser does not support localStorage. Your answers will not be saved.");
    }
}

// Generates the score section
function buildActiveScoreList() {

    list = $("#score-list");

    // Empty any previously shown scores
    list.empty();

    questions_correct = 0;
    questions_answered = 0;

    // Build an array of answered questions (numerical number in all questions)
    var answers = [];

    for (qid in hash_answer_map) {
        if (hash_n_map.hasOwnProperty(qid)) {
            answers.push(hash_n_map[qid]);
        }
    }

    answers.sort(function(a,b) { return a-b });

    for (ans in answers) {

        i = answers[ans];

        answer = hash_answer_map[filtered_questions[i]];

        type = answer['type'];

        var n = i+1; // The question number is starts from 1

        switch (type)
        {
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

    // Trucate the score list
    if (list_items.length > trucate_score_list_at) {
        list_items.hide();
        list_items.slice(-trucate_score_list_at).show();

        $("#score-list").append(
                $("<span>---show more--</span>").click(function() {
                    $("#score-list li").show();
                    $(this).text("--show less--").click(function () { buildActiveScoreList() } );
                    }));
    }

}



// Key bindings
function keyPress(e) {
    console.log(e.keyCode, e);

    // Ignore our custom keybindings if we are currently in a field that
    // accepts some kind of input
    if ( $("*:focus").is("textarea, input") ) return;

    switch(e.keyCode)
    {
        case 13: // Return
            $(".next-button:last").click();
            break;
        case 32: // Space
            $(".next-button:last").click();
            e.preventDefault(); // Needed to stop the default action (scroll)
            break;

            // Numbers 1-9 select the corresponding answer (if it exists)
            // TODO: fix for multi question questions
        case 49: // 1
            $("#question-1-answers li:eq(0)").click();
            break;
        case 50: // 2
            $("#question-1-answers li:eq(1)").click();
            break;
        case 51: // 3
            $("#question-1-answers li:eq(2)").click();
            break;
        case 52: // 4
            $("#question-1-answers li:eq(3)").click();
            break;
        case 53:  // 5
            $("#question-1-answers li:eq(4)").click();
            break;
        case 54:  // 6
            $("#question-1-answers li:eq(5)").click();
            break;
        case 55:  // 7
            $("#question-1-answers li:eq(6)").click();
            break;
        case 56:  // 8
            $("#question-1-answers li:eq(7)").click();
            break;
        case 57:  // 9
            $("#question-1-answers li:eq(8)").click();
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
        $("#search-form").append($(document.createElement("button")).attr({ id: "clear-search-button" }).text("X").click(startSearch));
    } else {
        search_string = false;
    }
    loadFilters();
}

function setUpFilters() {
    specialty_filters = {};
    source_filters = {};
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
    try {

        Object.keys(localStorage).forEach(function(key) {
                if (/^(checkbox-)/.test(key)) {
                id = key.substr(9);

                $("#"+id).prop("checked", "checked");
                }
                });
    } catch(e) {
        toastr.warning("Unable to load previous settings");
    }

    // Rerun filters everytime the checkboxes are changed
    $("input[name=filter-specialty-checkbox],input[name=filter-source-checkbox]").change(function (e) {
            loadFilters();
            });

    $("#show-answered-questions-button").click(function () {
            show_answered_questions = !($("#show-answered-questions-button").is(":checked"));
            loadFilters();
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

        if (!show_answered_questions) {
            if (hash_answer_map.hasOwnProperty(n)) {
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



    loadQuestion(0);

    search_string = false;

}

function checkBestAnswer(e, load) {

    if (load == true) { 
        target_id = e['target_id']; 
        save_answer = false;
        question_number = e['question_number'];
    } else { 
        save_answer = true;
        target_id = e.currentTarget.getAttribute('id');
        question_number = e.currentTarget.getAttribute('data-question-number');
    }


    // Add the "correct" class to all answers that are correct
    $("#question-"+question_number+"-answers > .1").addClass("correct");


    // Check if the selected answer is correct
    if ($("#"+target_id).hasClass("1")) { 
        answer = "correct";

    } else {
        // If not we mark it as incorrect
        $("#"+target_id).addClass("incorrect");
        answer = "incorrect";

    }

    // Remove the click events from the answered question
    $("#question-"+question_number+"-answers").removeClass("allow-hover").children().each(function(index, e) {
            $(e).off();
            });

    return { 
t: target_id, 
       q: question_number, 
       a: answer,
       s: save_answer
    }

}


function checkAnswer(e, load) {
    //load = "undefined";
    //load = typeof load !== 'undefined' ? load : false;


    data = questions[current_question_uid];

    //current_question_uid_hash = hash_n_map[current_question_uid];

    question_type = data['type'];

    $("#feedback").empty();

    switch (question_type) {
        case "sba":

            return_value = checkBestAnswer(e, load);

            if (return_value.s) {
                hash_answer_map[current_question_uid] = { 
                    "type" : "sba",
                    "target_id" : return_value.t,
                    "question_number" : return_value.q,
                    "date" : Date(),
                    "answer" : return_value.a
                }
                saveAnswersToStorage();

            }
            break;

        case "emq":
            if (load == true) {

                i = 0;
                $(".emq-select-box").each(function(index, option) {
                        $(option).val(e["answer"][i]);
                        i = i+1;
                        });


            }

            var answers = [];
            var correct = [];
            var n_correct = 0;
            $(".emq-question").each(
                    function(index, option) {

                    select = $(option).children("select");

                    selected_option = select.val();
                    correct_option = option.getAttribute("data-answer");
                    feedback = option.getAttribute("data-feedback");

                    select.remove();

                    answers.push(selected_option);

                    if (correct_option == selected_option) {
                    $(option).append("<br/><span class='emq-answer-feedback correct'>Yeah mate! <b>" + correct_option + "</b> is the right answer<br/>-----------<br/>" + feedback + "</span>");
                    correct.push("correct")
                    n_correct = n_correct + 1;
                    } else {
                    //$(option).addClass("incorrect");
                    $(option).append("<br/><span class='emq-answer-feedback incorrect'>Are you joking? <b>" + correct_option + "</b> is the right answer (you said <i>"+selected_option+"</i>)<br/>-----------<br/>" + feedback + "</span>");
                    correct.push("incorrect")
                    }
                    }
            );

            $(".check-button").remove();


            // Save answer
            hash_answer_map[current_question_uid] = { 
                "type" : "emq",
                "date" : Date(),
                "answer" : answers,
                "correct" : correct,
                "n_correct" : n_correct
            }
            saveAnswersToStorage();


            break;
        case "mba":

            if (load == true) {

                for (i in e['answers']) {
                    p = e['answers'][i];
                    checkBestAnswer(p, load);
                }

            } else {

                var save_answer = false;

                return_value = checkBestAnswer(e, load);

                if (return_value.s) {
                    mba_answers[return_value.q] = {
                        "target_id" : return_value.t,
                        "answer" : return_value.a,
                        "question_number" : return_value.q
                    }

                }

                n = $(".answer-list").length;

                if (n == Object.size(mba_answers)) { 

                    hash_answer_map[current_question_uid] = { 
                        "type" : "mba",
                        "answers" : mba_answers,
                        "date" : Date(),
                    }

                    saveAnswersToStorage();

                } else {
                    // Don't show feedback until all the questions have been
                    // attempted
                    return;
                }
            }

            break;
        case "rank":
            if (load == true) {

                // If we are loading an answer we clear our answer list
                // and rebuild it from the saved answer.
                $("#sortable-list").empty();
                buildRankList(e['order'], data['answers']);
            }

            order = [];

            correct_order = data['answer_order'].split("");

            map = {}

            for (i in correct_order) {
                map[correct_order[i]] = i;

            }

            number_options = correct_order.length;

            var i = 0;

            var neg_marks = 0;

            // Max score is based upon the vumber of options
            var max_score = 0;
            for (var x = 1; x < number_options; x++) {
                max_score = max_score + x;
            }
            max_score = max_score + Math.floor(number_options / 2);

            $("#sortable-list li").each(function(index, option) {
                    aid = option.getAttribute("data-option")
                    order.push(aid);

                    diff = Math.abs(i - map[aid])


                    hue = ((number_options - 1) - diff) / (number_options - 1) * 120;

                    $(option).css({"background-color": "hsl("+hue+", 100%, 50%)"});

                    neg_marks = neg_marks + diff;

                    i++;

                    });

            score = max_score - neg_marks;

            hue = score / max_score * 120;

            $("#feedback").append("<span style='color: gray'>The current colour scheme probably gives to much of a positive impression (you have to really mess up your order to see red shades) and should therefore probably be given a more negative skew. Any advice or suggestions would be appreciated.</span>");
            $("#feedback").append("<br />");
            $("#feedback").append($("<p>Your score: "+score+"/"+max_score+"</p>").css({"background-color": "hsl("+hue+", 100%, 50%)"}));
            $("#feedback").append("<br />");
            $("#feedback").append("The correct order is "+correct_order);

            $("#feedback").append(
                    $(document.createElement("ol")).attr({
                        'id': 'correct-list',
                        //'class': 'answer-list allow-hover',
                        'data-answered' : 0
                        })
                    );

            for (item in correct_order) {

                option = correct_order[item];


                $("#correct-list").append($(document.createElement("li")).attr({
                            'id': "correct-answer-"+option,
                            'data-option': option,
                            //'class': c,
                            //'data-question-number': question_number
                            }).text(option + " - " + data['answers'][option]));
            }

            // Disable the sortable (it may be good to allow multiple attempts)
            $("#sortable-list").sortable("disable");

            $("#feedback").append("<br />");

            $(".check-button").remove();

            // Save answer
            hash_answer_map[current_question_uid] = { 
                "type" : "rank",
                "date" : Date(),
                "order" : order,
                "correct_order" : correct_order,
                "score" : score,
                "max_score" : max_score
            }
            saveAnswersToStorage();

            break;
        case "tf":
            var save_answer = true;

            if (load == true) {
                console.log(e);
                console.log(data);

                var save_answer = false;

                $(".tf-answer-block li").each(function (index, option) {
                        if (e.answer[index] == 1) {
                        $(option).find(".tf-true").addClass("tf-active");
                        }

                        });


            }

            var answers = [];
            var correct = [];
            var n_correct = 0;
            // True / False answers default to false if not selected

            $(".tf-answer-block li").each(function (index, option) {

                    a = $(option).find(".tf-active");

                    if (a.length > 0 && a[0].textContent == "True") {
                    answer = 1;
                    answers.push(1);
                    } else {
                    $(option).find(".tf-false").addClass("tf-active");
                    answer = 0;
                    answers.push(0);
                    }

                    if ($(option).hasClass(answer)) {
                    $(option).addClass("correct");
                    correct.push("correct");
                    n_correct = n_correct + 1;
                    } else {
                    $(option).addClass("incorrect");
                    correct.push("incorrect");
                    }


            });

            $(".tf-answer-block").removeClass("allow-hover").find("*").each(function(index, e) {
                    $(e).off()
                    });

            if (save_answer == true) {
                hash_answer_map[current_question_uid] = { 
                    "type" : "tf",
                    "date" : Date(),
                    "answer" : answers,
                    "correct" : correct,
                    "n_correct" : n_correct
                }
                saveAnswersToStorage();
            }

            $(".check-button").remove();

            console.log(e);
            console.log(load);
            break
    }




    $("#feedback").append("<br />");
    $("#feedback").append(data['feedback']);

    if (data['external'] !== undefined) {
        $("#feedback").append("<br />");
        $("#feedback").append("<p>"+data['external']+"</p>");
    } 

    if (rebuild_score_list_on_answer) {
        buildActiveScoreList();
    }
}



function loadQuestion(n) {

    //question_number = Object.size(filtered_questions);
    question_number = filtered_questions.length;

    $("#header").empty()
        $("#main").empty()
        $("#feedback").empty();
    $("#question-details").empty();


    if (question_number == 0) { 
        $("#header").append("No questions to show. Refine your filter(s)/search.");
        return;
    }

    // Stop trying to load negative questions
    n = Math.max(0, n);
    n = Math.min(question_number-1, n);


    // convert n to the hash
    //qid = n_hash_map[n];
    qid = filtered_questions[n];


    data = questions[qid];


    question_type = data['type'];


    current_question_uid = qid

        m = n+1;


    $("#header").append($(document.createElement("button")).attr({
                //'type': 'button',
                'class': 'previous-button',
                'value': "Previous"
                }).text("Previous"));

    $("#header").append($(document.createElement("span")).attr({
                'id': 'header-text'
                }).text("Question "+m+" of "+(question_number)));

    $("#header").append($(document.createElement("button")).attr({
                //'type': 'button',
                'class': 'next-button',
                'id': 'header-next-button',
                'value': "Next"
                }).text("Next"));

    // Set up the question details block
    $("#question-details").append("Question details...<br />");
    $("#question-details").append("-------------------<br />");
    $("#question-details").append("ID: " + qid +"<br />");
    $("#question-details").append("Type: " + data['type'] +"<br />");
    $("#question-details").append("Source: " + data['source'] +"<br />");
    $("#question-details").append("Specialties: " + data['specialty'] +"<br />");
    $("#question-details").append("Meta: " + data['meta'] +"<br />");
    $("#question-details").append("Date: " + data['date'] +"<br />");


    switch (question_type) {
        case "sba":

            $("#main").append("<br>").append(data['question']).append("<br>");


            appendAnswers(data['answers'], 1);

            break;

        case "emq":
            $("#main").append($(document.createElement("ol")).attr({
                        'id': 'emq-options',
                        }));

            answer_options = data['emq_options']

                for (n in answer_options) {
                    $("#emq-options").append($(document.createElement("li")).attr({
                                'class': "emq-option",
                                }).append(answer_options[n]));
                }

            $("#main").append(data['question']);


            $("#main").append($(document.createElement("ol")).attr({
                        'id': 'emq-questions',
                        }));

            answers = data['answers'];

            for (a in answers) {

                selector = $(document.createElement("select")).attr({
                        "class" : "emq-select-box"
                        });

                // I can't decide if we should allow this flexibility
                if (answers[a] instanceof Array) {
                    actual_answer = answers[a][0];
                    feedback = answers[a][1];
                } else {
                    feeback = "";
                    actual_answer = answers[a];
                }


                $("#emq-questions").append($(document.createElement("li")).attr({
                            'class': "emq-question",
                            "data-answer": actual_answer,
                            "data-feedback": feedback,
                            }).append(a).append(selector));

                selector.append(
                        $(document.createElement("option")).attr('value', "null").text("--Select--")
                        );

                $(answer_options).each(function (index, op) { selector.append(
                            $(document.createElement("option")).attr('value', op).append(op)) }
                        );

            }

            $("#main").append(
                    $(document.createElement("button")).attr({
                        //'type': 'button',
                        'class': 'check-button',
                        'value': "Check Answers",
                        }).text("Check Answers").click(checkAnswer)
                    );

            break;

        case "mba":

            mba_answers = {};

            $("#main").append("<br>").append(data['background']).append("<br>");


            for (i in data['question']) {
                $("#main").append("<br>").append(data['question'][i]).append("<br>");

                appendAnswers(data['answers'][i], i);
            }


            break

        case "rank":
                $("#main").append("<br>").append(data['question']).append("<br>");

                answers = data['answers'];
                $("#main").append(
                        $(document.createElement("ol")).attr({
                            'id': 'sortable-list',
                            //'class': 'answer-list allow-hover',
                            'data-answered' : 0
                            })
                        );


                var options = Object.keys(answers);

                options.sort();

                buildRankList(options, answers);

                $("#sortable-list").sortable();

                $("#main").append("<br />");

                $("#main").append(
                        $(document.createElement("button")).attr({
                            //'type': 'button',
                            'class': 'check-button',
                            'value': "Check Answers"
                            }).text("Check Answers").click(checkAnswer)
                        );

                break;

        case "tf":
                $("#main").append("<br>").append(data['question']).append("<br>");

                answers = data['answers'];

                $("#main").append(
                        $(document.createElement("ol")).attr({
                            'id': 'question-'+question_number+'-answers',
                            'class': 'tf-answer-block answer-list allow-hover',
                            'data-answered' : 0
                            })
                        );


                var options = Object.keys(answers);

                var ordered = false;

                tf = "<span class='tf-answer-options'><span class='tf-true'>True</span> / <span class='tf-false'>False</span></span>";

                // Test if it is an ordered list
                if (options[0].substring(0, 2).match(/[A-Z]\./i)) {
                    options.sort();
                    // If it is we must maintain the order. Otherwise
                    // we can randomise it. (NOT YET IMPLEMENTED)
                    ordered = true;
                }

                i = 0;
                for (n in options) {
                    a = options[n];

                    c = answers[a];
                    if (ordered) { 
                        c = c + " alpha-list"; 
                        a = options[n].substring(2);

                    }

                    $("#question-"+question_number+"-answers").append($(document.createElement("li")).attr({
                                'id': "q" + question_number + "a" + i,
                                'class': c,
                                'data-question-number': question_number
                                }).append(a).append(tf).click(function(e) {
                                    console.log("clicked");
                                    console.log("2");
                                    if ($(e.currentTarget).find(".tf-active").length > 0) {
                                    $(e.currentTarget).find(".tf-true, .tf-false").toggleClass("tf-active");
                                    console.log($(e.currentTarget).find("span"));

                                    } else { 
                                    $(e.currentTarget).find(".tf-true").addClass("tf-active");
                                    }
                                    }));
                    i = i + 1;
                }

                $(".tf-true, .tf-false").off().click(function(e) {
                        console.log(e);
                        $(e.currentTarget.parentNode).children().removeClass("tf-active");
                        $(e.currentTarget).addClass("tf-active");
                        e.stopPropagation();
                        });

                $("#main").append("<br />");

                $("#main").append(
                        $(document.createElement("button")).attr({
                            //'type': 'button',
                            'class': 'check-button',
                            'value': "Check Answers"
                            }).text("Check Answers").click(checkAnswer)
                        );

                break;


        default:

                $("#main").append("QUESTION TYPE NOT IMPLEMENTED YET!<br/><br/>"+question_type);

                break;
    }


    $("#main").append(
            $(document.createElement("button")).attr({
                //'type': 'button',
                'class': 'next-button',
                'label': "Next",
                'value': "Next",
                }).text("Next")
            );

    $(".previous-button").off();
    $(".previous-button").each(function(index, e) {
            $(e).click(previousQuestion)
            });

    $(".next-button").off();
    $(".next-button").each(function(index, e) {
            $(e).click(nextQuestion)
            });


    if (hash_answer_map.hasOwnProperty(qid) && auto_load_previous_answers) {
        checkAnswer(hash_answer_map[qid], true);
        //switch(question_type) {
        //    case "sba":
        //        checkAnswer(hash_answer_map[qid], true);
        //        break
        //}
    }

    scrollTo(0, $("#content").position().top);

}

function buildRankList(options, answers) {

    console.log(options);
    console.log(answers);

    for (var i = 0; i < options.length; i++) {
        option = options[i];

        //c = answers[n];

        $("#sortable-list").append($(document.createElement("li")).attr({
                    'id': "answer-"+option,
                    'data-option': option,
                    //'class': c,
                    //'data-question-number': question_number
                    }).text(option + " - " + answers[option]));
    }
}

function appendAnswers(answers, question_number) {
    //$("#main").append("<ol id='question-1-answers' class='answer-list'>");
    $("#main").append(
            $(document.createElement("ol")).attr({
                'id': 'question-'+question_number+'-answers',
                'class': 'answer-list allow-hover',
                'data-answered' : 0
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

    i = 0;
    for (n in options) {
        a = options[n];

        c = answers[a];
        if (ordered) { 
            c = c + " alpha-list"; 
            a = options[n].substring(2);

        }

        $("#question-"+question_number+"-answers").append($(document.createElement("li")).attr({
                    'id': "q" + question_number + "a" + i,
                    'class': c,
                    'data-question-number': question_number
                    }).append(a).click(checkAnswer));
        i = i + 1;
    }

    $("#main").append("<br />");

}

function previousQuestion(e) {
    if (e.shiftKey) {
        loadQuestion(hash_n_map[current_question_uid] - 10);
    } else { 
        loadQuestion(hash_n_map[current_question_uid] - 1);
    }
}

function nextQuestion(e) {
    if (e.shiftKey) {
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
	var textToWrite = JSON.stringify(hash_answer_map);
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
