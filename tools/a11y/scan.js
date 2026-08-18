/**
 * Runs axe-core against the states a reader can put the viewer in.
 *
 *   node scan.js                     every state in states.json
 *   node scan.js --id lightbox       one state
 *   node scan.js --update-expected   record the current result as the reference
 *   node scan.js --headed            watch the browser do it
 *
 * Exits 1 when a state has a violation that is not in expected.json, or more of
 * one than it records. Fewer is reported as an improvement and never fails, so
 * the reference file is only rewritten deliberately.
 *
 * States rather than pages: a flipbook is a single page whose accessibility
 * changes as it is used, and the states worth auditing (a book over the page, a
 * book filling the screen) exist only after someone has clicked something.
 *
 * axe finds around half of WCAG. The rest still needs a person with a keyboard
 * and a screen reader.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer-core');

const axeSource = fs.readFileSync(require.resolve('axe-core'), 'utf8');

const dir = __dirname;
const root = path.join(dir, '..', '..');
const site = path.join(root, 'demo-dist');
const config = JSON.parse(fs.readFileSync(path.join(dir, 'states.json'), 'utf8'));
const expectedFile = path.join(dir, 'expected.json');
const reportDir = path.join(dir, 'reports');

const args = process.argv.slice(2);
const update = args.includes('--update-expected');
const headed = args.includes('--headed');
const onlyId = args.includes('--id') ? args[args.indexOf('--id') + 1] : null;

const TYPES = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.css': 'text/css',
	'.pdf': 'application/pdf',
	'.mp3': 'audio/mpeg',
	'.json': 'application/json',
};

/** The built demo, served from memory of the filesystem. No dev server to start. */
function serve() {
	const server = http.createServer((req, res) => {
		const asked = decodeURIComponent(req.url.split('?')[0]);
		const file = path.join(site, asked === '/' ? 'index.html' : asked);

		if (!file.startsWith(site) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
			res.writeHead(404).end('not found');
			return;
		}

		res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
		fs.createReadStream(file).pipe(res);
	});

	return new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
	});
}

async function scanState(browser, state, port) {
	const context = await browser.createBrowserContext();
	const tab = await context.newPage();
	const viewport = state.viewport || { width: 1280, height: 900 };
	await tab.setViewport(viewport);

	try {
		const url = `http://127.0.0.1:${port}/` + (state.query ? '?' + state.query : '');
		await tab.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
		// The first page has to be painted before the book is what it will be.
		await tab.waitForSelector('.fv-toolbar', { timeout: 20000 });
		await new Promise((r) => setTimeout(r, 1200));

		for (const step of state.steps || []) {
			if (step.click) {
				await tab.waitForSelector(step.click, { timeout: 10000 });
				// A real click, so the browser grants what a gesture unlocks.
				await tab.click(step.click);
			}
			if (step.type) {
				await tab.keyboard.type(step.type, { delay: 20 });
			}
			if (step.wait) {
				await new Promise((r) => setTimeout(r, step.wait));
			}
		}

		await tab.evaluate(axeSource);
		const result = await tab.evaluate(async (tags) => {
			return await window.axe.run(document, {
				runOnly: { type: 'tag', values: tags },
				resultTypes: ['violations', 'incomplete'],
				iframes: false,
			});
		}, config.tags);

		return result;
	} finally {
		await context.close();
	}
}

/** Violations as { ruleId: number of nodes }, which is what the reference holds. */
function counts(result) {
	const out = {};
	for (const v of result.violations) {
		out[v.id] = (out[v.id] || 0) + v.nodes.length;
	}
	return out;
}

function detail(result, ruleId) {
	const v = result.violations.find((x) => x.id === ruleId);
	if (!v) return '';
	const target = v.nodes.length ? String(v.nodes[0].target[0]) : '';
	return `${v.impact || 'unknown'}, first at ${target}`;
}

(async () => {
	const chrome = process.env.CHROME_PATH || config.chrome;
	if (!chrome || !fs.existsSync(chrome)) {
		console.error('No browser found. Set CHROME_PATH, or fix "chrome" in states.json.');
		process.exit(2);
	}
	if (!fs.existsSync(path.join(site, 'index.html'))) {
		console.error('demo-dist is missing. Run npm run build:demo first.');
		process.exit(2);
	}

	fs.mkdirSync(reportDir, { recursive: true });
	const expected = fs.existsSync(expectedFile) ? JSON.parse(fs.readFileSync(expectedFile, 'utf8')) : {};

	const states = config.states.filter((s) => !onlyId || s.id === onlyId);
	if (!states.length) {
		console.error(onlyId ? `No state with id "${onlyId}".` : 'states.json lists no state.');
		process.exit(2);
	}

	const { server, port } = await serve();
	const browser = await puppeteer.launch({
		executablePath: chrome,
		headless: headed ? false : 'new',
		args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
	});

	const summary = {};
	const regressions = [];
	const improvements = [];

	try {
		for (const state of states) {
			process.stdout.write(state.id.padEnd(14));

			let result;
			try {
				result = await scanState(browser, state, port);
			} catch (e) {
				console.log('FAILED  ' + e.message);
				regressions.push(`${state.id}: could not be scanned (${e.message})`);
				continue;
			}

			const found = counts(result);
			const was = expected[state.id] || {};
			summary[state.id] = found;
			fs.writeFileSync(
				path.join(reportDir, state.id + '.json'),
				JSON.stringify(result, null, '\t'),
			);

			for (const [rule, count] of Object.entries(found)) {
				const before = was[rule] || 0;
				if (count > before) {
					regressions.push(`${state.id}: ${rule} on ${count} nodes, was ${before} (${detail(result, rule)})`);
				}
			}
			for (const [rule, before] of Object.entries(was)) {
				const now = found[rule] || 0;
				if (now < before) improvements.push(`${state.id}: ${rule} on ${now} nodes, was ${before}`);
			}

			const total = Object.values(found).reduce((a, b) => a + b, 0);
			console.log(total === 0 ? 'clean' : `${total} node${total === 1 ? '' : 's'} over ${Object.keys(found).length} rule${Object.keys(found).length === 1 ? '' : 's'}`);
		}
	} finally {
		await browser.close();
		server.close();
	}

	fs.writeFileSync(path.join(reportDir, 'summary.json'), JSON.stringify(summary, null, '\t'));

	if (update) {
		fs.writeFileSync(expectedFile, JSON.stringify(summary, null, '\t') + '\n');
		console.log('\nexpected.json rewritten.');
		process.exit(0);
	}

	for (const line of improvements) console.log('improved  ' + line);
	if (improvements.length) console.log('Run --update-expected to record these.');

	if (regressions.length) {
		console.error('\n' + regressions.length + ' regression' + (regressions.length === 1 ? '' : 's') + ':');
		for (const line of regressions) console.error('  ' + line);
		process.exit(1);
	}

	console.log('\nNo new violations.');
})();
