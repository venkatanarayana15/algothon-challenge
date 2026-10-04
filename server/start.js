/**
 * Entry point for `npm start`.
 *
 * The obvious script is `NODE_ENV=production node server/index.js`, but npm runs
 * scripts through cmd.exe on Windows, where that is not valid syntax and the
 * command dies with "'NODE_ENV' is not recognized". Setting the variable from
 * Node instead keeps the documented one-command start working in every shell —
 * bash, cmd, PowerShell, and the Linux container a host will use — with no
 * cross-env dependency and no platform branch in the docs.
 *
 * `??=` rather than `=`, so an explicit NODE_ENV from the environment
 * (a host, a CI job, `NODE_ENV=test`) is never overridden.
 */
process.env.NODE_ENV ??= 'production'

await import('./index.js')
