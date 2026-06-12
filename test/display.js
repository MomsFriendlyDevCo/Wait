import test from '@momsfriendlydevco/testa';
import {describeCondition, formatDuration} from '../lib/display.js';

test('format durations compactly', ()=> {
	test.expect(formatDuration(500)).to.equal('500ms');
	test.expect(formatDuration(1000)).to.equal('1s');
	test.expect(formatDuration(60_000)).to.equal('1m');
	test.expect(formatDuration(90_000)).to.equal('1m 30s');
	test.expect(formatDuration(3_661_000)).to.equal('1h 1m 1s');
	test.expect(formatDuration(90_061_000)).to.equal('1d 1h 1m 1s');
	test.expect(formatDuration(-50)).to.equal('0ms'); // Never go negative
});


test('describe conditions as sentences', ()=> {
	test.expect(describeCondition({type: 'delay', ms: 100})).to.equal('Wait 100ms');
	test.expect(describeCondition({type: 'delay', ms: 3_600_000})).to.equal('Wait 1h');
	test.expect(describeCondition({type: 'pid', pid: 123})).to.equal('Wait for PID 123 to exit');
	test.expect(describeCondition({type: 'path', path: '/tmp/x'})).to.equal('Wait for /tmp/x to change');
	test.expect(describeCondition({type: 'load', op: '>', value: 2})).to.equal('Wait for load > 2');
});
