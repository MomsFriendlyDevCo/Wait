import timestring from 'timestring';

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
* Parse raw CLI arguments into wait conditions + an optional trailing command
*
* @param {Array<String>} rawArgs Positional CLI arguments to parse
*
* @returns {Object} Parse result
* @property {Array<Array<Object>>} conditions OR-groups of ANDed condition descriptors
* @property {Array<String>} command Optional command (+ arguments) to run when conditions are met
*/
export function parseWaitArgs(rawArgs) {
	let tokens = [...rawArgs];

	// Strip leading "for" / "until" sentence opener (but keep "for changes to <path>" intact)
	if (
		/^until$/i.test(tokens[0])
		|| (/^for$/i.test(tokens[0]) && !/^changes$/i.test(tokens[1] || ''))
	) tokens.shift();

	// Split off the command portion after "then"
	let command = [];
	let thenOffset = tokens.findIndex(token => /^then$/i.test(token));
	if (thenOffset > -1) {
		command = tokens.slice(thenOffset + 1);
		tokens = tokens.slice(0, thenOffset);
	}

	// Accumulate conditions into OR-groups of ANDed conditions
	let conditions = [[]];
	while (tokens.length > 0) {
		if (/^and$/i.test(tokens[0])) {
			tokens.shift();
		} else if (/^or$/i.test(tokens[0])) {
			tokens.shift();
			conditions.push([]);
		}
		if (tokens.length == 0) throw new Error('Trailing AND/OR operand with no following condition');
		conditions.at(-1).push(parseCondition(tokens));
	}

	if (conditions[0].length == 0 && command.length == 0)
		throw new Error('No wait conditions specified');

	return {conditions, command};
}


/**
* Consume one condition from the front of a token list
*
* @param {Array<String>} tokens Token list to consume from (mutated in place)
* @returns {Object} Condition descriptor of the form `{type:String, ...}`
*/
export function parseCondition(tokens) {
	// <pid> <"exits"|"fails"|"stops"> {{{
	if (/^\d+$/.test(tokens[0]) && /^(exits?|fails?|stops?)$/i.test(tokens[1] || '')) {
		let [pid] = tokens.splice(0, 2);
		return {type: 'pid', pid: Number.parseInt(pid)};
	}
	// }}}
	// "path" <path> ["changes" | "to" "change"] {{{
	if (/^path$/i.test(tokens[0]) && tokens.length > 1) {
		tokens.shift();
		let path = tokens.shift();
		if (/^changes$/i.test(tokens[0] || '')) {
			tokens.shift();
		} else if (/^to$/i.test(tokens[0] || '') && /^change$/i.test(tokens[1] || '')) {
			tokens.splice(0, 2);
		}
		return {type: 'path', path};
	}
	// }}}
	// ["for"] "changes" "to" <path> {{{
	if (/^for$/i.test(tokens[0]) && /^changes$/i.test(tokens[1] || '')) tokens.shift();
	if (/^changes$/i.test(tokens[0]) && /^to$/i.test(tokens[1] || '') && tokens.length > 2) {
		tokens.splice(0, 2);
		return {type: 'path', path: tokens.shift()};
	}
	// }}}
	// "load" <"<"|"<="|">"|">="|"above"|"below"> <number> {{{
	if (/^load$/i.test(tokens[0])) {
		tokens.shift();
		let op = (tokens.shift() || '').toLowerCase();
		op = {above: '>', over: '>', below: '<', under: '<'}[op] ?? op;
		if (!['<', '<=', '>', '>='].includes(op)) throw new Error(`Unknown load operator: "${op}"`);

		let value = Number.parseFloat(tokens.shift());
		if (Number.isNaN(value)) throw new Error('Load conditions need a number to compare against');

		return {type: 'load', op, value};
	}
	// }}}
	// Durations - "1h", "100ms", "5 minutes"... {{{
	// Try value + unit-word pairs first ("5 minutes" arrives as two tokens), then single tokens
	let joined = /^[a-z]+$/i.test(tokens[1] || '')
		&& !/^(and|or)$/i.test(tokens[1])
			? tryTimestring(`${tokens[0]} ${tokens[1]}`)
			: null;
	if (joined !== null) {
		tokens.splice(0, 2);
		return {type: 'delay', ms: joined};
	}

	let single = tryTimestring(tokens[0]);
	if (single !== null) {
		tokens.shift();
		return {type: 'delay', ms: single};
	}
	// }}}
	// Absolute / relative times - "3pm", "15:00", "tuesday", parsable dates {{{
	let when = parseTime(tokens[0]);
	if (when) {
		tokens.shift();
		return {type: 'time', when};
	}
	// }}}

	throw new Error(`Unknown condition: "${tokens[0]}"`);
}


/**
* Attempt to parse a timestring, returning null instead of throwing on failure
*
* @param {String} input Timestring expression to try
* @returns {Number|null} Parsed milliseconds or null if unparsable
*/
function tryTimestring(input) {
	try { // try/catch is unavoidable here - timestring() throws synchronously
		return timestring(input, 'ms');
	} catch {
		return null;
	}
}


/**
* Parse a human time expression into the next Date it occurs
*
* @param {String} input Time expression - "3pm", "15:00", "tuesday" or anything `new Date()` accepts
* @param {Date} [now] Current time, used to resolve relative expressions (mainly for testing)
*
* @returns {Date|null} The next occurance of the given time, or null if unparsable
*/
export function parseTime(input, now = new Date()) {
	// Weekday names - resolve to next occurance
	let weekday = WEEKDAYS.indexOf(input.toLowerCase());
	if (weekday > -1) {
		let when = new Date(now);
		when.setDate(when.getDate() + ((weekday - when.getDay() + 6) % 7) + 1);
		when.setHours(0, 0, 0, 0);
		return when;
	}

	// Clock times - "3pm", "3:30pm", "15:00"
	let clock = /^(?<hours>\d{1,2})(?::(?<minutes>\d{2}))?(?<meridian>am|pm)?$/i.exec(input);
	if (
		clock
		&& (
			clock.groups.minutes !== undefined
			|| clock.groups.meridian
		)
	) {
		let hours = Number.parseInt(clock.groups.hours);
		let minutes = Number.parseInt(clock.groups.minutes ?? 0);
		let meridian = (clock.groups.meridian || '').toLowerCase();

		let isValid = minutes <= 59
			&& (meridian
				? hours >= 1 && hours <= 12 // Meridian clocks run 1-12...
				: hours <= 23 // ...24h clocks run 0-23
			);
		if (!isValid) return null; // Looked like a clock time but out of range - don't let Date() mangle it

		if (meridian == 'pm' && hours < 12) hours += 12;
		if (meridian == 'am' && hours == 12) hours = 0;

		let when = new Date(now);
		when.setHours(hours, minutes, 0, 0);
		if (when <= now) when.setDate(when.getDate() + 1); // Already passed today - use tomorrow
		return when;
	}

	// Anything else Date can digest - but never bare numbers (Date parses "5" as 2001-05-01!)
	if (!/^\d+$/.test(input)) {
		let when = new Date(input);
		if (!Number.isNaN(when.getTime())) return when;
	}

	return null;
}
