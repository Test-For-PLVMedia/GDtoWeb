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

    updateMessage('Processing...');

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
    console.log(entries);
    if (entries.length) {
        // Get HTML file from entries
        var html = entries.filter(obj => {
            return obj.filename.endsWith(".html");
        });

        // Get data in HTML file
        const text = await html[0].getData( new zip.TextWriter(), { onprogress: (index, max) => {} });

        // Get images
        var imageList = entries.filter(obj => {
            return obj.filename.includes("images");
        });

        // Get image blobs
        var imgs = [];
        for (let i = 0; i < imageList.length; i++) {
            const img = imageList[i];
            imgs.push({
                filename: img.filename, 
                content: await img.getData( new zip.BlobWriter(), { onprogress: (index, max) => {} })
            });
        };
        
        // Send to be processed
        processFile(text, imgs);
    }

    // close the ZipReader
    await reader.close();
}

var processFile = function(file, imgs = null) {
    console.log("=================================")
    console.log("Begin Processing File")
    console.log("=================================")
    // console.log(file);
    
    var turndownService = new TurndownService()

    var parser = new DOMParser();
    var doc = parser.parseFromString(file, 'text/html');
    
    console.log('Got document:', doc);
    
    // Get settings
    var settings = getSettings(doc);
    // settings.exclude : str[]
    //      excludes section. str is id of section(s) to be excluded.
    // settings.index : str
    //      "main page" -> index.md

    // Set up array of objects. {section, text}
    var mdStore = [];

    // Fix links
    const linkLUT = {};
    const h1s = doc.getElementsByTagName("h1");
    for (let i = 0; i < h1s.length; i++) {
        const e = h1s[i];
        linkLUT[e.id] = e.id;
    }

    var linksDone = false;
    var linksStartElement = null;
    while (!linksDone) {
        var currentSection = findUntilNext(doc, linksStartElement);
        
        var sectionID = linksStartElement == null ? 'index' : linksStartElement.id;

        const lowerHeadings = currentSection.section.querySelectorAll("h2, h3, h4, h5, h6");
        for (let i = 0; i < lowerHeadings.length; i++) {
            const e = lowerHeadings[i];
            // This is mostly a guess at the actual regex, but I think it'll work? mostly? 
            // see: https://github.com/jekyll/jekyll/blob/6855200ebda6c0e33f487da69e4e02ec3d8286b7/lib/jekyll/readers/data_reader.rb#L74
            linkLUT[e.id] = sectionID + "#" + 
                e.querySelector('span').textContent.trim().replaceAll(/[^\w\s-]+|(?<=^|\b\s)\s+(?=$|\s?\b)/g, "").replaceAll(/\s/g, '-').toLowerCase(); 
        };

        linksStartElement = currentSection.nextStartingNode;

        if (!currentSection.nextStartingNode){
            linksDone=true;
        };
    };

    console.log(linkLUT);

    const allLinks = Array.from(doc.getElementsByTagName("a"));
    for (let i = 0; i < allLinks.length; i++) {
        const link = allLinks[i];
        if (!link.getAttribute('href')){
            // pass
        }
        else if (Object.keys(linkLUT).includes(link.getAttribute('href').replace('#', ''))){
            link.setAttribute('href', linkLUT[link.getAttribute('href').replace('#', '')]);
        }
    }
    
    // Find all sections
    var done = false;
    var startElement = null;
    while (!done) {
        var currentSection = findUntilNext(doc, startElement);
        
        var markdown = turndownService.turndown(currentSection.section);
        var sectionID = startElement == null ? 'start' : startElement.id;

        if (markdown.trim() !== "" && !settings.exclude.includes(sectionID)) {
            mdStore.push({section: sectionID, content: markdown})
        };

        startElement = currentSection.nextStartingNode;

        if (!currentSection.nextStartingNode){
            done=true;
        };
    };

    // TODO: Build Index Page
    var indexPage = buildIndexPage(doc, settings.index, linkLUT, settings.exclude);
    mdStore.push({section: "index", content: indexPage});
    
    console.log("Got these markdown files:", mdStore);

    writeOutToZip(mdStore, imgs);
}

