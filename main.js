const sleep = ms => new Promise(r => setTimeout(r, ms));
const percent = (p,n) => `${(p*100).toFixed(n ?? 2)}%`;

let importedLocs, importedFilename, distribution;

const loadGeoJson = new Promise(async (resolve, reject) => {
	try {
		const data = await (await fetch(`./borders.geojson`)).json();
		resolve(data);
	}catch(err) {
		reject();
	}
});

async function updateProg(text) {
	document.getElementById('progress').textContent = text;
	await sleep(0);
}

function addToDistribution(dist, code, name, continent) {
	const key = `${code}-${name}`;

	if(!dist.countries[key]) {
		dist.countries[key] = {
			code: code,
			name: name,
			continent: continent,
			count: 0,
		}
	}

	if(!dist.continents[continent]) {
		dist.continents[continent] = {
			name: continent,
			count: 0,
		}
	}

	dist.countries[key].count++;
	dist.continents[continent].count++;
}

async function processLocations() {
	show('options', false);
	updateProg('');

	if(!turf) {
		alert('Could not load polygon checker');
		return;
	}

	updateProg('Loading country data');

	const geojson = await loadGeoJson;
	if(!geojson) {
		alert('Could not load country data');
		return;
	}

	distribution = {
		count: importedLocs.customCoordinates.length,
		success: [],
		errors: [],
		countries: {},
		continents: {},
	}

	const addCC = document.getElementById('tag-cc').checked;
	const addName = document.getElementById('tag-name').checked;
	const addContinent = document.getElementById('tag-continent').checked;
	const removeExisting = document.getElementById('existing').checked;

	await updateProg(`Tagging locations: 0 / ${importedLocs.customCoordinates.length.toLocaleString()}`);

	let updateTime = performance.now();

	locloop: for(let i = 0; i < importedLocs.customCoordinates.length; i++) {
		if(performance.now() > updateTime + 1000) {
			updateTime = performance.now();
			await updateProg(`Tagging locations: ${(i+1).toLocaleString()} / ${importedLocs.customCoordinates.length.toLocaleString()}`);
		}

		const c = importedLocs.customCoordinates[i];

		if(!c.extra) {
			c.extra = {};
		}

		if(removeExisting) {
			c.extra.tags = [];
		}else if(!c.extra.tags) {
			c.extra.tags = [];
		}

		for(let p of geojson.features) {
			if(!p || !p.geometry) continue;

			const multi = p.geometry.type === 'MultiPolygon';

			const point = turf.helpers.point([c.lng, c.lat]);
			const polyCoords = p.geometry.coordinates;
			const poly = multi ? turf.helpers.multiPolygon(polyCoords) : turf.helpers.polygon(polyCoords);

			if(turf.booleanPointInPolygon(point, poly)) {
				const cc = p.properties['code'];
				const name = p.properties['name'];
				const continent = p.properties['continent'];

				if(addCC && !c.extra.tags.includes(cc)) {
					c.extra.tags.push(cc);
				}

				if(addName && !c.extra.tags.includes(name)) {
					c.extra.tags.push(name);
				}

				if(addContinent && !c.extra.tags.includes(continent)) {
					c.extra.tags.push(continent);
				}

				addToDistribution(distribution, cc, name, continent);

				distribution.success.push(c);

				continue locloop;
			}
		}

		distribution.errors.push(c);
	}

	await updateProg(`Calculating distribution...`);

	showDistributionTable(distribution);

	updateProg('');
	
	document.getElementById('failed-locs').classList.add('is-hidden');
	document.getElementById('success-message').innerText = `Successfully tagged ${distribution.success.length.toLocaleString()} locations.`;

	if(distribution.errors.length > 0) {
		document.getElementById('failed-locs').classList.remove('is-hidden');
		document.getElementById('failed-message').innerText += `${distribution.errors.length.toLocaleString()} locations could not be tagged.`;
	}
}

function sortDist(a, b) {
	if(a.count === b.count) return a.name.localeCompare(b.name);
	return b.count - a.count;
}

function showDistributionTable(dist) {
	document.querySelector('#dist tbody').innerHTML = '';

	const sortedCountries = Object.values(dist.countries).sort(sortDist);
	const sortedContinents = Object.values(dist.continents).sort(sortDist);

	for(const c of sortedCountries) {
		document.querySelector('#country-table').innerHTML += `<tr>
			<td><img class="flag" src="./flags/${c.code}.svg" width="30">${c.name}</td>
			<td>${c.count.toLocaleString()}</td>
			<td>${percent(c.count/dist.success.length)}</td>
		</tr>`
	}

	for(const c of sortedContinents) {
		document.querySelector('#continent-table').innerHTML += `<tr>
			<td>${c.name}</td>
			<td>${c.count.toLocaleString()}</td>
			<td>${percent(c.count/dist.success.length)}</td>
		</tr>`
	}

	show('dist', true);
}

function show(id, visible) {
	document.getElementById(id).classList.toggle('is-hidden', !visible);
}

