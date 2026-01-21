#!/bin/bash
set -e

# Parse arguments
PLUGIN=""
ITERATIONS=""

if [[ "$1" =~ ^[0-9]+$ ]]; then
  ITERATIONS="$1"
elif [[ -n "$1" ]]; then
  PLUGIN="$1"
  ITERATIONS="$2"
fi

# Build plugin filter for prompt
if [[ -n "$PLUGIN" ]]; then
  PLUGIN_FILTER="SCOPE: Only test modules in src-tauri/src/plugins/$PLUGIN/"
  TARPAULIN_INCLUDE="--include-files 'src-tauri/src/plugins/$PLUGIN/*'"
else
  PLUGIN_FILTER="SCOPE: Test all modules in src-tauri/src/"
  TARPAULIN_INCLUDE=""
fi

run_iteration() {
  opencode run "@ralph/test-progress.txt @CLAUDE.md
Context: Jubby is a Tauri app (Rust backend + React frontend).

## Codebase Structure
- src-tauri/src/plugins/  - Plugin modules (main business logic)
- src-tauri/src/core/     - Window management, tray, settings
- src-tauri/src/shared/   - Common utilities, paths, errors

## Test Conventions
- Tests use #[cfg(test)] embedded in modules
- Use tempfile crate for file system tests
- Follow existing test patterns in the codebase

## Commands
- cargo test -p jubby                                    # Run tests
- cargo tarpaulin -p jubby --out json --output-dir target/ --exclude-files 'src-tauri/src/main.rs' --exclude-files '**/commands.rs' $TARPAULIN_INCLUDE  # Coverage

$PLUGIN_FILTER

TASK:
1. Run tarpaulin with exclusions (main.rs, commands.rs are Tauri glue).
2. Parse target/tarpaulin-report.json:
   - Find the module with the LOWEST coverage that's below 80%
   - Skip modules already >= 90%
   - Only consider modules within the SCOPE above
3. Read that module's source code.
4. Identify specific untested functions/branches using the coverage data.
5. Write focused tests for those specific paths.
6. Run 'cargo test -p jubby' - if tests fail, fix them before continuing.
7. Run tarpaulin again to measure improvement.
8. Append to ralph/test-progress.txt:

## [Date/Time]
- **Module:** path/to/file.rs
- **Coverage:** X% -> Y% (+Z%)
- **Tests added:**
  - test_function_name: what it tests
- **Remaining gaps:** brief note on what still needs coverage

9. Completion criteria - output <promise>COMPLETE</promise> when:
   - ALL modules in scope are >= 80% coverage
   - No module in scope has 0% coverage

RULES:
- ONE module per iteration
- Prefer depth over breadth (get one module to 90% before moving to next)
- Don't test private implementation details, test public behavior
- Don't test Tauri command wrappers (they're thin glue code)
"
}

# Show what we're doing
if [[ -n "$PLUGIN" ]]; then
  echo "Testing plugin: $PLUGIN"
else
  echo "Testing all modules"
fi

# Establish baseline on first run
if [ ! -f "target/tarpaulin-report.json" ]; then
  echo "Establishing coverage baseline..."
  cargo tarpaulin -p jubby --out json --output-dir target/ --exclude-files 'src-tauri/src/main.rs' --exclude-files '**/commands.rs' 2>/dev/null || true
fi

if [ -z "$ITERATIONS" ]; then
  while true; do
    result=$(run_iteration)
    echo "$result"
    if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
      echo "Test coverage targets met, exiting."
      exit 0
    fi
  done
else
  for ((i=1; i<=$ITERATIONS; i++)); do
    echo "=== Iteration $i/$ITERATIONS ==="
    result=$(run_iteration)
    echo "$result"
    if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
      echo "Test coverage targets met, exiting."
      exit 0
    fi
  done
fi
