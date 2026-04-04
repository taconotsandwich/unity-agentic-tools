# Sentinel's Journal - Critical Security Learnings

## 2024-04-04 - Command Injection in `docs` query

**Vulnerability:** Command Injection in the `docs` command of the CLI. The query string was being passed directly to a shell command through `child_process.exec`.

**Learning:** `JSON.stringify()` is not sufficient for sanitizing user input passed to a shell. While it escapes double quotes, it does not prevent shell expansions like `$()` or backticks which are still interpreted within the resulting double-quoted string in many environments.

**Prevention:** Always use `child_process.spawn` or `execFile` with an array of arguments to execute subprocesses. This bypasses the shell entirely and treats user input as literal text, preventing command injection.
