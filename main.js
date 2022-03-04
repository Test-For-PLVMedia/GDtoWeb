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
    // Get file
    const file = $("#file")[0].files[0];
    console.log(file);

    // Create Reader
    var fr = new FileReader();

    // Set Reader's OnLoad
    fr.onload = function(){
        if (file.type == "text/html") {
            processFile(fr.result);
        }
        else {
            const blob = new Blob([fr.result], {type: file.type});
            getHTMLFromBlobAndProcess(blob);
        }
    }

    if (file.type == "text/html") {
        fr.readAsText(file);
    }
    else {
        // TODO: Only elif ZIP, otherwise err
        fr.readAsArrayBuffer(file);
    }
};

var getHTMLFromBlobAndProcess = async function(blob) {
    // Read Blob
    const reader = new zip.ZipReader(new zip.BlobReader(blob));

    // Get entries
    const entries = await reader.getEntries();
    if (entries.length) {
        // Get HTML file from entries
        var html = entries.filter(obj => {
            return obj.filename.endsWith(".html")
        })

        // Get data in HTML file
        const text = await html[0].getData(
            new zip.TextWriter(),
            { 
                onprogress: (index, max) => {}
            }
        );
        
        // Send to be processed
        processFile(text);
    }

    // close the ZipReader
    await reader.close();
}

var processFile = function(file) {
    console.log("=================================")
    console.log("Begin Processing File")
    console.log("=================================")
    console.log(file);
    

    var parser = new DOMParser();
    var doc = parser.parseFromString(file, 'text/html');

    console.log(doc);

    var turndownService = new TurndownService()
    var markdown = turndownService.turndown(doc.body)

    console.log(markdown);
    // TODO: More Processing
    downloadAsTextFile("file", markdown)
}

// TODO: Remove
// Temp Function
var downloadAsTextFile = function (filename, text) {
    var pom = document.createElement('a');
    pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    pom.setAttribute('download', filename);

    if (document.createEvent) {
        var event = document.createEvent('MouseEvents');
        event.initEvent('click', true, true);
        pom.dispatchEvent(event);
    }
    else {
        pom.click();
    }
}
