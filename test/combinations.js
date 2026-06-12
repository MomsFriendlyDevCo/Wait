import test from '@momsfriendlydevco/testa';
import {execa} from 'execa';
import {parseWaitArgs} from '../lib/parse.js';
import {waitFor} from '../lib/wait.js';

const app = new URL('../app.js', import.meta.url).pathname;

// Parse level {{{
test('parse chained ANDs into a single group', ()=> {
	test.expect(parseWaitArgs(['100ms', 'and', '200ms', 'and', '300ms']).conditions).to.deep.equal([[
		{type: 'delay', ms: 100},
		{type: 'delay', ms: 200},
		{type: 'delay', ms: 300},
	]]);
});


test('parse chained ORs into separate groups', ()=> {
	test.expect(parseWaitArgs(['100ms', 'or', '200ms', 'or', '300ms']).conditions).to.deep.equal([
		[{type: 'delay', ms: 100}],
		[{type: 'delay', ms: 200}],
		[{type: 'delay', ms: 300}],
	]);
});


test('parse AND as binding tighter than OR', ()=> {
	// a AND b OR c => (a AND b) OR c
	test.expect(parseWaitArgs(['1h', 'and', '2h', 'or', '3h']).conditions).to.deep.equal([
		[
			{type: 'delay', ms: 3_600_000},
			{type: 'delay', ms: 7_200_000},
		],
		[{type: 'delay', ms: 10_800_000}],
	]);

	// a OR b AND c => a OR (b AND c)
	test.expect(parseWaitArgs(['1h', 'or', '2h', 'and', '3h']).conditions).to.deep.equal([
		[{type: 'delay', ms: 3_600_000}],
		[
			{type: 'delay', ms: 7_200_000},
			{type: 'delay', ms: 10_800_000},
		],
	]);
});


test('parse operators case insensitively', ()=> {
	test.expect(parseWaitArgs(['1h', 'AND', '2h']).conditions).to.deep.equal(parseWaitArgs(['1h', 'and', '2h']).conditions);
	test.expect(parseWaitArgs(['1h', 'Or', '2h']).conditions).to.deep.equal(parseWaitArgs(['1h', 'or', '2h']).conditions);
});


test('parse mixed condition types in compounds', ()=> {
	test.expect(parseWaitArgs(['123', 'exits', 'and', 'load', 'below', '2', 'or', 'path', '/tmp/x', 'changes']).conditions).to.deep.equal([
		[
			{type: 'pid', pid: 123},
			{type: 'load', op: '<', value: 2},
		],
		[{type: 'path', path: '/tmp/x'}],
	]);
});
// }}}

// waitFor() level {{{
test('waitFor resolves AND groups at the slowest member', ()=> {
	let start = Date.now();
	return waitFor([[
		{type: 'delay', ms: 50},
		{type: 'delay', ms: 150},
	]])
		.then(satisfied => {
			test.expect(satisfied).to.be.true;
			test.expect(Date.now() - start).to.be.at.least(150);
		});
});


test('waitFor resolves OR groups at the fastest group', ()=> {
	let start = Date.now();
	return waitFor([
		[{type: 'delay', ms: 400}],
		[{type: 'delay', ms: 50}],
	])
		.then(satisfied => {
			test.expect(satisfied).to.be.true;
			test.expect(Date.now() - start).to.be.at.least(50);
			test.expect(Date.now() - start).to.be.below(400);
		});
});


test('waitFor marks individual conditions as satisfied', ()=> {
	let fast = {type: 'delay', ms: 50};
	let slow = {type: 'delay', ms: 400};
	return waitFor([[fast], [slow]])
		.then(()=> {
			test.expect(fast.satisfied).to.be.true;
			test.expect(slow.satisfied).to.be.false;
		});
});


test('waitFor races (a AND b) OR c on the faster branch', ()=> {
	let start = Date.now();
	return waitFor([
		[
			{type: 'delay', ms: 50},
			{type: 'delay', ms: 800},
		],
		[{type: 'delay', ms: 150}],
	])
		.then(satisfied => {
			test.expect(satisfied).to.be.true;
			test.expect(Date.now() - start).to.be.at.least(150);
			test.expect(Date.now() - start).to.be.below(700);
		});
});


test('waitFor times out when no group can fully satisfy', ()=> {
	let fast = {type: 'delay', ms: 50};
	let slow = {type: 'delay', ms: 600};
	let start = Date.now();
	return waitFor([[fast, slow]], {timeout: 150})
		.then(satisfied => {
			test.expect(satisfied).to.be.false;
			test.expect(Date.now() - start).to.be.below(550);
			test.expect(fast.satisfied).to.be.true; // The AND group partially resolved...
			test.expect(slow.satisfied).to.be.false; // ...but never completed
		});
});
// }}}

// End-to-end level {{{
test('e2e: a AND b OR c resolves via the fast OR branch', ()=> {
	let start = Date.now();
	return execa(app, ['1h', 'and', '2h', 'or', '100ms'])
		.then(({exitCode, stderr})=> {
			test.expect(exitCode).to.equal(0);
			test.expect(Date.now() - start).to.be.below(5000);
			test.expect(stderr).to.match(/✔ Wait 100ms/);
		});
});


test('e2e: a OR b AND c waits for the full AND group', ()=> {
	let start = Date.now();
	return execa(app, ['1h', 'or', '50ms', 'and', '200ms'])
		.then(({exitCode})=> {
			test.expect(exitCode).to.equal(0);
			test.expect(Date.now() - start).to.be.at.least(200);
			test.expect(Date.now() - start).to.be.below(5000);
		});
});


test('e2e: operators are case insensitive', ()=>
	execa(app, ['50ms', 'OR', '1h'])
		.then(({exitCode})=> test.expect(exitCode).to.equal(0))
);


test('e2e: mixed condition types combine').timeout('5s').do(()=> {
	// A PID that exits OR an hour long delay - should resolve when the PID dies
	let child = execa('sleep', ['0.3']);
	let start = Date.now();
	return execa(app, [String(child.pid), 'exits', 'or', '1h'])
		.then(({exitCode})=> {
			test.expect(exitCode).to.equal(0);
			test.expect(Date.now() - start).to.be.at.least(200);
			return child;
		});
});


test('e2e: AND requires every condition before timing out', ()=>
	execa(app, [
		'--timeout', '150ms',
		'--timeout-as', '5',
		'10ms', 'and', 'load', 'above', '9999',
	], {reject: false})
		.then(({exitCode, stderr})=> {
			test.expect(exitCode).to.equal(5);
			test.expect(stderr).to.match(/✔ Wait 10ms/); // The satisfiable half ticked...
			test.expect(stderr).to.match(/✘ Wait for load > 9999 \(timed out\)/); // ...the impossible half failed
		})
);


test('e2e: only the winning OR branch gets ticked', ()=>
	execa(app, ['50ms', 'or', '1h'])
		.then(({stderr})=> {
			test.expect(stderr).to.match(/✔ Wait 50ms/);
			test.expect(stderr).to.not.match(/✔ Wait 1h/);
		})
);
// }}}
