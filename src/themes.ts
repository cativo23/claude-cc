// Compatibility shim: the canonical surface lives in `./themes/index.ts`.
// Existing imports of `./themes.js` continue to work via this re-export so
// migrating the modular layout did not require a sweeping rename across
// callers (render/, commands/, installer-wizard, tests).
export * from './themes/index.js';
