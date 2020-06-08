
export function loadCornerstone(main_element, db, images) {
    main_element.append("<div class='canvas-panel'></div>");
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
    if(!Array.isArray(images)) {
        images = [images];
    }

    load(images);

    async function load(images) {
        console.log("images", images);
        let imageIds = [];
        for(let i = 0; i < images.length; i++) {
            let data_url = images[i];
            // check stack type
            if(data_url.startsWith("data:image")) {
                imageId = "base64://" + data_url.split(",")[1];

                imageIds.push(imageId);
            } else if(data_url.startsWith("data:application/dicom")) {
                //stack = stack.split(";")[1];

                let dfile = await urltoFile(data_url, "dicom", "application/dicom");

                const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(
                    dfile
                );
                imageIds.push(imageId);
                //cornerstone.loadImage(imageId).then(function(image) {
                //    tempFunction(image);
                //});
            } else {
                console.log(window.location.href)
                let url = window.location.href.replace(/\/\#\/?$/, '') + "/" + data_url
                if(data_url.endsWith("dcm")) {
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
        cornerstone.loadAndCacheImage(imageIds[0]).then(function (image) {
            loadCornerstoneMainImage(image, stack, db);
        }).catch((err) => {
            console.log(err);
        });
    }

    if(images.length > 1) {
        $(".canvas-panel").append("<div id='image-thumbs'></div>");
        for(let id = 0; id < images.length; id++) {
            let n = id + 1;
            console.log("load thumb", id);
            let thumb = $(
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

            let image_url = images[id];

            let img;

            if(image_url.startsWith("data")) {
                // based (image) data url, just load the image directly
                if(image_url.startsWith("data:image/")) {
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
                    urltoFile(image_url, "dicom", "application/dicom").then(function (
                        dfile
                    ) {
                        // load the file using cornerstoneWADO file loader
                        const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(
                            dfile
                        );
                        cornerstone.loadAndCacheImage(imageId).then(function (image) {
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
                if(!image_url.endsWith("dicom") && !image_url.endsWith("dcm")) {
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

                    let url = "wadouri:" + image_url;
                    cornerstone.loadAndCacheImage(url).then(function (image) {
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

function loadCornerstoneMainImage(image, stack, db) {
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

    let available_tools = [
        "Pan",
        "Zoom",
        "Wwwc",
        "WwwcRegion",
        "Rotate",
        "StackScroll",
        "Magnify"
    ];
    $(".mouse-binding-select option").remove();

    available_tools.forEach(function (tool) {
        let option = "<option value=" + tool + ">" + tool + "</option>";
        $(".mouse-binding-select").append(option);
        //$("#left-mouse-dicom").append(option);
        //$("#middle-mouse-dicom").append(option);
        //$("#right-mouse-dicom").append(option);
    });
    $(".mouse-binding-select").on("change", function (e) {
        changeMouseBinding(e, db);
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

    loadPrimaryDicomInterface(db);
    loadAltDicomInterface(db);

    element.addEventListener("cornerstoneimagerendered", onImageRendered);

    //setDicomCanvasNonFullscreen(element);
    cornerstone.reset(element);
    //element.scrollIntoView(false);
    //element.scrollTo(0);

    $(element).dblclick(function () {
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
        function (e) {
            // do something here...
            e.preventDefault();
        },
        false
    );
}

function resizeHandler() {
    let element = document.getElementById("dicom-image");
    let h = window.innerHeight - $("#header").height() - 16;
    $("#dicom-image").height(h);
    cornerstone.resize(element, true);
}

async function loadPrimaryDicomInterface(db) {
    const bindings = await db.mouse_bindings.where({ mode: "0" }).toArray().catch((err) => { console.log(err); });
    bindings.forEach(function (b) {
        let sel = $("#primary-mouse-binding select[data-button=" + b.button + "]").get(
            0
        );
        sel.value = b.tool;
        //sel.dispatchEvent(new Event("change"));
    });
    registerPrimaryDicomInterface();
}

async function loadAltDicomInterface(db) {
    const bindings = await db.mouse_bindings.where({ mode: "1" }).toArray().catch((err) => { console.log(err); });
    bindings.forEach(function (b) {
        let sel = $(
            "#secondary-mouse-binding select[data-button=" + b.button + "]"
        ).get(0);
        sel.value = b.tool;
    });
}

// Called when the dicom image is loaded / rendered
function onImageRendered(e) {
    const eventData = e.detail;
    //console.log(e);

    // Update ww/wl
    $("#wc").text(Math.round(eventData.viewport.voi.windowCenter));
    $("#ww").text(Math.round(eventData.viewport.voi.windowWidth));

    // update stack data
    let stack = eventData.enabledElement.toolStateManager.toolState.stack.data[0];

    $("#total_image_number").text(stack.imageIds.length);
    $("#current_image_number").text(parseInt(stack.currentImageIdIndex) + 1);

    if(stack.imageIds.length > 1) {
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
    let new_index = evt.currentTarget.dataset.id;
    selectThumb(new_index);
}


export function registerPrimaryDicomInterface() {
    // Set mousetools based upon the selected options
    let selections = $("#primary-mouse-binding select");
    selections.each((i, option) => {
        cornerstoneTools.setToolActive(option.value, {
            mouseButtonMask: parseInt(option.dataset.button)
        });
    });
}

export function registerAltDicomInterface(e) {
    // Called when control is pressed

    // Set mousetools based upon the selected options
    let selections = $("#secondary-mouse-binding select");
    selections.each((i, option) => {
        cornerstoneTools.setToolActive(option.value, {
            mouseButtonMask: parseInt(option.dataset.button)
        });
    });
}

function changeMouseBinding(e, db) {
    let select = e.currentTarget;
    let button = select.dataset.button;
    let mode = select.dataset.mode;
    let tool = select.value;

    // Directly activate primary tools (secondary will be activated when modifier
    // key is pressed
    if(mode == "0") {
        cornerstoneTools.setToolActive(tool, { mouseButtonMask: parseInt(button) });
    }

    db.mouse_bindings.put({ button: button, mode: mode, tool: tool });
    //db.mouse_bindings.put({button: button, mode: mode, tool: tool}).then(loadPrimaryDicomInterface());
}

export function selectThumb(new_index) {
    console.log("select thumb new index", new_index);
    // There must be a better way to do this...
    let dicom_element = document.getElementById("dicom-image");
    if(dicom_element == null) {
        return;
    }
    let c = cornerstone.getEnabledElement(dicom_element);
    //   let current_index =
    //     c.toolStateManager.toolState.stack.data[0].currentImageIdIndex;
    c.toolStateManager.toolState.stack.data[0].currentImageIdIndex = new_index;
    let id = c.toolStateManager.toolState.stack.data[0].imageIds[new_index];
    console.log("select thumb id", id);
    console.log("select thumb el", dicom_element);
    cornerstone.loadImage(id).then(b => {
        cornerstone.displayImage(dicom_element, b);
    });
    //c = cornerstone.getEnabledElement(dicom_element)
}