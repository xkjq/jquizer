var dwvapp = [];
function loadQuestion(n) {
    saveOpenQuestion(n);
    //question_number = Object.size(filtered_questions);
    question_number = filtered_questions.length;

    $("#header").empty()
    $("#main").empty()
    $("#feedback").empty();
    $("#question-details").empty();

	// Hide any open search popups
	$("span.popup-tag").css("display","none");


    if (question_number == 0) { 
        $("#header").append("No questions to show. Refine your filter(s)/search or load more questions.");
        return;
    }

    // Stop trying to load negative questions
    n = Math.max(0, n);
    n = Math.min(question_number-1, n);


    // convert n to the hash
    //qid = n_hash_map[n];
    data = getQuestionDataByNumber(n);




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

    $("#header").append($("<button id='flagged-button'>").click(function(qid) { toggleFlagged(); }));

    if (flagged_questions.has(current_question_uid)) {
        $("#flagged-button").text("FLAGGED");
        } else {
        $("#flagged-button").text("NOT FLAGGED");
        }

    // Set up the question details block
    $("#question-details").append("Question details...<br />");
    $("#question-details").append("-------------------<br />");
    $("#question-details").append("ID: " + qid +"<br />");
    $("#question-details").append("Type: " + data['type'] +"<br />");
    $("#question-details").append("Source: " + data['source'] +"<br />");
    $("#question-details").append("Specialties: " + data['specialty'] +"<br />");
    $("#question-details").append("Meta: " + data['meta'] +"<br />");
    $("#question-details").append("Date: " + data['date'] +"<br />");

	$("#main").append($(document.createElement("div")).attr({
		'id': 'question-block',
	}));

	$("#main").append($(document.createElement("div")).attr({
		'id': 'answer-block',
	}));


    switch (question_type) {
        case "sba":

            $("#question-block").append("<br>").append(data['question']).append("<br>");


            appendAnswers(data['answers'], 1);

            break;

        case "emq":
            $("#question-block").append($(document.createElement("ol")).attr({
                'id': 'emq-options',
            }));

            answer_options = data['emq_options']

            for (n in answer_options) {
                $("#emq-options").append($(document.createElement("li")).attr({
                    'class': "emq-option",
                }).append(answer_options[n]));
            }

            $("#question-block").append(data['question']);


            $("#answer-block").append($(document.createElement("ol")).attr({
                'id': 'emq-questions',
            }));

            answers = data['answers'];

            for (a in answers) {

                selector = $(document.createElement("select")).attr({
                    "class" : "emq-select-box"
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

            $("#answer-block").append(
                $(document.createElement("button")).attr({
                    //'type': 'button',
                    'class': 'check-button',
                    'value': "Check Answers",
                }).text("Check Answers").click(checkAnswer)
            );

            break;

        case "mba":

            mba_answers = {};

            $("#question-block").append("<br>").append(data['background']).append("<br>");


            for (i in data['question']) {
                $("#answer-block").append("<br>").append(data['question'][i]).append("<br>");

                appendAnswers(data['answers'][i], i);
            }


            break

        case "rank":
            $("#question-block").append("<br>").append(data['question']).append("<br>");

            answers = data['answers'];
            $("#answer-block").append(
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

            $("#question-block").append("<br />");

            $("#answer-block").append(
                $(document.createElement("button")).attr({
                    //'type': 'button',
                    'class': 'check-button',
                    'value': "Check Answers"
                }).text("Check Answers").click(checkAnswer)
            );

            break;
        case "rapid":
            loadImage(data);

            answers = data['answers'];
            is_normal = data['normal'];



            var options = Object.keys(answers);

            options.sort();

            //$("#main").append($(document.createElement("div")).attr({
            //    'id': 'answer-block',
            //}));

            //buildRankList(options, answers);
            $("#answer-block").append($(document.createElement("span")).attr({
                'id': "answer",
                //'data-option': option,
                'data-answer': answers,
                'data-normal': is_normal,
                //'class': c,
                //'data-question-number': question_number
            }).append($(document.createElement("input")).attr({
                //'id': "answer-input-"+option,
            })));


            //$("#sortable-list").sortable();

            $("#answer-block").append("<br />");


            function submitNormal() {
                $("#answer input").val("Normal");
                checkAnswer();
            }

            $("#answer-block").append(
                $(document.createElement("button")).attr({
                    //'type': 'button',
                    'id': 'normal-button',
                    'value': "Normal"
                }).text("Normal").click(submitNormal)
            );

            $("#answer-block").append(
                $(document.createElement("button")).attr({
                    //'type': 'button',
                    'class': 'check-button',
                    'value': "Check Answer"
                }).text("Check Answer").click(checkAnswer)
            );

            $("#main input").focus().on("keyup", function(e) {
                if (e.keyCode == 13) {
                    $(".check-button").click()
                    }});

            break;
        case "image_answer":
            loadImage(data);

            answers = data['answers'];



            var options = Object.keys(answers);

            options.sort();

            //$("#main").append($(document.createElement("div")).attr({
            //    'id': 'answer-block',
            //}));

            //buildRankList(options, answers);
            $("#answer-block").append($(document.createElement("span")).attr({
                'id': "answer",
                //'data-option': option,
                'data-answer': answers,
                //'class': c,
                //'data-question-number': question_number
            }).append($(document.createElement("input")).attr({
                //'id': "answer-input-"+option,
            })));


            //$("#sortable-list").sortable();

            //$("#answer-block").append("<br />");

            $("#answer-block").append(
                $(document.createElement("button")).attr({
                    //'type': 'button',
                    'class': 'check-button',
                    'value': "Check Answer"
                }).text("Check Answer").click(checkAnswer)
            );

            $("#answer-block").focus().on("keyup", function(e) {
                if (e.keyCode == 13) {
                    $(".check-button").click()
                    }});

            break;
        case "label":
            loadImage(data);

            answers = data['answers'];
            $("#main").append(
                $(document.createElement("ul")).attr({
                    'id': 'answer-list',
                    //'class': 'answer-list allow-hover',
                    //'data-answered' : 0
                })
            );



            var options = Object.keys(answers);

            options.sort();

            //buildRankList(options, answers);
            for (var i = 0; i < options.length; i++) {
                option = options[i];
                $("#answer-list").append($(document.createElement("li")).attr({
                    'id': "answer-"+option,
                    'data-option': option,
                    'data-answer': answers[option],
                    //'class': c,
                    //'data-question-number': question_number
                }).append($(document.createElement("span")).text(option+":")).append($(document.createElement("input")).attr({
                    //'id': "answer-input-"+option,
                })));

                }

            //$("#sortable-list").sortable();

            $("#answer-block").append("<br />");

            $("#main").append(
                $(document.createElement("button")).attr({
                    //'type': 'button',
                    'class': 'check-button',
                    'value': "Check Answers"
                }).text("Check Answers").click(checkAnswer)
            );

            $("#main input").focus().on("keyup", function(e) {
                if (e.keyCode == 13) {
                    $(".check-button").click()
                    }});

            $("#answer-list input").first().focus()

            break;

        case "tf":
            $("#question-block").append("<br>").append(data['question']).append("<br>");

            answers = data['answers'];

            $("#answer-block").append(
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

                // I can't decide if we should allow this flexibility
                if (answers[a] instanceof Array) {
                    actual_answer = answers[a][0];
                    feedback = answers[a][1];
                } else {
                    feedback = "";
                    actual_answer = answers[a];
                }


                c = actual_answer;
                if (ordered) { 
                    c = c + " alpha-list"; 
                    a = options[n].substring(2);

                }



                $("#question-"+question_number+"-answers").append($(document.createElement("li")).attr({
                    'id': "q" + question_number + "a" + i,
                    'class': c,
                    'data-question-number': question_number,
                    'data-feedback': feedback
                //}).append(a).append(tf).click(function(e) {
                }).append("<a href='#/' class='answer-option-link'>"+a+"</a>").append(tf).click(function(e) {
                    $(e.currentTarget).toggleClass("tf_answer_true");
                    //if ($(e.currentTarget).find(".tf-active").length > 0) {
                    //    $(e.currentTarget).find(".tf-true, .tf-false").toggleClass("tf-active");

                    //} else { 
                    //    $(e.currentTarget).find(".tf-true").addClass("tf-active");
                    //}
                }));
                i = i + 1;
            }

            $(".tf-true, .tf-false").off().click(function(e) {
                $(e.currentTarget).toggleClass("tf_answer_true");
                //$(e.currentTarget.parentNode).children().removeClass("tf-active");
                //$(e.currentTarget).addClass("tf-active");
                e.stopPropagation();
            });

            $("#answer-block").append("<br />");

            $("#answer-block").append(
                $(document.createElement("button")).attr({
                    //'type': 'button',
                    'class': 'check-button',
                    'value': "Check Answers"
                }).text("Check Answers").click(checkAnswer)
            );

            break;


        default:

            $("#question-block").append("QUESTION TYPE NOT IMPLEMENTED YET!<br/><br/>"+question_type);

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
    $(".previous-button").each(function(index, e) {
        $(e).click(previousQuestion)
    });

    $(".next-button").off();
    $(".next-button").each(function(index, e) {
        $(e).click(nextQuestion)
    });




    if (hash_answer_map.hasOwnProperty(qid) && auto_load_previous_answers) {
        ans = hash_answer_map[qid].slice(-1)[0];
        if ((!ans.hasOwnProperty("autoload")) || (ans["autoload"] == true)) {
            checkAnswer(ans, true);
        }
        //switch(question_type) {
            //    case "sba":
                //        checkAnswer(hash_answer_map[qid], true);
                //        break
                //}
    }

    scrollTo(0, $("#content").position().top);

    if (fix_broken_question_formatting) {

        $(".btn-link").remove();
        $(".btn-xs").remove();

    }
    MathJax.Hub.Queue(["Typeset",MathJax.Hub,"MathExample"]);
    createRemoteStoreButtonIfRequired();


    // Preload images for the next N questions
    // (N = preload_images value)
    x = 1
    while(x <= preload_images) {
        data = getQuestionDataByNumber(n + x);

        // TODO: This should be rewritten
        if (typeof data !== 'undefined' && data.hasOwnProperty("images")) {
            data['images'].forEach(function(img) {
                setTimeout(function() {
                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', img);
                    xhr.send('');
                }, 1000);
            });

        }

        x = x + 1;
    }

}

function loadImage(data) {
    if (use_dwv_as_image_viewer) {
        loadDWV(data["images"]);
        $(".image-container").append("<span class='float-image-text'>")
        $(".float-image-text").append(data['question'])
    } else {
        $("#main").append("<br>").append(data['question']).append("<br>");

        if (data['images'] != undefined) {
            data['images'].forEach(function(img) {
                $("#main").append($(document.createElement("img")).attr({
                    "src": img,
                }));
            });
        }
    }
}

function loadDWV(images) {
    $("#main").append("<div class='image-container'></div>");
    if (images != undefined) {
        $(".image-container").append($('<!-- DWV --> <div id="dwv"> <!-- Toolbar --> <div id="dwv-toolbar-container"><div id="dwv-toolbar" class="toolbar"></div> <input type="range" id="sliceRange" value="0"></div><!-- Layer Container --> <div id="dwv-layerContainer" class="layerContainer"> <div class="dropBox"></div> <canvas class="imageLayer">Only for HTML5 compatible browsers...</canvas> <div class="infoLayer"> <div class="infotl"></div> <div class="infotc"></div> <div class="infotr"></div> <div class="infocl"></div> <div class="infocr"></div> <div class="infobl"></div> <div class="infobc"></div> <div class="infobr" style="bottom: 64px;"></div></div></div><!-- /layerContainer -->  <!-- /dwv -->'));

        var app = new dwv.App();
        dwvapp = app;
        //DEBUG
        var listenerWL = function (event) { 
            console.log("event: "+event.type);
            console.log(event);
            $(".infotc").text(event.wc);
        };
        app.addEventListener("wl-width-change", listenerWL);
        //app.addEventListener("wl-center-change", listener);
        app.init({

            "containerDivId": "dwv",
            "fitToWindow": true,
            "isMobile": true,
            "gui": ["tool"],
            "filters": ["Threshold", "Sharpen", "Sobel"],
            "tools" : ["Scroll", "WindowLevel", "ZoomAndPan"], // or try "ZoomAndPan"
        });




        var range = document.getElementById("sliceRange");
        range.min = 0;
        app.addEventListener("load-end", function () {
            range.max = app.getImage().getGeometry().getSize().getNumberOfSlices() - 1;

            if (range.max == 0) {
                $(range).hide();
            }
        });
        app.addEventListener("slice-change", function () {
            range.value = app.getViewController().getCurrentPosition().k;
        });
        range.oninput = function () {
            var pos = app.getViewController().getCurrentPosition();
            pos.k = this.value;
            app.getViewController().setCurrentPosition(pos);
        }

        try {
        app.abortLoad();
        app.reset();
        app.loadURLs(images);
        } catch (error) {
        toastr.error(error.message);

        }
        dwv.gui.appendResetHtml(app);
    //}, 0);
    //$(".layerContainer").height(size.height - 150);
    //$(".imageLayer").height(size.height - 100);
    //$(".layerContainer").width(size.width);
    }
}
 
function appendAnswers(answers, question_number) {
    //$("#main").append("<ol id='question-1-answers' class='answer-list'>");
    $("#answer-block").append(
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
        }).append("<a href='#/' class='answer-option-link'>"+a+"</a>").on("click", checkAnswer));
        i = i + 1;
    }

    $("#main").append("<br />");

    MathJax.Hub.Queue(["Typeset",MathJax.Hub,"body"]);


}

function buildRankList(options, answers) {

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



