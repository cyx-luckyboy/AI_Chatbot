import { app } from 'electron'
import electronSquirrelStartup from 'electron-squirrel-startup'

/** Squirrel.Windows install hooks — must use static import so Vite/Rollup bundles the module (bare `require('…')` is not traced). */
if (electronSquirrelStartup) {
  app.quit()
}
