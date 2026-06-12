import os from 'node:os';

export const SYMBOLS = {
	pending: '○',
	satisfied: '✔',
	failed: '✘',
};

const COLORS = {
	pending: '90', // Grey
	satisfied: '32', // Green
	failed: '31', // Red
};


/**
* Render a live tick-list of wait conditions to a stream
*
* On a TTY the list redraws in-place each interval with live countdowns
* When piped, the full list prints once then each condition prints again as it resolves
*/
export class Display {

	/**
	* @param {Array<Array<Object>>} conditions OR-groups of ANDed condition descriptors (shared with `waitFor()` which stamps their state)
	* @param {Object} [options] Additional options to mutate behaviour
	* @param {Object} [options.stream=process.stderr] Stream to render to
	* @param {Number} [options.interval=1000] Milliseconds between redraws
	* @param {Number} [options.timeout] Overall timeout in milliseconds, displayed as a footer
	*/
	constructor(conditions, options) {
		let settings = {
			stream: process.stderr,
			interval: 1000,
			timeout: null,
			...options,
		};
		this.conditions = conditions;
		this.stream = settings.stream;
		this.interval = settings.interval;
		this.timeout = settings.timeout;
		this.isTTY = !! this.stream.isTTY;
	}


	/**
	* Begin rendering, drawing immediately then on each interval
	*/
	start() {
		this.startedAt = Date.now();
		this.finished = false;
		this.satisfied = null;
		this.printedHeader = false;
		this.drawnLines = 0;
		this.reported = new Set();
		this.redraw();
		this.timer = setInterval(()=> this.redraw(), this.interval);
	}


	/**
	* Stop rendering, drawing one final state
	*
	* @param {Boolean} satisfied Whether the overall wait resolved (false = timed out)
	*/
	stop(satisfied) {
		clearInterval(this.timer);
		this.finished = true;
		this.satisfied = satisfied;
		this.redraw();
	}


	/**
	* Draw the current condition state to the stream
	*/
	redraw() {
		if (this.isTTY) {
			this.redrawTTY();
		} else {
			this.redrawPlain();
		}
	}


	/**
	* TTY drawing - erase the previous draw + repaint everything in place
	*/
	redrawTTY() {
		let lines = this.lines();
		this.stream.write(
			'\u001B[1A\u001B[2K'.repeat(this.drawnLines)
			+ lines.join('\n')
			+ '\n'
		);
		this.drawnLines = lines.length;
	}


	/**
	* Non-TTY drawing - print the full list once then only state transitions
	*/
	redrawPlain() {
		let flat = this.conditions.flat();
		let output;

		if (this.printedHeader) {
			output = flat
				.filter(condition => condition.satisfied && !this.reported.has(condition))
				.map(condition => this.line(condition));
		} else { // First draw - print the full tick-list
			this.printedHeader = true;
			output = this.lines();
		}

		flat
			.filter(condition => condition.satisfied)
			.forEach(condition => this.reported.add(condition));

		if (this.finished && this.satisfied === false) // Timed out - report what never resolved
			output.push(...flat
				.filter(condition => !condition.satisfied)
				.map(condition => this.line(condition))
			);

		if (output.length > 0) this.stream.write(output.join('\n') + '\n');
	}


	/**
	* Compute all display lines for the current state
	*
	* @returns {Array<String>} Renderable lines
	*/
	lines() {
		let body = this.conditions.flatMap((group, groupOffset) => [
			...(groupOffset > 0 ? [this.colorize(COLORS.pending, '-- OR --')] : []),
			...group.map(condition => this.line(condition)),
		]);

		if (this.timeout && !this.finished) {
			body.push(this.colorize(COLORS.pending, `⧗ Timeout after ${formatDuration(this.startedAt + this.timeout - Date.now())}`));
		} else if (this.finished && this.satisfied === false) {
			body.push(this.colorize(COLORS.failed, `${SYMBOLS.failed} Timed out`));
		}

		return body;
	}


	/**
	* Render a single condition line
	*
	* @param {Object} condition Condition descriptor to render
	* @returns {String} Renderable line
	*/
	line(condition) {
		let state = condition.satisfied ? 'satisfied'
			: this.finished && this.satisfied === false ? 'failed'
			: 'pending';

		return `${this.colorize(COLORS[state], SYMBOLS[state])} ${describeCondition(condition)}${this.suffix(condition, state)}`;
	}


	/**
	* Compute the status suffix for a condition - countdowns, current values etc.
	*
	* @param {Object} condition Condition descriptor to examine
	* @param {String} state Render state - 'pending', 'satisfied' or 'failed'
	*
	* @returns {String} Suffix text (or an empty string)
	*/
	suffix(condition, state) {
		if (state == 'satisfied') return '';
		if (state == 'failed') return ' (timed out)';
		switch (condition.type) {
			case 'delay':
				return ` (${formatDuration(condition.startedAt + condition.ms - Date.now())} remaining)`;
			case 'time':
				return ` (${formatDuration(condition.when - Date.now())} remaining)`;
			case 'load':
				return ` (currently ${os.loadavg()[0].toFixed(2)})`;
			default:
				return '';
		}
	}


	/**
	* Wrap text in an ANSI color when the stream supports it
	*
	* @param {String} color ANSI color code
	* @param {String} text Text to wrap
	*
	* @returns {String} Color wrapped (or untouched) text
	*/
	colorize(color, text) {
		return this.isTTY
			? `\u001B[${color}m${text}\u001B[0m`
			: text;
	}
}


/**
* Describe a condition descriptor as a human readable sentence
*
* @param {Object} condition Condition descriptor to describe
* @returns {String} Human readable description
*/
export function describeCondition(condition) {
	switch (condition.type) {
		case 'delay': return `Wait ${formatDuration(condition.ms)}`;
		case 'time': return `Wait until ${condition.when.toLocaleString()}`;
		case 'pid': return `Wait for PID ${condition.pid} to exit`;
		case 'path': return `Wait for ${condition.path} to change`;
		case 'load': return `Wait for load ${condition.op} ${condition.value}`;
		default: return `Wait for ${condition.type}`;
	}
}


/**
* Format a millisecond duration as a compact human readable string
*
* @param {Number} ms Duration in milliseconds
* @returns {String} Formatted duration - e.g. "1h 2m 3s" / "500ms"
*/
export function formatDuration(ms) {
	if (ms < 1000) return `${Math.max(0, Math.ceil(ms))}ms`;

	return [
		{unit: 'd', ms: 86_400_000},
		{unit: 'h', ms: 3_600_000},
		{unit: 'm', ms: 60_000},
		{unit: 's', ms: 1000},
	]
		.reduce((out, segment)=> {
			let quantity = Math.floor(out.remaining / segment.ms);
			if (quantity > 0) {
				out.parts.push(quantity + segment.unit);
				out.remaining -= quantity * segment.ms;
			}
			return out;
		}, {remaining: ms, parts: []})
		.parts
		.join(' ');
}
