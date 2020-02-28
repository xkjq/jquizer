function checkAnswer(e, load) {
  //load = "undefined";
  //load = typeof load !== 'undefined' ? load : false;
  //
  //needed to stop anchor momevent
  //e.preventDefault();

  data = questions[current_question_uid];

  //current_question_uid_hash = hash_n_map[current_question_uid];

  question_type = data["type"];

  $("#feedback").empty();

  switch (question_type) {
    case "sba":
      return_value = checkBestAnswer(e, load);

      if (return_value.s) {
        saveAnswerToHashMap(current_question_uid, {
          type: "sba",
          target_id: return_value.t,
          question_number: return_value.q,
          date: Date(),
          answer: return_value.a
        });
      }
      break;

    case "emq":
      if (load == true) {
        i = 0;
        $(".emq-select-box").each(function(index, option) {
          $(option).val(e["answer"][i]);
          i = i + 1;
        });
      }

      var answers = [];
      var correct = [];
      var n_correct = 0;
      $(".emq-question").each(function(index, option) {
        select = $(option).children("select");

        selected_option = select.val();
        correct_option = option.getAttribute("data-answer");
        feedback = option.getAttribute("data-feedback");

        // Don't display feedback if none has been defined
        if (feedback == null) {
          feedback = "";
        }

        select.remove();

        answers.push(selected_option);

        if (correct_option == selected_option) {
          $(option).append(
            "<br/><span class='emq-answer-feedback correct'>Correct: <b>" +
              correct_option +
              "</b> is the right answer<br/>-----------<br/>" +
              feedback +
              "</span>"
          );
          correct.push("correct");
          n_correct = n_correct + 1;
        } else {
          //$(option).addClass("incorrect");
          $(option).append(
            "<br/><span class='emq-answer-feedback incorrect'>Incorrect: <b>" +
              correct_option +
              "</b> is the right answer (you said <i>" +
              selected_option +
              "</i>)<br/>-----------<br/>" +
              feedback +
              "</span>"
          );
          correct.push("incorrect");
        }
      });

      $(".check-button").remove();

      // Save answer
      saveAnswerToHashMap(current_question_uid, {
        type: "emq",
        date: Date(),
        answer: answers,
        correct: correct,
        n_correct: n_correct
      });

      break;
    case "mba":
      if (load == true) {
        for (i in e["answers"]) {
          p = e["answers"][i];
          checkBestAnswer(p, load);
        }
      } else {
        var save_answer = false;

        return_value = checkBestAnswer(e, load);

        if (return_value.s) {
          mba_answers[return_value.q] = {
            target_id: return_value.t,
            answer: return_value.a,
            question_number: return_value.q
          };
        }

        n = $(".answer-list").length;

        if (n == Object.size(mba_answers)) {
          saveAnswerToHashMap(current_question_uid, {
            type: "mba",
            answers: mba_answers,
            date: Date.now()
          });
        } else {
          // Don't show feedback until all the questions have been
          // attempted
          return;
        }
      }

      break;
    case "rapid":
      if (load == true) {
        //
        //                // If we are loading an answer we clear our answer list
        //                // and rebuild it from the saved answer.
        //                //$("#sortable-list").empty();
        //                //buildRankList(e['order'], data['answers']);
        console.log(e["answer"]);
        $("#answer input").val(e["answer"]);
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
      is_normal = $("#answer").attr("data-normal");

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
          correct_answers.forEach(function(option) {
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
                    class: "google-answer"
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
                    class: "imaios-answer"
                  })
                  .text("I")
              )
          );

          if (best_sim >= similarity_limit) {
            $("#answer").addClass("correct");
            $("#answer").addClass("similarity-correct");
            n_correct = n_correct + 1;
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
        correct_answers.forEach(function(option) {
          $("#acceptable-answers").append(option + ", ");
        });
      }

      $("#feedback").append("<br />");

      $("#normal-button").remove();
      $(".check-button").remove();

      // Save answer
      if (load != true) {
        saveAnswerToHashMap(current_question_uid, {
          type: "rapid",
          date: Date(),
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
        console.log(e["answer"]);
        $("#answer input").val(e["answer"]);
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

      correct_answers.forEach(function(option) {
        sim = similarity(a.toLowerCase(), option.toLowerCase());
        if (sim > best_sim) {
          best_answer = option;
          best_sim = sim;
        }
      });

      if (best_sim < 1) {
        $.each(wordlist, function(key, value) {
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
        diff.forEach(function(part) {
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
          .append(
            $(document.createElement("a"))
              .attr({
                href:
                  "https://www.google.com/search?q=" +
                  replaced_lower_case_answer,
                target: "newtab",
                class: "google-answer"
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
                class: "imaios-answer"
              })
              .text("I")
          )
      );

      $("#answer-block").append(
        $(document.createElement("p"))
          .attr({
            id: "acceptable-answers"
          })
          .text("Acceptable answers: ")
      );
      correct_answers.forEach(function(option) {
        $("#acceptable-answers").append(option + ", ");
      });

      correct = false;
      if (best_sim >= similarity_limit) {
        $("#answer").addClass("correct");
        $("#answer").addClass("similarity-correct");
        n_correct = n_correct + 1;
        correct = true;
      } else {
        $("#answer").addClass("incorrect");
      }

      $("#feedback").append("<br />");

      loadHelpImages(correct_answers);

      $(".check-button").remove();

      // Save answer
      if (load != true) {
        saveAnswerToHashMap(current_question_uid, {
          type: "image_answer",
          date: Date(),
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
        console.log(e["answers"]);
        //i = 0;
        $("#answer-list li").each(function(index, option) {
          $(option)
            .find("input")
            .val(e["answers"][option.getAttribute("data-option")]);
          //i = i+1;
        });
      }

      var answers = {};

      var correct = [];
      var n_correct = 0;

      var correct_answers = [];

      $("#answer-list li").each(function(index, option) {
        aid = option.getAttribute("data-option");
        correct_answer = option.getAttribute("data-answer");
        correct_answers.push(correct_answer);

        input_box = $(option).find("input");
        a = input_box.val();
        input_box.replaceWith(
          $(document.createElement("span"))
            .attr({
              class: "label-answer-text"
            })
            .text(a)
        );

        if (a.toLowerCase() == correct_answer.toLowerCase()) {
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

          sim = similarity(a, correct_answer);

          $(option).append(
            $(document.createElement("span"))
              .attr({
                class: "label-similarity"
              })
              .text("(" + Math.round(sim * 100) / 100 + ")")
          );

          if (sim >= similarity_limit) {
            $(option).addClass("correct");
            $(option).addClass("similarity-correct");
            n_correct = n_correct + 1;
            correct.push("correct");
          } else {
            $(option).addClass("incorrect");
            correct.push("incorrect");
          }
        }
        replaced_lower_case_answer = correct_answer
          .toLowerCase()
          .replace("left", "")
          .replace("right", "");

        $(option)
          .append(
            $(document.createElement("a"))
              .attr({
                href:
                  "https://www.google.com/search?q=" +
                  replaced_lower_case_answer,
                target: "newtab",
                class: "google-answer"
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
                class: "imaios-answer"
              })
              .text("I")
          );

        answers[aid] = a;
      });

      loadHelpImages(correct_answers);

      $("#feedback").append("<br />");

      $(".check-button").remove();

      // Save answer
      if (load != true) {
        saveAnswerToHashMap(current_question_uid, {
          type: "label",
          date: Date(),
          answers: answers,
          correct: correct,
          n_correct: n_correct
        });
      }

      break;
    case "rank":
      if (load == true) {
        // If we are loading an answer we clear our answer list
        // and rebuild it from the saved answer.
        $("#sortable-list").empty();
        buildRankList(e["order"], data["answers"]);
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
      var max_score = 0;
      for (var x = 1; x < number_options; x++) {
        max_score = max_score + x;
      }
      max_score = max_score + Math.floor(number_options / 2);

      $("#sortable-list li").each(function(index, option) {
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

      // Disable the sortable (it may be good to allow multiple attempts)
      $("#sortable-list").sortable("disable");

      $("#feedback").append("<br />");

      $(".check-button").remove();

      // Save answer
      if (load != true) {
        saveAnswerToHashMap(current_question_uid, {
          type: "rank",
          date: Date(),
          order: order,
          correct_order: correct_order,
          score: score,
          max_score: max_score
        });
      }

      break;
    case "tf":
      var save_answer = true;

      if (load == true) {
        var save_answer = false;

        $(".tf-answer-block li").each(function(index, option) {
          if (e.answer[index] == 1) {
            //$(option).find(".tf-true").addClass("tf-active");
            $(option).addClass("tf_answer_true");
          }
        });
      }

      var answers = [];
      var correct = [];
      var n_correct = 0;
      // True / False answers default to false if not selected

      $(".tf-answer-block li").each(function(index, option) {
        feedback = option.getAttribute("data-feedback");
        console.log(feedback);

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

      $(".tf-answer-block")
        .removeClass("allow-hover")
        .find("*")
        .each(function(index, e) {
          $(e).off();
        });

      if (save_answer == true) {
        saveAnswerToHashMap(current_question_uid, {
          type: "tf",
          date: Date(),
          answer: answers,
          correct: correct,
          n_correct: n_correct
        });
      }

      $(".check-button").remove();

      break;
  }

  // Remove unnecesary link tags
  $(".answer-option-link")
    .contents()
    .unwrap();

  $("#feedback").prepend(data["feedback"]);
  $("#feedback").append("<br />");

  if (data["external"] !== undefined) {
    $("#feedback").append("<br />");
    $("#feedback").append("<p>" + data["external"] + "</p>");
  }

  if (rebuild_score_list_on_answer) {
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
  if (load == true) {
    target_id = e["target_id"];
    save_answer = false;
    question_number = e["question_number"];
  } else {
    save_answer = true;
    target_id = e.currentTarget.getAttribute("id");
    question_number = e.currentTarget.getAttribute("data-question-number");
  }

  // Add the "correct" class to all answers that are correct
  $("#question-" + question_number + "-answers > .1").addClass("correct");

  // Check if the selected answer is correct
  if ($("#" + target_id).hasClass("1")) {
    answer = "correct";
  } else {
    // If not we mark it as incorrect
    $("#" + target_id).addClass("incorrect");
    answer = "incorrect";
  }

  // Remove the click events from the answered question
  $("#question-" + question_number + "-answers")
    .removeClass("allow-hover")
    .children()
    .each(function(index, e) {
      $(e).off();
    });

  // Add search links to answers
  $(".answer-list li").each(function(ind) {
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
            class: "imaios-answer answer-link"
          })
          .text("R")
      )
      .append(
        $(document.createElement("a"))
          .attr({
            href: "https://statdx.com/search?q=" + text, // not actually used
            target: "newtab",
            class: "imaios-answer answer-link",
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
    s: save_answer
  };
}

function saveAnswerToHashMap(qid, ans) {
  if (!Array.isArray(hash_answer_map[current_question_uid])) {
    hash_answer_map[current_question_uid] = [];
  }

  hash_answer_map[current_question_uid].push(ans);

  saveAnswersToStorage();
  remote_store_synced = false;
}

function loadHelpImages(correct_answers) {
  help_image_set = new Set();

  // It works...
  correct_answers.forEach(function(option) {
    ans = $.trim(
      option
        .toLowerCase()
        .replace("tendon", "")
        .replace("muscle", "")
        .replace("left", "")
        .replace("right", "")
        .replace("the", "")
        .replace("  ", "")
    );
    if (help_image_map.hasOwnProperty(ans)) {
      help_image_map[ans].forEach(function(i) {
        help_image_set.add(i);
      });
    }
  });

  help_image_set.forEach(function(i) {
    $("#feedback").append("<img src='imagehelp/" + i + "'>");
  });
}
