async function sendMessage(message) {
    try {
        return await browser.runtime.sendMessage(message);
    }
    catch (e) {
        console.log("Calling browser runtime failed:", e);

        alert("Calling browser runtime failed. Refreshing page might help.");
    }
}

const $showOptionsButton = $("#show-options-button");
const $clipScreenShotButton = $("#clip-screenshot-button");
const $saveWholePageButton = $("#save-whole-page-button");
const $saveTabsButton = $("#save-tabs-button");

$showOptionsButton.on("click", () => browser.runtime.openOptionsPage());

$clipScreenShotButton.on("click", () => sendMessage({name: 'save-screenshot'}));

$saveWholePageButton.on("click", () => sendMessage({name: 'save-whole-page'}));

$saveTabsButton.on("click", () => sendMessage({name: 'save-tabs'}));

const $saveLinkWithNoteWrapper = $("#save-link-with-note-wrapper");
const $textNote = $("#save-link-with-note-textarea");

$textNote.on('keypress', function (event) {
    if ((event.which === 10 || event.which === 13) && event.ctrlKey) {
        saveLinkWithNote();
        return false;
    }

    return true;
});

$("#save-link-with-note-button").on("click", () => {
    $saveLinkWithNoteWrapper.show();

    $textNote[0].focus();
});

$("#cancel-button").on("click", () => {
    $saveLinkWithNoteWrapper.hide();
    $textNote.val("");

    window.close();
});

async function saveLinkWithNote() {
    const textNoteVal = $textNote.val().trim();
    let title, content;

    if (!textNoteVal) {
        title = '';
        content = '';
    }
    else {
        const match = /^(.*?)([.?!]\s|\n)/.exec(textNoteVal);

        if (match) {
            title = match[0].trim();
            content = textNoteVal.substr(title.length).trim();
        }
        else {
            title = textNoteVal;
            content = '';
        }
    }

    content = escapeHtml(content);

    const result = await sendMessage({name: 'save-link-with-note', title, content});

    if (result) {
        $textNote.val('');

        window.close();
    }
}

$("#save-button").on("click", saveLinkWithNote);

$("#show-help-button").on("click", () => {
    window.open("https://github.com/zadam/trilium/wiki/Web-clipper", '_blank');
});

function escapeHtml(string) {
    const pre = document.createElement('pre');
    const text = document.createTextNode(string);
    pre.appendChild(text);

    const htmlWithPars = pre.innerHTML.replace(/\n/g, "</p><p>");

    return '<p>' + htmlWithPars + '</p>';
}

const $connectionStatus = $("#connection-status");
const $needsConnection = $(".needs-connection");

browser.runtime.onMessage.addListener(request => {
    if (request.name === 'trilium-search-status') {
        const {triliumSearch} = request;

        let statusText = triliumSearch.status;
        let isConnected;

        if (triliumSearch.status === 'not-found') {
            statusText = `<span style="color: red">Not found</span>`;
            isConnected = false;
        }
        else if (triliumSearch.status === 'version-mismatch') {
            const whatToUpgrade = triliumSearch.extensionMajor > triliumSearch.triliumMajor ? "Trilium Notes" : "this extension";

            statusText = `<span style="color: orange">Trilium instance found, but it is not compatible with this extension version. Please update ${whatToUpgrade} to the latest version.</span>`;
            isConnected = true;
        }
        else if (triliumSearch.status === 'found-desktop') {
            statusText = `<span style="color: green">Connected on port ${triliumSearch.port}</span>`;
            isConnected = true;
        }
        else if (triliumSearch.status === 'found-server') {
            statusText = `<span style="color: green" title="Connected to ${triliumSearch.url}">Connected to the server</span>`;
            isConnected = true;
        }

        $connectionStatus.html(statusText);

        if (isConnected) {
            $needsConnection.removeAttr("disabled");
            $needsConnection.removeAttr("title");
        }
        else {
            $needsConnection.attr("disabled", "disabled");
            $needsConnection.attr("title", "This action can't be performed without active connection to Trilium.");
        }
    }
});

const $checkConnectionButton = $("#check-connection-button");

$checkConnectionButton.on("click", () => {
    browser.runtime.sendMessage({
        name: "trigger-trilium-search"
    })
});

$(() => browser.runtime.sendMessage({name: "send-trilium-search-status"}));
