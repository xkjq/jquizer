var reader;
var progress;

function abortRead() {
    reader.abort();
}

function errorHandler(evt) {
    switch(evt.target.error.code) {
        case evt.target.error.NOT_FOUND_ERR:
            toastr.warning('File not found!');
            break;
        case evt.target.error.NOT_READABLE_ERR:
            toastr.warning('Unable to read file');
            break;
        case evt.target.error.ABORT_ERR:
            break;
        default:
            toastr.warning('An error occurred reading this file.');
    };
}

function updateProgress(evt) {
    // evt is an ProgressEvent.
    if (evt.lengthComputable) {
        var percentLoaded = Math.round((evt.loaded / evt.total) * 100);
        // Increase the progress bar length.
        if (percentLoaded < 100) {
            progress.style.width = percentLoaded + '%';
            progress.textContent = percentLoaded + '%';
        }
    }
}

function handleQuestionsFileSelect(evt) {
    // Reset progress indicator on new file selection.
    progress.style.width = '0%';
    progress.textContent = '0%';

    reader = new FileReader();
    reader.onerror = errorHandler;
    reader.onprogress = updateProgress;
    reader.onabort = function(e) {
        toastr.warning('File read cancelled');
    };
    reader.onloadstart = function(e) {
        document.getElementById('progress_bar').className = 'loading';
    };
    reader.onload = function(e) {
        // Ensure that the progress bar displays 100% at the end.
        progress.style.width = '100%';
        progress.textContent = '100%';
        setTimeout("document.getElementById('progress_bar').className='';", 2000);

        try {
            data = JSON.parse(e.target.result)
                loadData(data);
                $("#filters").slideToggle("slow"); 
        } catch(SyntaxError) {
            toastr.warning("Unable to load file.");
        }

    }

    reader.readAsText(evt.target.files[0]);

}

function handleAnswersFileSelect(evt) {
    // Reset progress indicator on new file selection.
    progress.style.width = '0%';
    progress.textContent = '0%';

    reader = new FileReader();
    reader.onerror = errorHandler;
    reader.onprogress = updateProgress;
    reader.onabort = function(e) {
        toastr.warning('File read cancelled');
    };
    reader.onloadstart = function(e) {
        document.getElementById('progress_bar').className = 'loading';
    };
    reader.onload = function(e) {
        // Ensure that the progress bar displays 100% at the end.
        progress.style.width = '100%';
        progress.textContent = '100%';
        setTimeout("document.getElementById('progress_bar').className='';", 2000);

        try {
            answers = e.target.result;
            loadAnswers(answers);
            $("#filters").slideToggle("slow"); 
        } catch(SyntaxError) {
            toastr.warning("Unable to load file.");
        }

    }

    reader.readAsText(evt.target.files[0]);

}

//$(document).ready(function () {
//        document.getElementById('files').addEventListener('change', 
//                handleFileSelect, false);
//        progress = document.querySelector('.percent');
//        });

