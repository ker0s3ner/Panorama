import { startApplicationChrome } from '../app/startupChrome.js';
import { initKeySetup } from '../keySetup.js';
import { initOpsCenter } from '../ops/opsCenter.js';
export function startStandaloneChrome(options) {
  const stop = startApplicationChrome({
    // The first-launch welcome dialog is intentionally never shown.
    initializeWelcome: null,
    initializeSettings: initKeySetup,
    ...options,
  });
  const ops = initOpsCenter({ viewer: options.styleManager.viewer });
  return async () => {
    ops.destroy();
    await stop();
  };
}
