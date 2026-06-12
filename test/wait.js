import test from '@momsfriendlydevco/testa';
import {execa} from 'execa';
import fs from 'node:fs/promises';
import os from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';

const app = new URL('../app.js', import.meta.url).pathname;

test('wait for a simple duration', async ()=> {
	let start = Date.now();
	let {exitCode} = await execa(app, ['100ms']);

	test.expect(exitCode).to.equal(0);
	test.expect(Date.now() - start).to.be.at.least(100);
});

test('run a command after waiting ("then" syntax)', async ()=> {
	let {stdout, exitCode} = await execa(app, ['for', '50ms', 'then', 'echo', 'hello']);

	test.expect(exitCode).to.equal(0);
	test.expect(stdout).to.match(/hello/);
});

test('run a command after waiting ("--" syntax)', async ()=> {
	let {stdout, exitCode} = await execa(app, ['50ms', '--', 'echo', 'world']);

	test.expect(exitCode).to.equal(0);
	test.expect(stdout).to.match(/world/);
});

test('pass through command exit codes', async ()=> {
	let {exitCode} = await execa(app, ['50ms', 'then', 'false'], {reject: false});

	test.expect(exitCode).to.equal(1);
});

test('wait until a PID exits', async ()=> {
	let child = execa('sleep', ['0.5']);
	let start = Date.now();
	let {exitCode} = await execa(app, ['until', String(child.pid), 'exits']);

	test.expect(exitCode).to.equal(0);
	test.expect(Date.now() - start).to.be.at.least(400);
	await child;
}).timeout('5s');

test('wait for a path to change', async t => {
	let path = `${os.tmpdir()}/wait-test-${process.pid}-${Date.now()}.txt`;
	await fs.writeFile(path, 'initial');

	t.stage('spawn watcher');
	let waiter = execa(app, ['for', 'changes', 'to', path]);

	t.stage('mutate file');
	await delay(500);
	await fs.appendFile(path, '+changed');

	t.stage('await watcher');
	let {exitCode} = await waiter;
	test.expect(exitCode).to.equal(0);

	await fs.unlink(path);
}).timeout('5s');

test('timeout with a custom exit code', async ()=> {
	let {exitCode} = await execa(app, [
		'--timeout', '150ms',
		'--timeout-as', '99',
		'load', 'above', '9999',
	], {reject: false});

	test.expect(exitCode).to.equal(99);
});

test('OR conditions resolve on the fastest branch', async ()=> {
	let start = Date.now();
	let {exitCode} = await execa(app, ['100ms', 'or', '1h']);

	test.expect(exitCode).to.equal(0);
	test.expect(Date.now() - start).to.be.below(5000);
});

test('unknown conditions exit with code 2', async ()=> {
	let {exitCode, stderr} = await execa(app, ['blarg'], {reject: false});

	test.expect(exitCode).to.equal(2);
	test.expect(stderr).to.match(/unknown condition/i);
});
