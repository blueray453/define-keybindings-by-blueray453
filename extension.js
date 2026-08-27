import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { KEYBINDINGS } from './keybindingsData.js';
import {
  initLogging,
  createLogger,
} from './logger.js';

const journal = createLogger(import.meta.url);

export default class ExampleExtension extends Extension {
  enable() {
    initLogging(this.uuid, 'both', false);
    journal(`Enabled`);

    this._settings = this.getSettings(
      'org.gnome.shell.extensions.define-keybindings-by-blueray453'
    );

    // Fast lookup by GSettings key name, used in _onKeyPress below.
    this._bindingsByKey = new Map(KEYBINDINGS.map(b => [b.key, b]));

    for (const { key, accel } of KEYBINDINGS) {
      // Only seed the default if nothing's been saved yet (schema
      // defaults are now empty arrays — the real default accelerator
      // lives only in keybindingsData.js). Never overwrite a value
      // prefs.js has already set.
      if (this._settings.get_strv(key).length === 0)
        this._settings.set_strv(key, [accel]);

      Main.wm.addKeybinding(
        key,
        this._settings,
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.ALL,
        () => this._onKeyPress(key)
      );
    }
  }

  _onKeyPress(key) {
    const entry = this._bindingsByKey?.get(key);
    if (!entry) return;
    journal(`Keybinding triggered: ${key} (${entry.accel})`);
    try {
      GLib.spawn_command_line_async(entry.command);
    } catch (e) {
      journal(`Failed to run command for ${key}: ${e}`, true);
    }
  }

  disable() {
    if (!this._bindingsByKey) return;
    for (const key of this._bindingsByKey.keys()) {
      Main.wm.removeKeybinding(key);
      this._settings.reset(key);
    }
    this._bindingsByKey = null;
    this._settings = null;

    journal('Extension disabled: all cleaned.');
  }
}