function importLocs(filename, locs) {
	if(!locs.customCoordinates && locs[0] && locs[0]?.lat) {
		locs = {customCoordinates: locs};
	}

	if(!locs.customCoordinates.length) {
		alert('Could not find any locations in this file');
		return;
	}

	importedFilename = filename;
	importedLocs = locs;
	
	if(filename) {
		document.getElementById('stats').textContent = `${filename} - ${locs.customCoordinates.length.toLocaleString()} locations`;
	}else{
		document.getElementById('stats').textContent = `${locs.customCoordinates.length.toLocaleString()} locations`;
	}

	show('start', true);
}

async function inputChange(e) {
	importedLocs = undefined;
	importedFilename = undefined;
	document.getElementById('stats').textContent = '';
	show('start', false);

	const file = e.target.files[0];
	if(!file) return;

	document.getElementById('stats').textContent = 'Importing locations...';
	await sleep(0);

	const reader = new FileReader();

	reader.onload = (e) => {
		const res = JSON.parse(e.target.result);
		if(res?.customCoordinates) {
			importLocs(file.name, res);
		}
	}

	reader.readAsText(file);
}

function clickedImport() {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = 'application/json';

	input.addEventListener('change', inputChange);

	input.click();
}

function clickedStart() {
	if(!importedLocs || !importedLocs.customCoordinates || !importedLocs.customCoordinates.length) return;
	processLocations();
}

function saveSettings() {
	const settings = {};
	for(const cb of document.querySelectorAll('#options input[type=checkbox]')) {
		settings[cb.id] = cb.checked;
	}
	localStorage.setItem('settings', JSON.stringify(settings));
}

function loadSettings() {
	const data = localStorage.getItem('settings');
	if(!data) return;
	const settings = JSON.parse(data);
	for(const key in settings) {
		document.getElementById(key).checked = settings[key];
	}
}

async function downloadLocations(data, type) {
	let filename = importedFilename || data.name || 'locations';
	if(!filename.endsWith('.json')) {
		filename += '.json';
	}
	filename = filename.replace(/\.json$/, `.${type}.json`);

	const a = document.createElement('a');
	const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
	a.href = window.URL.createObjectURL(blob);
	a.download = filename;
	a.click();
}

function downloadSuccess() {
	const newData = Object.assign({}, importedLocs);
	newData.customCoordinates = distribution.success;
	downloadLocations(newData, 'tagged');
}

function downloadFailed() {
	const newData = Object.assign({}, importedLocs);
	newData.customCoordinates = distribution.errors;
	downloadLocations(newData, 'error');
}

async function copyToClipboard(data, buttonId) {
	await navigator.clipboard.writeText(JSON.stringify(data));

	document.getElementById(buttonId).value = 'Copied!';
	setTimeout(() => {
		document.getElementById(buttonId).value = 'Copy to clipboard';
	}, 1000);
}

async function copySuccess() {
	const newData = Object.assign({}, importedLocs);
	newData.customCoordinates = distribution.success;
	copyToClipboard(newData, 'success-copy');
}

async function copyFailed() {
	const newData = Object.assign({}, importedLocs);
	newData.customCoordinates = distribution.errors;
	copyToClipboard(newData, 'failed-copy');
}

async function copyCSV(entries, buttonText, buttonId) {
	const data = entries.join('\n');
	await navigator.clipboard.writeText(data);

	document.getElementById(buttonId).value = 'Copied!';
	setTimeout(() => {
		document.getElementById(buttonId).value = buttonText;
	}, 1000);
}

function csvCountries() {
	const sortedCountries = Object.values(distribution.countries).sort(sortDist);
	const data = sortedCountries.map(c => [c.code, c.name, c.count, `${(c.count/distribution.success.length*100)}%`].join('\t'));
	copyCSV(data, 'Country', 'csv-countries');
}

function csvContinents() {
	const sortedContinents = Object.values(distribution.continents).sort(sortDist);
	const data = sortedContinents.map(c => [c.name, c.count, `${(c.count/distribution.success.length*100)}%`].join('\t'));
	copyCSV(data, 'Continents', 'csv-continents');
}

document.getElementById('import').addEventListener('click', clickedImport);
document.getElementById('start').addEventListener('click', clickedStart);

document.getElementById('success-download').addEventListener('click', downloadSuccess);
document.getElementById('success-copy').addEventListener('click', copySuccess);
document.getElementById('failed-download').addEventListener('click', downloadFailed);
document.getElementById('failed-copy').addEventListener('click', copyFailed);

document.getElementById('csv-countries').addEventListener('click', csvCountries);
document.getElementById('csv-continents').addEventListener('click', csvContinents);

document.addEventListener('keyup', async (e) => {
	if(e.ctrlKey && e.key === 'v') {
		e.preventDefault();
		e.stopPropagation();
		const clip = await navigator.clipboard.readText();
		try {
			const data = JSON.parse(clip);
			importLocs(data.name, data);
		}catch(e) {}
	}
});

loadSettings();

for(const cb of document.querySelectorAll('#options input[type=checkbox]')) {
	cb.addEventListener('change', saveSettings);
}
