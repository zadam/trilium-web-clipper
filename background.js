// Keyboard shortcuts
chrome.commands.onCommand.addListener(async function (command) {
    if(command=="saveSelection") {
        await saveSelection();
    } else if (command == "saveWholePage") {
        await saveWholePage();
    } else if (command == "saveScreenshot") {
        const activeTab = await getActiveTab();
        await saveScreenshot(activeTab);
    } else {
        console.log("Unrecognized command", command);
    }

});

function cropImage(newArea, dataUrl) {
	return new Promise((resolve, reject) => {
		const img = new Image();

		img.onload = function () {
			const canvas = document.createElement('canvas');
			canvas.width = newArea.width;
			canvas.height = newArea.height;

			const ctx = canvas.getContext('2d');

			ctx.drawImage(img, newArea.x, newArea.y, newArea.width, newArea.height, 0, 0, newArea.width, newArea.height);

			resolve(canvas.toDataURL());
		};

		img.src = dataUrl;
	});
}

async function takeScreenshot(cropRect) {
	const activeTab = await getActiveTab();

	const zoom = await browser.tabs.getZoom(activeTab.id);
	const newArea = Object.assign({}, cropRect);
	newArea.x *= zoom;
	newArea.y *= zoom;
	newArea.width *= zoom;
	newArea.height *= zoom;

	const dataUrl = await browser.tabs.captureVisibleTab(null, { format: 'png' });

	return await cropImage(newArea, dataUrl);
}

browser.runtime.onInstalled.addListener(() => {
	if (isDevEnv()) {
		browser.browserAction.setIcon({
			path: 'icons/32-dev.png',
		});
	}
});

browser.contextMenus.create({
	id: "trilium-save-selection",
	title: "Save selection to Trilium",
	contexts: ["selection"]
});

browser.contextMenus.create({
	id: "trilium-save-screenshot",
	title: "Clip screenshot to Trilium",
	contexts: ["page"]
});

browser.contextMenus.create({
	id: "trilium-save-page",
	title: "Save whole page to Trilium",
	contexts: ["page"]
});

browser.contextMenus.create({
	id: "trilium-save-link",
	title: "Save link to Trilium",
	contexts: ["link"]
});

browser.contextMenus.create({
	id: "trilium-save-image",
	title: "Save image to Trilium",
	contexts: ["image"]
});

async function getActiveTab() {
	const tabs = await browser.tabs.query({
		active: true,
		currentWindow: true
	});

	return tabs[0];
}

async function sendMessageToActiveTab(message) {
	const activeTab = await getActiveTab();

	if (!activeTab) {
		throw new Error("No active tab.");
	}

	try {
		return await browser.tabs.sendMessage(activeTab.id, message);
	}
	catch (e) {
		console.error("Sending message to active tab failed, you might need to refresh the page after updating the extension.", e);
	}
}

function toast(message, noteId = null) {
	sendMessageToActiveTab({
		name: 'toast',
		message: message,
		noteId: noteId
	});
}

function blob2base64(blob) {
	return new Promise(resolve => {
		const reader = new FileReader();
		reader.onloadend = function() {
			resolve(reader.result);
		};
		reader.readAsDataURL(blob);
	});
}

async function fetchImage(url) {
	const resp = await fetch(url);
	const blob = await resp.blob();

	return await blob2base64(blob);
}

async function postProcessImage(image) {
	if (image.src.startsWith("data:image/")) {
		image.dataUrl = image.src;
		image.src = "inline." + image.src.substr(11, 3); // this should extract file type - png/jpg
	}
	else {
		try {
			image.dataUrl = await fetchImage(image.src, image);
		}
		catch (e) {
			console.log(`Cannot fetch image from ${image.src}`);
		}
	}
}

async function postProcessImages(resp) {
	if (resp.images) {
		for (const image of resp.images) {
			await postProcessImage(image);
		}
	}
}

async function saveSelection() {
	const payload = await sendMessageToActiveTab({name: 'trilium-save-selection'});

	await postProcessImages(payload);

	const resp = await triliumServerFacade.callService('POST', 'clippings', payload);

	if (!resp) {
		return;
	}

	toast("Selection has been saved to Trilium.", resp.noteId);
}

