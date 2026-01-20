#!/bin/bash
set -e

run_iteration() {
  opencode run "@ralph/prd.json @ralph/progress.txt
1. Decide which task to work on next.
This should be the one YOU decide has the highest priority,
- not necessarily the first in the list.
2. Check any feedback loops, such as types and tests.
3. Append your progress to the progress.txt file in this structure:
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered (e.g., \"this codebase uses X for Y\")
  - Gotchas encountered (e.g., \"don't forget to update Z when changing W\")
  - Useful context (e.g., \"the evaluation panel is in component X\")
4. Make a git commit of that feature if the shouldCommit field is true.
ONLY WORK ON A SINGLE FEATURE.
If, while implementing the feature, you notice that all work
is complete, output <promise>COMPLETE</promise>.
"
}

if [ -z "$1" ]; then
  # No argument: infinite loop until COMPLETE
  while true; do
    result=$(run_iteration)
    echo "$result"
    if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
      echo "PRD complete, exiting."
      exit 0
    fi
  done
else
  # With argument: run N iterations
  for ((i=1; i<=$1; i++)); do
    result=$(run_iteration)
    echo "$result"
    if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
      echo "PRD complete, exiting."
      exit 0
    fi
  done
fi
