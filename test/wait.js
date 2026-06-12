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


test('AND conditions wait for the slowest', ()=> {
	let start = Date.now();
	return execa(app, ['50ms', 'and', '150ms'])
		.then(({exitCode})=> {
			test.expect(exitCode).to.equal(0);
			test.expect(Date.now() - start).to.be.at.least(150);
		});
});


test('repeat the wait + command cycle', ()=> {
	let start = Date.now();
	return execa(app, ['--repeat', '3', '30ms', 'then', 'echo', 'tick'])
		.then(({stdout, exitCode})=> {
			test.expect(exitCode).to.equal(0);
			test.expect(stdout.split('\n')).to.deep.equal(['tick', 'tick', 'tick']);
			test.expect(Date.now() - start).to.be.at.least(90);
		});
});


test('inverted conditions flip the match', ()=> {
	// Load can never be above 9999 so inverting should resolve immediately
	return execa(app, ['--invert', 'load', 'above', '9999'])
		.then(({exitCode})=> test.expect(exitCode).to.equal(0));
});


test('display a tick-list of conditions by default', ()=>
	execa(app, ['100ms'])
		.then(({stderr})=> {
			test.expect(stderr).to.match(/○ Wait 100ms/); // Pending at first...
			test.expect(stderr).to.match(/remaining/); // ...with a countdown...
			test.expect(stderr).to.match(/✔ Wait 100ms/); // ...then ticked once satisfied
		})
);


test('display OR group separators', ()=>
	execa(app, ['50ms', 'or', '1h'])
		.then(({stderr})=> {
			test.expect(stderr).to.match(/-- OR --/);
			test.expect(stderr).to.match(/✔ Wait 50ms/);
		})
);


test('display timed out conditions', ()=>
	execa(app, ['--timeout', '100ms', 'load', 'above', '9999'], {reject: false})
		.then(({stderr})=> {
			test.expect(stderr).to.match(/○ Wait for load > 9999 \(currently [\d.]+\)/);
			test.expect(stderr).to.match(/✘ Wait for load > 9999 \(timed out\)/);
		})
);


test('suppress the display with --quiet / -q', ()=>
	Promise.all([
		execa(app, ['--quiet', '50ms']),
		execa(app, ['-q', '50ms']),
	]).then(results => results.forEach(({stderr})=>
		test.expect(stderr).to.equal('')
	))
);


test('unknown conditions exit with code 2', ()=>
	execa(app, ['blarg'], {reject: false})
		.then(({exitCode, stderr})=> {
			test.expect(exitCode).to.equal(2);
			test.expect(stderr).to.match(/unknown condition/i);
		})
);


test('typo`d / unparsable conditions exit with code 2', ()=>
	Promise.all([
		execa(app, ['untill', '3pm'], {reject: false}), // Typo'd "until"
		execa(app, ['100sm'], {reject: false}), // Typo'd unit
		execa(app, ['until', '99:99'], {reject: false}), // Impossible clock time
		execa(app, ['123', 'exists'], {reject: false}), // Typo'd PID verb
	]).then(results => results.forEach(({exitCode, stderr})=> {
		test.expect(exitCode).to.equal(2);
		test.expect(stderr).to.match(/unknown condition/i);
	}))
);


test('reject calls with no conditions', ()=>
	execa(app, [], {reject: false})
		.then(({exitCode, stderr})=> {
			test.expect(exitCode).to.equal(2);
			test.expect(stderr).to.match(/no wait conditions/i);
		})
);


test('reject trailing AND / OR operands', ()=>
	execa(app, ['100ms', 'and'], {reject: false})
		.then(({exitCode, stderr})=> {
			test.expect(exitCode).to.equal(2);
			test.expect(stderr).to.match(/trailing/i);
		})
);


test('reject malformed load conditions', ()=>
	Promise.all([
		execa(app, ['load', 'wibble', '5'], {reject: false}),
		execa(app, ['load', 'above', 'banana'], {reject: false}),
	]).then(([badOp, badValue])=> {
		test.expect(badOp.exitCode).to.equal(2);
		test.expect(badOp.stderr).to.match(/unknown load operator/i);
		test.expect(badValue.exitCode).to.equal(2);
		test.expect(badValue.stderr).to.match(/need a number/i);
	})
);


test('reject invalid --timeout values', ()=>
	execa(app, ['--timeout', 'bogus', '1h'], {reject: false})
		.then(({exitCode, stderr})=> {
			test.expect(exitCode).to.equal(2);
			test.expect(stderr).to.match(/bogus/);
		})
);


test('reject invalid --repeat counts', ()=>
	Promise.all([
		execa(app, ['--repeat', 'banana', '10ms'], {reject: false}),
		execa(app, ['--repeat', '-1', '10ms'], {reject: false}),
	]).then(results => results.forEach(({exitCode, stderr})=> {
		test.expect(exitCode).to.equal(2);
		test.expect(stderr).to.match(/invalid --repeat/i);
	}))
);


test('report unrunnable commands with exit code 1', ()=>
	execa(app, ['10ms', 'then', 'wibble-command-that-does-not-exist'], {reject: false})
		.then(({exitCode, stderr})=> {
			test.expect(exitCode).to.equal(1);
			test.expect(stderr).to.match(/ENOENT/);
		})
);