var buildIndexPage = function (doc, index, linkLUT, exclude) {
    // Format: 
    // Intro (hey welcome to media :D)
    // [index page] as linked on actual doc
    // Custom TOC
    var indexDocument = document.implementation.createHTMLDocument("");
    var turndownService = new TurndownService()

    // Intro (TODO: Make decent)
    const topTitle = document.createElement("h1");
    topTitle.innerText = "The PLV Media Manual";
    const topSubtitle = document.createElement("h1");
    topSubtitle.innerText = "Ethan Harvey";
    const para = document.createElement("p");
    para.innerText = "Welcome to the PLV Media Manual, a guide to all things media!"
    indexDocument.body.appendChild(topTitle);
    indexDocument.body.appendChild(topSubtitle);
    indexDocument.body.appendChild(para);

    // [Index Page] - if exists.
    var section = null;
    if (index) { section = findUntilNext(doc, doc.getElementById(index)).section.body; } 
    if (section) { indexDocument.body.append(section); };

    // Make and append TOC
    const TOCTitle = document.createElement("h2");
    TOCTitle.innerText = "Table of Contents (Headers)";
    indexDocument.body.append(TOCTitle);

    const tocList = document.createElement("ul");

    const h1s = doc.getElementsByTagName("h1");
    for (let i = 0; i < h1s.length; i++) {
        const e = h1s[i];
        var link = e.id;
        if (link && !exclude.includes(link)){
            // Create with valid link
            var title = e.querySelector('span').innerText;
            if (title.trim() !== ''){
                const li = document.createElement("li");
                const a = document.createElement("a");
                a.setAttribute('href', linkLUT[link]);
                a.innerText = title;
                li.appendChild(a);
                tocList.appendChild(li);
            }
        }
    };

    indexDocument.body.appendChild(tocList);
    var markdown = turndownService.turndown(indexDocument);

    return markdown;
};

var findUntilNext = function(doc, startNode, headerLevel = 'h1'){
    var allElements = doc.body.children;
    
    var index = null;
    if (startNode) {
        index = Array.from(allElements).indexOf(startNode);
        
        if (index == null || index == -1) {
            // Something has gone wrong.
            console.error('Something went wrong. Check findUntilNext()');
            return null;
        }
    }
    else {
        index = -1;
    }

    // Iterate through document structure, adding to new/fake document along the way.
    var currentMiniDoc = document.implementation.createHTMLDocument("");
    if (startNode) { currentMiniDoc.body.appendChild(startNode.cloneNode(true)); } // Include first tag
    for (let i = index + 1 /* +1 so that we don't end on self */; i < allElements.length; i++) {
        const e = allElements[i];

        // Iterate until you find tag
        if (e.tagName.toLowerCase() == headerLevel.toLowerCase()){
            return {section: currentMiniDoc, nextStartingNode: allElements[i]};
        }

        currentMiniDoc.body.appendChild(e.cloneNode(true));
    }
    // Process finished
    return {section: currentMiniDoc, nextStartingNode: null};
}

var findHeaderWithText = function(headers, text){
    for (let i = 0; i < headers.length; i++) {
        const e = headers[i];
        if (e.innerHTML.includes(text)){
            return e;
        }
    }
    return null;
}

var getSettings = function(doc) {
    var settings = {};
    settings.exclude = [];
    settings.index = '';
    // Get all h1's
    const h1s = doc.getElementsByTagName("h1");

    // Find header
    const settingsHeader = findHeaderWithText(h1s, '[Formatting]');

    // If found, process
    if (settingsHeader) {
        var section = findUntilNext(doc, settingsHeader).section;
        var subHeaders = section.getElementsByTagName('h2');

        // Get Excluded Sections
        var excludeSection = findUntilNext(section, findHeaderWithText(subHeaders, '[Exclude]'), 'h2').section.body;
        excludeSection.firstChild.remove(); // remove header
        for (let i = 0; i < excludeSection.children.length; i++) {
            const e = excludeSection.children[i];
            // Get setion id's
            settings.exclude.push($(e).find('a').attr('href').replace('#', ''));
        }

        var indexSection = findUntilNext(section, findHeaderWithText(subHeaders, '[Index]'), 'h2').section.body;
        indexSection.firstChild.remove();
        settings.index = $(indexSection.firstChild).find('a').attr('href').replace('#', '');

        console.log('Settings:', settings);
        return settings;
    } 
    else {
        return settings;
    }
}

var writeOutToZip = async function(markdown, imgs = null){
    // TODO: More Processing
    
    const blobWriter = new zip.BlobWriter("application/zip");
    const writer = new zip.ZipWriter(blobWriter);
    
    // Add markdown files
    for (let i = 0; i < markdown.length; i++) {
        const e = markdown[i];
        
        // use a TextReader to read the String to add
        await writer.add(e.section + ".md", new zip.TextReader(e.content));
    }

    // Add images
    // Probably a TERRIBLY inefficent way of doing this... oh well, it's good enough for government work.
    if (imgs){
        for (let i = 0; i < imgs.length; i++) {
            const e = imgs[i];
            await writer.add(e.filename, new zip.BlobReader(e.content));
        };
    };

    // close the ZipReader
    await writer.close();

    // get the zip file as a Blob
    const blob = blobWriter.getData();
    
    saveAs(blob, "markdown-out.zip");
    updateMessage('Finished! Downloading zip file...');
}

var updateMessage = function(msg){
    $('#output')[0].innerText = msg;
};