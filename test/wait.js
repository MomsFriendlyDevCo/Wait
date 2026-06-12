import test from '@momsfriendlydevco/testa';
import {execa} from 'execa';
import fs from 'node:fs/promises';
import os from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';

const app = new URL('../app.js', import.meta.url).pathname;

test('wait for a simple duration', ()=> {
	let start = Date.now();
	return execa(app, ['100ms'])
		.then(({exitCode})=> {
			test.expect(exitCode).to.equal(0);
			test.expect(Date.now() - start).to.be.at.least(100);
		});
});


test('run a command after waiting ("then" syntax)', ()=>
	execa(app, ['for', '50ms', 'then', 'echo', 'hello'])
		.then(({stdout, exitCode})=> {
			test.expect(exitCode).to.equal(0);
			test.expect(stdout).to.match(/hello/);
		})
);


test('run a command after waiting ("--" syntax)', ()=>
	execa(app, ['50ms', '--', 'echo', 'world'])
		.then(({stdout, exitCode})=> {
			test.expect(exitCode).to.equal(0);
			test.expect(stdout).to.match(/world/);
		})
);


test('pass through command exit codes', ()=>
	execa(app, ['50ms', 'then', 'false'], {reject: false})
		.then(({exitCode})=> test.expect(exitCode).to.equal(1))
);


test('wait until a PID exits').timeout('5s').do(()=> {
	let child = execa('sleep', ['0.5']);
	let start = Date.now();
	return execa(app, ['until', String(child.pid), 'exits'])
		.then(({exitCode})=> {
			test.expect(exitCode).to.equal(0);
			test.expect(Date.now() - start).to.be.at.least(400);
			return child;
		});
});


test('wait for a path to change').timeout('5s').do(t => {
	let path = `${os.tmpdir()}/wait-test-${process.pid}-${Date.now()}.txt`;
	let waiter;
	return fs.writeFile(path, 'initial')
		.then(()=> {
			t.stage('spawn watcher');
			waiter = execa(app, ['for', 'changes', 'to', path]);
		})
		.then(()=> delay(500))
		.then(()=> {
			t.stage('mutate file');
			return fs.appendFile(path, '+changed');
		})
		.then(()=> {
			t.stage('await watcher');
			return waiter;
		})
		.then(({exitCode})=> test.expect(exitCode).to.equal(0))
		.then(()=> fs.unlink(path));
});


test('timeout with a custom exit code', ()=>
	execa(app, [
		'--timeout', '150ms',
		'--timeout-as', '99',
		'load', 'above', '9999',
	], {reject: false})
		.then(({exitCode})=> test.expect(exitCode).to.equal(99))
);


test('OR conditions resolve on the fastest branch', ()=> {
	let start = Date.now();
	return execa(app, ['100ms', 'or', '1h'])
		.then(({exitCode})=> {
			test.expect(exitCode).to.equal(0);
			test.expect(Date.now() - start).to.be.below(5000);
		});
});


test('unknown conditions exit with code 2', ()=>
	execa(app, ['blarg'], {reject: false})
		.then(({exitCode, stderr})=> {
			test.expect(exitCode).to.equal(2);
			test.expect(stderr).to.match(/unknown condition/i);
		})
);
