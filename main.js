console.log("Loading Main")

// Startup
$(function() {
    // Handle "Process"
    $("#file-form").submit(function(e) {
        e.preventDefault();

        if ($("#file")[0].files[0])
            loadFileFromForm();
    });

});

var loadFileFromForm = function() {
    // TODO: Checking it's actually HTML, etc. etc. etc...
    const file = $("#file")[0].files[0];

    console.log(file);

    var fr = new FileReader();

    fr.onload = function(){
        processFile(fr.result);
    }

    fr.readAsText(file);
};

var processFile = function(file) {
    console.log(file);

    var doc = document.createElement('html');
    doc.innerHTML = file;

    console.log(doc);
}