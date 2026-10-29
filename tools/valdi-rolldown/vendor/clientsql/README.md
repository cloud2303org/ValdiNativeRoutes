From Valdi beta-0.2.1 (the tag valdi/MODULE.bazel pins), `compiler/clientsql/src/`: the ClientSQL generator Valdi runs
for .sq files (clientsql/, clientsql_main.py), unchanged. MIT, see LICENSE. Standard library only (Python 3.10+).

It requires its SQLite 3.16.0 validator, `compiler/clientsql/sqlite_316_validator.cpp` linked against the pinned SQLite
3.16.0 sources: `bazel build @valdi//compiler/clientsql:sqlite_316_validator` in valdi/ (sqlgen.ts finds it there).
