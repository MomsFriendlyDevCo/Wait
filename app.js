#!/bin/sh
":" //# comment; exec /usr/bin/env node --no-warnings "$0" "$@"
// ^^^ Horrible kludge to get Node to STFU about experiemental feature warnings

import {program} from 'commander'
import 'commander-extras';

// Parse Command line
let args = program
	.name('wait')
	.description('Wait for one or more conditions then either do-a-thing or return a zero exit code')
	.argument('["for"|"until"] [conditions...] ["then"] [--] [command]')
	.option('--loop, --repeat <n>', 'Repeat N number of times before exiting')
	.option('--invert, -v', 'Invert the match condition')
	.option('--timeout <timestring>', 'Give up and exit after the given time period')
	.option('--timeout-as <exit-code>', 'Raise the given exit code when timing out', 1)
	.note('CONDITION: [timestring] - any valid, parsable timestring compatible expression to denote waiting for a time')
	.note('CONDITION: [time] - pause until the given, relative or parsable time')
	.note('CONDITION: [pid] <"exits"|"fails"|"stops"> - wait for the PID to exit (correctly | non-zero exit|quits for any reason)')
	.note('CONDITION: <"path"|"for changes to"> [path] ["changes"|"to change"]', 'wait for a path to change')
	.note('CONDITION: <"load"> <"<"|"<="|">="|"above"|"below"> [number]', 'wait for system load to satisfy a condition')
	.note('OPERAND: <a> AND <b>', 'Join two+ conditionals together with an AND operator')
	.note('OPERAND: <a> OR <b>', 'Join two+ conditionals together with an OR operator')
	.example('wait 1h', 'Wait for one hour then exit')
	.example('wait until 123 exits', 'Wait until PID 123 exits with a positive exit code')
	.example('wait until 3pm', 'Wait until the next time 3pm occurs')
	.example('wait until tuesday', 'Wait until Tuesday occurs')
	.parse(process.argv);

args = { // Flatten into POJO of option keys + `args:Array<String>`
	...args.opts(),
	args: args.args,
};
