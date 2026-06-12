import os from 'node:os';
import {stat} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

export const POLL_INTERVALS = {
	pid: 100,
	path: 200,
	load: 500,
};

const LOAD_OPS = {
	'<': (a, b)=> a < b,
	'<=': (a, b)=> a <= b,
	'>': (a, b)=> a > b,
	'>=': (a, b)=> a >= b,
};


/**
* Wait until the given condition groups are satisfied (or an optional timeout fires)
*
* Conditions within a group must ALL resolve (AND), any one group resolving wins (OR)
*
* @param {Array<Array<Object>>} conditions OR-groups of ANDed condition descriptors (see `parseWaitArgs()`)
* @param {Object} [options] Additional options to mutate behaviour
* @param {Boolean} [options.invert=false] Invert the match for predicate-style conditions (pid + load)
* @param {Number} [options.timeout] Maximum milliseconds to wait before giving up
*
* @returns {Promise<Boolean>} Resolves true when conditions are met, false if the timeout fired first
*/
export function waitFor(conditions, options) {
	let settings = {
		invert: false,
		timeout: null,
		...options,
	};

	let conditionsMet = Promise.race(
		conditions.map(group => Promise.all(
			group.map(condition => waitForCondition(condition, settings))
		))
	).then(()=> true);

	if (!settings.timeout) return conditionsMet;
	return Promise.race([
		conditionsMet,
		delay(settings.timeout, false),
	]);
}


/**
* Wait for a single condition descriptor to be satisfied
*
* @param {Object} condition Condition descriptor of the form `{type:String, ...}`
* @param {Object} [settings] Settings inherited from `waitFor()`
*
* @returns {Promise} Resolves when the condition is met
*/
export function waitForCondition(condition, settings = {}) {
	switch (condition.type) {
		case 'delay':
			return delay(condition.ms);
		case 'time':
			return delay(Math.max(0, condition.when - Date.now()));
		case 'pid':
			// Wait until the PID vanishes (or appears, if inverted)
			// NOTE: Exit codes of non-child processes aren't visible so "exits"/"fails"/"stops" are equivalent
			return pollUntil(()=> pidExists(condition.pid) == !! settings.invert, POLL_INTERVALS.pid);
		case 'path':
			return waitForPathChange(condition.path);
		case 'load':
			return pollUntil(
				()=> LOAD_OPS[condition.op](os.loadavg()[0], condition.value) != !! settings.invert,
				POLL_INTERVALS.load,
			);
		default:
			throw new Error(`Unknown condition type: "${condition.type}"`);
	}
}


/**
* Repeatedly evaluate a predicate until it returns truthy
*
* @param {Function} predicate Sync/async function to evaluate
* @param {Number} interval Milliseconds between evaluations
*
* @returns {Promise} Resolves when the predicate first returns truthy
*/
export function pollUntil(predicate, interval) {
	return Promise.resolve(predicate())
		.then(result => result
			|| delay(interval)
				.then(()=> pollUntil(predicate, interval))
		);
}


/**
* Check whether a PID currently exists
*
* @param {Number} pid Process ID to check
* @returns {Boolean} True if the process exists
*/
export function pidExists(pid) {
	try { // try/catch is unavoidable here - process.kill() throws synchronously
		process.kill(pid, 0);
		return true;
	} catch (e) {
		return e.code == 'EPERM'; // EPERM = exists but owned by someone else, ESRCH = gone
	}
}


/**
* Wait for a path to change from its current state
* Mtime, size or existence changes (including creation + deletion) all count
*
* @param {String} path Path to watch
* @returns {Promise} Resolves when the path first differs from its starting state
*/
export function waitForPathChange(path) {
	return pathSignature(path)
		.then(signature => pollUntil(
			()=> pathSignature(path)
				.then(current => current != signature),
			POLL_INTERVALS.path,
		));
}


/**
* Compute a comparable state signature for a path
*
* @param {String} path Path to examine
* @returns {Promise<String>} Signature encoding mtime + size, or 'MISSING' if the path doesn't exist
*/
function pathSignature(path) {
	return stat(path)
		.then(stats => `${stats.mtimeMs}:${stats.size}`)
		.catch(()=> 'MISSING');
}