async function getImagePayloadFromSrc(src, pageUrl) {
	const image = {
		imageId: randomString(20),
		src: src
	};

	await postProcessImage(image);

	const activeTab = await getActiveTab();

	return {
		title: activeTab.title,
		content: `<img src="${image.imageId}">`,
		images: [image],
		pageUrl: pageUrl
	};
}

async function saveScreenshot(pageUrl) {
	const cropRect = await sendMessageToActiveTab({name: 'trilium-save-screenshot'});

	const src = await takeScreenshot(cropRect);

	const payload = await getImagePayloadFromSrc(src, pageUrl);

	const resp = await triliumServerFacade.callService("POST", "clippings", payload);

	if (!resp) {
		return;
	}

	toast("Screenshot has been saved to Trilium.", resp.noteId);
}

async function saveImage(srcUrl, pageUrl) {
	const payload = await getImagePayloadFromSrc(srcUrl, pageUrl);

	const resp = await triliumServerFacade.callService("POST", "clippings", payload);

	if (!resp) {
		return;
	}

	toast("Image has been saved to Trilium.", resp.noteId);
}

async function saveWholePage() {
	const payload = await sendMessageToActiveTab({name: 'trilium-save-page'});

	await postProcessImages(payload);

	const resp = await triliumServerFacade.callService('POST', 'notes', payload);

	if (!resp) {
		return;
	}

	toast("Page has been saved to Trilium.", resp.noteId);
}

async function saveNote(title, content) {
	const resp = await triliumServerFacade.callService('POST', 'notes', {
		title: title,
		content: content,
		clipType: 'note'
	});

	if (!resp) {
		return false;
	}

	toast("Note has been saved to Trilium.", resp.noteId);

	return true;
}

browser.contextMenus.onClicked.addListener(async function(info, tab) {
	if (info.menuItemId === 'trilium-save-selection') {
		await saveSelection();
	}
	else if (info.menuItemId === 'trilium-save-screenshot') {
		await saveScreenshot(info.pageUrl);
	}
	else if (info.menuItemId === 'trilium-save-image') {
		await saveImage(info.srcUrl, info.pageUrl);
	}
	else if (info.menuItemId === 'trilium-save-link') {
		const link = document.createElement("a");
		link.href = info.linkUrl;
		// linkText might be available only in firefox
		link.appendChild(document.createTextNode(info.linkText || info.linkUrl));

		const activeTab = await getActiveTab();

		const resp = await triliumServerFacade.callService('POST', 'clippings', {
			title: activeTab.title,
			content: link.outerHTML,
			pageUrl: info.pageUrl
		});

		if (!resp) {
			return;
		}

		toast("Link has been saved to Trilium.", resp.noteId);
	}
	else if (info.menuItemId === 'trilium-save-page') {
		await saveWholePage();
	}
	else {
		console.log("Unrecognized menuItemId", info.menuItemId);
	}
});

browser.runtime.onMessage.addListener(async request => {
	console.log("Received", request);

	if (request.name === 'openNoteInTrilium') {
		const resp = await triliumServerFacade.callService('POST', 'open/' + request.noteId);

		if (!resp) {
			return;
		}

		// desktop app is not available so we need to open in browser
		if (resp.result === 'open-in-browser') {
			const {triliumServerUrl} = await browser.storage.sync.get("triliumServerUrl");

			if (triliumServerUrl) {
				const noteUrl = triliumServerUrl + '/#' + request.noteId;

				console.log("Opening new tab in browser", noteUrl);

				browser.tabs.create({
					url: noteUrl
				});
			}
			else {
				console.error("triliumServerUrl not found in local storage.");
			}
		}
	}
	else if (request.name === 'load-script') {
		return await browser.tabs.executeScript({file: request.file});
	}
	else if (request.name === 'save-screenshot') {
		return await saveScreenshot();
	}
	else if (request.name === 'save-whole-page') {
		return await saveWholePage();
	}
	else if (request.name === 'save-note') {
		return await saveNote(request.title, request.content);
	}
	else if (request.name === 'trigger-trilium-search') {
		triliumServerFacade.triggerSearchForTrilium();
	}
	else if (request.name === 'send-trilium-search-status') {
		triliumServerFacade.sendTriliumSearchStatusToPopup();
	}
});