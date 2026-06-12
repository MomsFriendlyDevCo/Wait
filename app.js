#!/bin/sh
":" //# comment; exec /usr/bin/env node --no-warnings "$0" "$@"
// ^^^ Horrible kludge to get Node to STFU about experiemental feature warnings

import {program} from 'commander'
import 'commander-extras';
import {spawn} from 'node:child_process';
import timestring from 'timestring';
import {Display} from './lib/display.js';
import {parseWaitArgs} from './lib/parse.js';
import {waitFor} from './lib/wait.js';

// Split off any command following a literal `--` before Commander can mangle it
let argv = process.argv;
let command = [];
let dashOffset = argv.indexOf('--');
if (dashOffset > -1) {
	command = argv.slice(dashOffset + 1);
	argv = argv.slice(0, dashOffset);
}

// Parse Command line
let args = program
	.name('wait')
	.description('Wait for one or more conditions then either do-a-thing or return a zero exit code')
	.argument('["for"|"until"] [conditions...] ["then"] [--] [command]')
	.option('--loop, --repeat <n>', 'Repeat N number of times before exiting')
	.option('--invert, -v', 'Invert the match condition')
	.option('--timeout <timestring>', 'Give up and exit after the given time period')
	.option('--timeout-as <exit-code>', 'Raise the given exit code when timing out', 1)
	.option('--quiet, -q', 'Suppress the condition progress display')
	.allowExcessArguments()
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
	.parse(argv);

args = { // Flatten into POJO of option keys + `args:Array<String>`
	...args.opts(),
	args: args.args,
};

Promise.resolve()
	.then(()=> {
		let parsed = parseWaitArgs(args.args);
		if (parsed.command.length > 0) command = parsed.command;

		let repeat = args.repeat ? Number.parseInt(args.repeat) : 1;
		if (
			Number.isNaN(repeat)
			|| repeat < 1
		) throw new Error(`Invalid --repeat count: "${args.repeat}"`);

		return {
			conditions: parsed.conditions,
			repeat,
			timeout: args.timeout ? timestring(args.timeout, 'ms') : null,
		};
	})
	.catch(e => {
		console.error(e.message);
		process.exit(2);
	})
	.then(({conditions, repeat, timeout})=> {
		let display = args.quiet
			? null
			: new Display(conditions, {timeout});

		// Run the wait (+ optional command) cycle `repeat` times in series
		return Array.from({length: repeat})
			.reduce(chain => chain
				.then(()=> {
					let waiting = waitFor(conditions, { // Stamps condition state synchronously...
						invert: !! args.invert,
						timeout,
					});
					display?.start(); // ...so the display can begin rendering it
					return waiting;
				})
				.then(satisfied => {
					display?.stop(satisfied);
					if (!satisfied) process.exit(Number.parseInt(args.timeoutAs));
				})
				.then(()=> command.length > 0 && runCommand(command))
				.then(exitCode => {
					if (exitCode) process.exit(exitCode);
				})
			, Promise.resolve());
	})
	.then(()=> process.exit(0)); // eslint-disable-line unicorn/prefer-top-level-await


/**
* Run a command, inheriting stdio, and resolve with its exit code
*
* @param {Array<String>} command Command + arguments to execute
* @returns {Promise<Number>} Resolves with the command exit code (1 if it failed to spawn)
*/
function runCommand(command) {
	return new Promise(resolve =>
		spawn(command[0], command.slice(1), {stdio: 'inherit'})
			.on('error', e => {
				console.error(e.message);
				resolve(1);
			})
			.on('exit', code => resolve(code ?? 1))
	);
}
