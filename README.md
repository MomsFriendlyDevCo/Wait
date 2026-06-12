@MomsFriendlyDevCo/Wait
=======================
A Command Line Interface (CLI) to, well, *wait* for things then exit.

```
Usage: wait [options] ["for"|"until"] [conditions...] ["then"] [--] [command]

Wait for one or more conditions then either do-a-thing or return a zero exit
code

Options:
  --loop, --repeat <n>      Repeat N number of times before exiting
  --invert, -v              Invert the match condition
  --timeout <timestring>    Give up and exit after the given time period
  --timeout-as <exit-code>  Raise the given exit code when timing out (default:
                            1)
  --quiet, -q               Suppress the condition progress display
  -h, --help                display help for command

Notes:
  * CONDITION: [timestring] - any valid, parsable timestring compatible expression to denote waiting for a time
  * CONDITION: [time] - pause until the given, relative or parsable time
  * CONDITION: [pid] <"exits"|"fails"|"stops"> - wait for the PID to exit (correctly | non-zero exit|quits for any reason)
  * CONDITION: <"path"|"for changes to"> [path] ["changes"|"to change"]
  * CONDITION: <"load"> <"<"|"<="|">="|"above"|"below"> [number]
  * OPERAND: <a> AND <b>
  * OPERAND: <a> OR <b>

Examples:

  # Wait for one hour then exit
  wait 1h

  # Wait until PID 123 exits with a positive exit code
  wait until 123 exits

  # Wait until the next time 3pm occurs
  wait until 3pm

  # Wait until Tuesday occurs
  wait until tuesday

  # Wait for 1 hour OR PID 123 exits with a non-zero code
  wait for 1h OR 123 fails
```
