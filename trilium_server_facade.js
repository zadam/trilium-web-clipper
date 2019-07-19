function isDevEnv() {
	const manifest = browser.runtime.getManifest();

	return manifest.name.endsWith('(dev)') >= 0;
}

class TriliumServerFacade {
	constructor() {
		this.triggerSearchForTrilium();

		// continually scan for changes (if e.g. desktop app is started after browser)
		setInterval(() => this.triggerSearchForTrilium(), 60 * 1000);
	}

	async sendTriliumSearchStatusToPopup() {
		try {
			await browser.runtime.sendMessage({
				name: "trilium-search-status",
				triliumSearch: this.triliumSearch
			});
		}
		catch (e) {} // nothing might be listening
	}

	setTriliumSearch(ts) {
		this.triliumSearch = ts;

		this.sendTriliumSearchStatusToPopup();
	}

	async triggerSearchForTrilium() {
		this.setTriliumSearch({ status: 'searching' });

		const startingPort = await this.getStartingPort();

		for (let testedPort = startingPort; testedPort < startingPort + 10; testedPort++) {
			try {
				console.debug('Trying port ' + testedPort);

				const resp = await fetch(`http://127.0.0.1:${testedPort}/api/clipper/handshake`);

				const text = await resp.text();

				console.log("Received response:", text);

				const json = JSON.parse(text);

				if (json.appName === 'trilium') {
					this.setTriliumSearch({
						status: 'found-desktop',
						port: testedPort,
						url: 'http://127.0.0.1:' + testedPort
					});

					return;
				}
			}
			catch (error) {
				// continue
			}
		}

		const {triliumServerUrl} = await browser.storage.sync.get("triliumServerUrl");
		const {authToken} = await browser.storage.sync.get("authToken");

		if (triliumServerUrl && authToken) {
			try {
				const resp = await fetch(triliumServerUrl + '/api/clipper/handshake', {
					headers: {
						Authorization: authToken
					}
				});

				const text = await resp.text();

				console.log("Received response:", text);

				const json = JSON.parse(text);

				if (json.appName === 'trilium') {
					this.setTriliumSearch({
						status: 'found-server',
						url: triliumServerUrl,
						token: authToken
					});
					return;
				}
			}
			catch (e) {
				console.log("Request to the configured server instance failed with:", e);
			}
		}

		// if all above fails it's not found
		this.setTriliumSearch({ status: 'not-found' });
	}

	async waitForTriliumSearch() {
		return new Promise((res, rej) => {
			const checkStatus = () => {
				if (this.triliumSearch.status === "searching") {
					setTimeout(checkStatus, 500);
				}
				else if (this.triliumSearch.status === 'not-found') {
					rej(new Error("Trilium instance has not been found."));
				}
				else {
					res();
				}
			};

			checkStatus();
		});
	}

	async getStartingPort() {
		const {triliumDesktopPort} = await browser.storage.sync.get("triliumDesktopPort");

		if (triliumDesktopPort) {
			return parseInt(triliumDesktopPort);
		}
		else {
			return isDevEnv() ? 37740 : 37840;
		}
	}

	async callService(method, path, body) {
		const fetchOptions = {
			method: method,
			headers: {
				'Content-Type': 'application/json'
			},
		};

		if (body) {
			fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
		}

		try {
			await this.waitForTriliumSearch();

			fetchOptions.headers.Authorization = this.triliumSearch.token || "";

			const url = this.triliumSearch.url + "/api/clipper/" + path;

			console.log(`Sending ${method} request to ${url}`);

			const response = await fetch(url, fetchOptions);

			if (!response.ok) {
				throw new Error(await response.text());
			}

			return await response.json();
		}
		catch (e) {
			console.log("Sending request to trilium failed", e);

			toast('Your request failed because we could not contact Trilium instance. Please make sure Trilium is running and is accessible.');

			return null;
		}
	}
}

window.triliumServerFacade = new TriliumServerFacade();