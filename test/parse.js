import test from '@momsfriendlydevco/testa';
import {parseWaitArgs, parseTime} from '../lib/parse.js';

test('parse simple durations', ()=> {
	test.expect(parseWaitArgs(['100ms']).conditions).to.deep.equal([[{type: 'delay', ms: 100}]]);
	test.expect(parseWaitArgs(['for', '1h']).conditions).to.deep.equal([[{type: 'delay', ms: 3_600_000}]]);
	test.expect(parseWaitArgs(['5', 'minutes']).conditions).to.deep.equal([[{type: 'delay', ms: 300_000}]]); // Two-token durations
});


test('parse PID conditions', ()=> {
	test.expect(parseWaitArgs(['until', '123', 'exits']).conditions).to.deep.equal([[{type: 'pid', pid: 123}]]);
	test.expect(parseWaitArgs(['456', 'fails']).conditions).to.deep.equal([[{type: 'pid', pid: 456}]]);
	test.expect(parseWaitArgs(['789', 'stops']).conditions).to.deep.equal([[{type: 'pid', pid: 789}]]);
});


test('parse path conditions', ()=> {
	test.expect(parseWaitArgs(['path', '/tmp/x', 'changes']).conditions).to.deep.equal([[{type: 'path', path: '/tmp/x'}]]);
	test.expect(parseWaitArgs(['path', '/tmp/x', 'to', 'change']).conditions).to.deep.equal([[{type: 'path', path: '/tmp/x'}]]);
	test.expect(parseWaitArgs(['for', 'changes', 'to', '/tmp/x']).conditions).to.deep.equal([[{type: 'path', path: '/tmp/x'}]]);
});


test('parse load conditions', ()=> {
	test.expect(parseWaitArgs(['load', 'above', '2']).conditions).to.deep.equal([[{type: 'load', op: '>', value: 2}]]);
	test.expect(parseWaitArgs(['load', 'below', '0.5']).conditions).to.deep.equal([[{type: 'load', op: '<', value: 0.5}]]);
	test.expect(parseWaitArgs(['load', '<=', '1.5']).conditions).to.deep.equal([[{type: 'load', op: '<=', value: 1.5}]]);
});


test('parse AND / OR compounds', ()=> {
	test.expect(parseWaitArgs(['100ms', 'and', '200ms', 'or', '300ms']).conditions).to.deep.equal([
		[
			{type: 'delay', ms: 100},
			{type: 'delay', ms: 200},
		],
		[
			{type: 'delay', ms: 300},
		],
	]);
});


test('parse the "then" command split', ()=> {
	let {conditions, command} = parseWaitArgs(['1h', 'then', 'echo', 'hi', 'there']);
	test.expect(conditions).to.deep.equal([[{type: 'delay', ms: 3_600_000}]]);
	test.expect(command).to.deep.equal(['echo', 'hi', 'there']);
});


test('parse clock times', ()=> {
	let now = new Date('2026-06-12T12:00:00'); // A Friday, midday
	test.expect(parseTime('3pm', now).getHours()).to.equal(15);
	test.expect(parseTime('3pm', now).getDate()).to.equal(12); // Later today
	test.expect(parseTime('9am', now).getDate()).to.equal(13); // Already passed - tomorrow
	test.expect(parseTime('15:30', now).getHours()).to.equal(15);
	test.expect(parseTime('15:30', now).getMinutes()).to.equal(30);
	test.expect(parseTime('12am', now).getHours()).to.equal(0); // Midnight edge case
});


test('parse weekday names to their next occurance', ()=> {
	let now = new Date('2026-06-12T12:00:00'); // A Friday
	test.expect(parseTime('tuesday', now).getDay()).to.equal(2);
	test.expect(parseTime('tuesday', now).getDate()).to.equal(16); // Next week
	test.expect(parseTime('saturday', now).getDate()).to.equal(13); // Tomorrow
	test.expect(parseTime('friday', now).getDate()).to.equal(19); // Same weekday - a full week away
});


test('reject invalid time expressions', ()=> {
	test.expect(parseTime('99:99')).to.be.null; // Out of range hours + minutes
	test.expect(parseTime('12:60')).to.be.null; // Out of range minutes
	test.expect(parseTime('13pm')).to.be.null; // Meridian clocks only run 1-12
	test.expect(parseTime('0pm')).to.be.null;
	test.expect(parseTime('wibble')).to.be.null;
	test.expect(parseTime('5')).to.be.null; // Bare numbers must never become dates
});


test('throw on unparsable conditions', ()=> {
	test.expect(()=> parseWaitArgs(['blarg'])).to.throw(/unknown condition/i);
	test.expect(()=> parseWaitArgs(['untill', '3pm'])).to.throw(/unknown condition/i); // Typo'd "until"
	test.expect(()=> parseWaitArgs(['100sm'])).to.throw(/unknown condition/i); // Typo'd unit
	test.expect(()=> parseWaitArgs(['123', 'exists'])).to.throw(/unknown condition/i); // Typo'd PID verb
	test.expect(()=> parseWaitArgs(['until', '99:99'])).to.throw(/unknown condition/i);
});


test('throw on malformed load conditions', ()=> {
	test.expect(()=> parseWaitArgs(['load', 'wibble', '5'])).to.throw(/unknown load operator/i);
	test.expect(()=> parseWaitArgs(['load', 'above', 'banana'])).to.throw(/need a number/i);
	test.expect(()=> parseWaitArgs(['load'])).to.throw(/unknown load operator/i);
});


test('throw on structural errors', ()=> {
	test.expect(()=> parseWaitArgs([])).to.throw(/no wait conditions/i);
	test.expect(()=> parseWaitArgs(['100ms', 'and'])).to.throw(/trailing/i);
	test.expect(()=> parseWaitArgs(['100ms', 'or'])).to.throw(/trailing/i);
});
