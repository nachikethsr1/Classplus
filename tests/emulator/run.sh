#!/usr/bin/env bash
# Start the Firebase Emulator Suite (auth + firestore + storage) against the
# committed rules and run the test suite inside it.
#
#   ./tests/emulator/run.sh            # everything
#   ./tests/emulator/run.sh 05         # one suite
#
# Requires Java for the Firestore and Storage rules runtimes. If `java` is not
# on PATH this falls back to the JDK shipped in the python package jdk4py
# (pip install jdk4py), which is how it runs in a sandbox without a system JRE.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

if ! command -v java >/dev/null 2>&1; then
  if python3 -c 'import jdk4py' >/dev/null 2>&1; then
    JAVA_HOME="$(python3 -c 'import jdk4py; print(jdk4py.JAVA_HOME)')"
    export JAVA_HOME
    export PATH="$JAVA_HOME/bin:$PATH"
    echo "using jdk4py JDK at $JAVA_HOME"
  else
    echo "java not found: install a JRE (or pip install jdk4py)" >&2
    exit 1
  fi
fi

cd "$ROOT"
exec "$HERE/node_modules/.bin/firebase" emulators:exec \
  --only auth,firestore,storage \
  --project "${GCLOUD_PROJECT:-demo-classplus}" \
  "node tests/emulator/run-all.js ${1:-}"
