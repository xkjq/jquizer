
cornerstoneBase64ImageLoader.external.cornerstone = cornerstone;
cornerstoneWebImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;

cornerstoneTools.init();

function loadQuestion(n) {
  saveOpenQuestion(n);
  //question_number = Object.size(filtered_questions);
  question_number = filtered_questions.length;

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
  //qid = n_hash_map[n];
  data = getQuestionDataByNumber(n);

  question_type = data["type"];

  current_question_uid = qid;

  m = n + 1;

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
    $("<button id='flagged-button'>").click(function(qid) {
      toggleFlagged();
    })
  );

  if (flagged_questions.has(current_question_uid)) {
    $("#flagged-button").text("FLAGGED");
  } else {
    $("#flagged-button").text("NOT FLAGGED");
  }

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

  answer_block_x = 0;
  answer_block_y = 0;
  if (
    element_positions.hasOwnProperty(question_type) &&
    element_positions[question_type].hasOwnProperty("answer-block")
  ) {
    answer_block_x = element_positions[question_type]["answer-block"].x;
    answer_block_y = element_positions[question_type]["answer-block"].y;
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

  // Reposition element if saved in db

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

        $(answer_options).each(function(index, op) {
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
      mba_answers = {};

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

      var options = Object.keys(answers);

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
      is_normal = data["normal"];

      var options = Object.keys(answers);

      options.sort();

      //$("#main").append($(document.createElement("div")).attr({
      //    'id': 'answer-block',
      //}));

      //buildRankList(options, answers);
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

      //$("#sortable-list").sortable();

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

      $("#answer-block input")
        .focus()
        .on("keyup", function(e) {
          if (e.keyCode == 13) {
            $(".check-button").click();
          }
        });

      // Force focus to the input element (does this break anything?)
      $("#answer-block input").on("blur", function() {
        // unless the options menu is open
        if ($("#options, #dicom-settings-panel").is(":visible")) {
          return;
        }
        var blurEl = $(this);
        setTimeout(function() {
          blurEl.focus();
        }, 10);
      });

      break;
    case "image_answer":
      loadImage(data);

      answers = data["answers"];

      var options = Object.keys(answers);

      options.sort();

      //$("#main").append($(document.createElement("div")).attr({
      //    'id': 'answer-block',
      //}));

      //buildRankList(options, answers);
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
            $(document.createElement("input")).attr({
              //'id': "answer-input-"+option,
            })
          )
      );

      //$("#sortable-list").sortable();

      //$("#answer-block").append("<br />");

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

      $("#answer-block")
        .focus()
        .on("keyup", function(e) {
          if (e.keyCode == 13) {
            $(".check-button").click();
          }
        });

      // Force focus to the input element (does this break anything?)
      $("#answer-block input").on("blur", function() {
        // unless the options menu is open
        if ($("#options").is(":visible")) {
          return;
        }
        var blurEl = $(this);
        setTimeout(function() {
          blurEl.focus();
        }, 10);
      });

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

      var options = Object.keys(answers);

      options.sort();

      //buildRankList(options, answers);
      for (var i = 0; i < options.length; i++) {
        option = options[i];
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

      $("#main input")
        .focus()
        .on("keyup", function(e) {
          if (e.keyCode == 13) {
            $(".check-button").click();
          }
        });

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

      var options = Object.keys(answers);

      var ordered = false;

      tf =
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
            .click(function(e) {
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
        .click(function(e) {
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
  $(".previous-button").each(function(index, e) {
    $(e).click(previousQuestion);
  });

  $(".next-button").off();
  $(".next-button").each(function(index, e) {
    $(e).click(nextQuestion);
  });

  if (hash_answer_map.hasOwnProperty(qid) && auto_load_previous_answers) {
    ans = hash_answer_map[qid].slice(-1)[0];
    if (!ans.hasOwnProperty("autoload") || ans["autoload"] == true) {
      checkAnswer(ans, true);
    }
    //switch(question_type) {
    //    case "sba":
    //        checkAnswer(hash_answer_map[qid], true);
    //        break
    //}
  }

  //scrollTo(0, $("#content").position().top);

  if (fix_broken_question_formatting) {
    $(".btn-link").remove();
    $(".btn-xs").remove();
  }
  //MathJax.Hub.Queue(["Typeset", MathJax.Hub, "MathExample"]);
  createRemoteStoreButtonIfRequired();

  // Preload images for the next N questions
  // (N = preload_images value)
  x = 1;
  while (x <= preload_images) {
    data = getQuestionDataByNumber(n + x);

    // TODO: This should be rewritten
    if (typeof data !== "undefined" && data.hasOwnProperty("images")) {
      data["images"].forEach(function(img) {
        setTimeout(function() {
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
      end(event) {
        var textEl = event.target.querySelector("p");

        textEl &&
          (textEl.textContent =
            "moved a distance of " +
            Math.sqrt(
              (Math.pow(event.pageX - event.x0, 2) +
                Math.pow(event.pageY - event.y0, 2)) |
                0
            ).toFixed(2) +
            "px");
      }
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

  question_type = questions[current_question_uid].type;

  if (!element_positions.hasOwnProperty(question_type)) {
    element_positions[question_type] = {};
  }
  if (!element_positions[question_type].hasOwnProperty(element.id)) {
    element_positions[question_type][element.id] = {};
  }

  window.element_positions[question_type][element.id] = {
    x: x,
    y: y
  };
}

function loadImage(data) {
  if (image_viewer == "cornerstone") {
    loadCornerstone(data["images"]);
  } else {
    $("#main")
      .append("<br>")
      .append(data["question"])
      .append("<br>");

    if (data["images"] != undefined) {
      data["images"].forEach(function(img) {
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
function loadCornerstone(images) {
    $("#main").append("<div class='canvas-panel'></div>");
    $(".canvas-panel").append($("<div id='dicom-image'></div>"));

    $("#dicom-image")
    .append(
        $(
            "<div id='dicom-overlay'>Image <span id='current_image_number'></span> of <span id='total_image_number'></span><br />wc: <span id='wc'></span> ww: <span id='ww'></span></div>"
        )
    )
    .append($("<span id='dicom-settings-button'>&#9881;</span>"))
    .append(
        $(`<div id='dicom-settings-panel'>
            <span id="dicom-settings-close" class="close-button"><a href="#">close</a></span>
            <h3>Image viewer settings:</h3>

            Primary
            <div id="primary-mouse-binding">
            <label for="left-mouse-dicom">Left mouse button:</label>
            <select
            id="left-mouse-dicom"
            class="mouse-binding-select"
            data-button="1"
            data-mode="0"
            >
            </select>
            <label for="middle-mouse-dicom">Middle mouse button:</label>
            <select
            id="middle-mouse-dicom"
            class="mouse-binding-select"
            data-button="4"
            data-mode="0"
            >
            </select>
            <label for="right-mouse-dicom">Right mouse button:</label>
            <select
            id="right-mouse-dicom"
            class="mouse-binding-select"
            data-button="2"
            data-mode="0"
            >
            </select>
            </div>
            <br />
            Secondary (Ctrl)
            <div id="secondary-mouse-binding">
            <label for="left-mouse-dicom-secondary">Left mouse button:</label>
            <select
            id="left-mouse-dicom-secondary"
            class="mouse-binding-select"
            data-button="1"
            data-mode="1"
            >
            </select>
            <label for="middle-mouse-dicom-secondary">Middle mouse button:</label>
            <select
            id="middle-mouse-dicom-secondary"
            class="mouse-binding-select"
            data-button="4"
            data-mode="1"
            >
            </select>
            <label for="right-mouse-dicom-secondary">Right mouse button:</label>
            <select
            id="right-mouse-dicom-secondary"
            class="mouse-binding-select"
            data-button="2"
            data-mode="1"
            >
            </select>
            </div>

        </div>`)
    );

    $("#dicom-settings-close").click(e => {
        $("#dicom-settings-panel").hide();
    });
    $("#dicom-settings-button").click(e => {
        $("#dicom-settings-panel").toggle();
    });

    // Make sure we have an array
    if (!Array.isArray(images)) {
        images = [images];
    }

    load(images);

    async function load(images) {
        console.log("images", images);
        imageIds = [];
        for (i = 0; i < images.length; i++) {
            data_url = images[i];
            // check stack type
            if (data_url.startsWith("data:image")) {
                imageId = "base64://" + data_url.split(",")[1];

                imageIds.push(imageId);
            } else if (data_url.startsWith("data:application/dicom")) {
                //stack = stack.split(";")[1];

                dfile = await urltoFile(data_url, "dicom", "application/dicom");

                const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(
                    dfile
                );
                imageIds.push(imageId);
                //cornerstone.loadImage(imageId).then(function(image) {
                    //    tempFunction(image);
        //});
            } else {
                url = window.location.href.replace(/\#$/, '')+"/"+data_url
                if (data_url.endsWith("dcm")) {
                    url = "wadouri:" + url;
                }
                imageIds.push(url);


            }
        }
        const stack = {
            currentImageIdIndex: 0,
            imageIds
        };
        //cornerstone.loadAndCacheImage(imageIds[0]).then(function(image) {
            console.log("100", imageIds);
            cornerstone.loadAndCacheImage(imageIds[0]).then(function(image) {
                loadCornerstoneMainImage(image, stack);
            });
    }

    if (images.length > 1) {
        $(".canvas-panel").append("<div id='image-thumbs'></div>");
        for (let id = 0; id < images.length; id++) {
            n = id + 1;
            console.log("load thumb", id);
            thumb = $(
                "<div class='thumb' id='thumb-" +
                    id +
                    "' data-id=" +
                    id +
                    "><span>" +
                    n +
                    "</span></div>"
            );
            $("#image-thumbs").append(thumb);
            $("#thumb-" + id).click(selectThumbClick);

            image_url = images[id];

            if (image_url.startsWith("data")) {
                // based (image) data url, just load the image directly
                if (image_url.startsWith("data:image/")) {
                    img = $("<img />", {
                        src: image_url,
                        id: "thumb-image-" + id,
                        class: "thumbnail",
                        title: "Click on the thumbnail to view and manipulate the image.",
                        draggable: "false",
                        style: "height: 100px;"
                    });

                    $("#thumb-" + id).append(img);

                    // otherwise try to load it as a dicom
                } else {
                    // convert the data url to a file
                    urltoFile(image_url, "dicom", "application/dicom").then(function(
                        dfile
                    ) {
                        // load the file using cornerstoneWADO file loader
                        const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(
                            dfile
                        );
                        cornerstone.loadAndCacheImage(imageId).then(function(image) {
                            img = $("<div></div>").get(0);
                            img.id = "thumb-image-" + id;
                            img.class = "thumbnail";
                            img.title =
                            "Click on the thumbnail to view and manipulate the image.";
                            img.draggable = "false";
                            img.style = "height: 100px; width: 100px";
                            $("#thumb-" + id).append(img);

                            const element = document.getElementById("thumb-image-" + id);
                            cornerstone.enable(element);
                            cornerstone.displayImage(element, image);
                            cornerstone.resize(element);
                        }); //.catch( function(error) {
                    });
                }
            } else {
                if (!image_url.endsWith("dicom") &&!image_url.endsWith("dcm")) {
                    img = $("<img />", {
                        src: image_url,
                        id: "thumb-image-" + id,
                        class: "thumbnail",
                        title: "Click on the thumbnail to view and manipulate the image.",
                        draggable: "false",
                        style: "height: 100px;"
                    });

                    $("#thumb-" + id).append(img);

                    // otherwise try to load it as a dicom
                } else {

                    url = "wadouri:" + image_url;
                        cornerstone.loadAndCacheImage(url).then(function(image) {
                            img = $("<div></div>").get(0);
                            img.id = "thumb-image-" + id;
                            img.class = "thumbnail";
                            img.title =
                            "Click on the thumbnail to view and manipulate the image.";
                            img.draggable = "false";
                            img.style = "height: 100px; width: 100px";
                            $("#thumb-" + id).append(img);

                            const element = document.getElementById("thumb-image-" + id);
                            cornerstone.enable(element);
                            cornerstone.displayImage(element, image);
                            cornerstone.resize(element);
                        });
                }
            }
        }
    }
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

  i = 0;
  for (n in options) {
    a = options[n];

    c = answers[a];
    if (ordered) {
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
  for (var i = 0; i < options.length; i++) {
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

function urltoFile(url, filename, mimeType) {
  return fetch(url)
    .then(function(res) {
      return res.arrayBuffer();
    })
    .then(function(buf) {
      return new File([buf], filename, { type: mimeType });
    });
}

function loadCornerstoneMainImage(image, stack) {
  // It is probably silly to do this each time we load a question
  const PanTool = cornerstoneTools.PanTool;
  const ZoomTool = cornerstoneTools.ZoomTool;
  const ZoomMouseWheelTool = cornerstoneTools.ZoomMouseWheelTool;
  const WwwcTool = cornerstoneTools.WwwcTool;
  const WwwcRegionTool = cornerstoneTools.WwwcRegionTool;
  const RotateTool = cornerstoneTools.RotateTool;
  const StackScrollTool = cornerstoneTools.StackScrollTool;
  const MagnifyTool = cornerstoneTools.MagnifyTool;

  const element = document.getElementById("dicom-image");
  cornerstone.enable(element);

  cornerstone.displayImage(element, image);

  cornerstoneTools.addStackStateManager(element, ["stack"]);
  cornerstoneTools.addToolState(element, "stack", stack);

  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(ZoomMouseWheelTool);
  cornerstoneTools.addTool(WwwcTool);
  cornerstoneTools.addTool(WwwcRegionTool);
  cornerstoneTools.addTool(RotateTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(MagnifyTool);

  available_tools = [
    "Pan",
    "Zoom",
    "Wwwc",
    "WwwcRegion",
    "Rotate",
    "StackScroll",
    "Magnify"
  ];
  $(".mouse-binding-select option").remove();

  available_tools.forEach(function(tool) {
    option = "<option value=" + tool + ">" + tool + "</option>";
    $(".mouse-binding-select").append(option);
    //$("#left-mouse-dicom").append(option);
    //$("#middle-mouse-dicom").append(option);
    //$("#right-mouse-dicom").append(option);
  });
  $(".mouse-binding-select").on("change", function(e) {
    changeMouseBinding(e);
  });

  // Set default tools
  $("#primary-mouse-binding .mouse-binding-select[data-button=1]").val("Pan");
  $("#primary-mouse-binding .mouse-binding-select[data-button=2]").val("Wwwc");
  $("#primary-mouse-binding .mouse-binding-select[data-button=4]").val("Zoom");
  //cornerstoneTools.setToolActive("Pan", { mouseButtonMask: 1 });
  cornerstoneTools.setToolActive("ZoomMouseWheel", { mouseButtonMask: 3 });
  //cornerstoneTools.setToolActive("Zoom", { mouseButtonMask: 4 });
  //cornerstoneTools.setToolActive("Wwwc", { mouseButtonMask: 2 });
  $("#secondary-mouse-binding .mouse-binding-select[data-button=1]").val(
    "Magnify"
  );
  $("#secondary-mouse-binding .mouse-binding-select[data-button=2]").val(
    "Rotate"
  );
  $("#secondary-mouse-binding .mouse-binding-select[data-button=4]").val(
    "WwwcRegion"
  );

  loadPrimaryDicomInterface();
  loadAltDicomInterface();

  element.addEventListener("cornerstoneimagerendered", onImageRendered);

  //setDicomCanvasNonFullscreen(element);
  cornerstone.reset(element);
  //element.scrollIntoView(false);
  //element.scrollTo(0);

  $(element).dblclick(function() {
    cornerstone.reset(this);
  });

  element.removeEventListener("wheel", element.wheelEventHandler);

  // Add tool selector
  //$(".canvas-panel").append(
  //  '<select class="control-overlay"><option value="pan">pan</option><option value="zoom">zoom</option><option value="rotate">rotate</option><option value="scroll" hidden="" disabled="">scroll (1/1)</option><option value="window">window ()</option><option value="abdomen" hidden="" disabled="">window = abdomen</option><option value="pulmonary" hidden="" disabled="">window = pulmonary</option><option value="brain" hidden="" disabled="">window = brain</option><option value="bone" hidden="" disabled="">window = bone</option><option value="reset">reset</option></select>'
  //);

  //$(".control-overlay")
  //  .get(0)
  //  .addEventListener("change", changeControlSelection);

  //$("#dicom-image").attr("height", "1000px");

  resizeHandler();

  window.addEventListener("resize", resizeHandler);
  element.addEventListener(
    "contextmenu",
    function(e) {
      // do something here...
      e.preventDefault();
    },
    false
  );
}

// Called when the dicom image is loaded / rendered
function onImageRendered(e) {
  const eventData = e.detail;
  //console.log(e);

  // Update ww/wl
  $("#wc").text(Math.round(eventData.viewport.voi.windowCenter));
  $("#ww").text(Math.round(eventData.viewport.voi.windowWidth));

  // update stack data
  stack = eventData.enabledElement.toolStateManager.toolState.stack.data[0];

  $("#total_image_number").text(stack.imageIds.length);
  $("#current_image_number").text(parseInt(stack.currentImageIdIndex) + 1);

  if (stack.imageIds.length > 1) {
    $(".thumb").removeClass("thumb-active");
    $("#thumb-" + stack.currentImageIdIndex).addClass("thumb-active");
  }
  //if (stack.imageIds.length > 1) {
  //  $("option[value=scroll").prop("disabled", false);
  //  $("option[value=scroll").prop("hidden", false);
  //  $("option[value=scroll").text(
  //    "scroll (" +
  //      (stack.currentImageIdIndex + 1) +
  //      "/" +
  //      stack.imageIds.length +
  //      ")"
  //  );
}

function selectThumbClick(evt) {
  console.log(evt);
  new_index = evt.target.dataset.id;
  selectThumb(new_index);
}

function selectThumb(new_index) {
  console.log("select thumb new index", new_index);
  // There must be a better way to do this...
  dicom_element = document.getElementById("dicom-image");

  if (dicom_element == null) {
    return;
  }

  c = cornerstone.getEnabledElement(dicom_element);

  current_index =
    c.toolStateManager.toolState.stack.data[0].currentImageIdIndex;

  c.toolStateManager.toolState.stack.data[0].currentImageIdIndex = new_index;
  id = c.toolStateManager.toolState.stack.data[0].imageIds[new_index];
  console.log("select thumb id", id);
  console.log("select thumb el", dicom_element);
  cornerstone.loadImage(id).then(b => {
    cornerstone.displayImage(dicom_element, b);
  });
  //c = cornerstone.getEnabledElement(dicom_element)
}

function resizeHandler() {
  var element = document.getElementById("dicom-image");
  h = window.innerHeight - $("#header").height() - 16;
  $("#dicom-image").height(h);
  cornerstone.resize(element, true);
}

async function loadPrimaryDicomInterface() {
  const bindings = await db.mouse_bindings.where({ mode: "0" }).toArray();
  console.log(bindings);
  bindings.forEach(function(b) {
    sel = $("#primary-mouse-binding select[data-button=" + b.button + "]").get(
      0
    );
    sel.value = b.tool;
    //sel.dispatchEvent(new Event("change"));
  });
  registerPrimaryDicomInterface();
}

async function loadAltDicomInterface() {
  const bindings = await db.mouse_bindings.where({ mode: "1" }).toArray();
  console.log(bindings);

  bindings.forEach(function(b) {
    sel = $(
      "#secondary-mouse-binding select[data-button=" + b.button + "]"
    ).get(0);
    sel.value = b.tool;
  });
}
function registerPrimaryDicomInterface() {
  // Set mousetools based upon the selected options
  selections = $("#primary-mouse-binding select");
  selections.each((i, option) => {
    cornerstoneTools.setToolActive(option.value, {
      mouseButtonMask: parseInt(option.dataset.button)
    });
  });
}
function registerAltDicomInterface(e) {
  // Called when control is pressed

  // Set mousetools based upon the selected options
  selections = $("#secondary-mouse-binding select");
  selections.each((i, option) => {
    cornerstoneTools.setToolActive(option.value, {
      mouseButtonMask: parseInt(option.dataset.button)
    });
  });
}

function changeMouseBinding(e) {
  select = e.currentTarget;
  button = select.dataset.button;
  mode = select.dataset.mode;
  tool = select.value;

  // Directly activate primary tools (secondary will be activated when modifier
  // key is pressed
  if (mode == "0") {
    cornerstoneTools.setToolActive(tool, { mouseButtonMask: parseInt(button) });
  }

  db.mouse_bindings.put({ button: button, mode: mode, tool: tool });
  //db.mouse_bindings.put({button: button, mode: mode, tool: tool}).then(loadPrimaryDicomInterface());
}
