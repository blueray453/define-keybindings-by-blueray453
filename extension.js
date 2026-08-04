import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { setLogging, setLogFn, journal } from './utils.js'

export default class ExampleExtension extends Extension {
  enable() {
    setLogFn((msg, error = false) => {
      let level;
      if (error) {
        level = GLib.LogLevelFlags.LEVEL_CRITICAL;
      } else {
        level = GLib.LogLevelFlags.LEVEL_MESSAGE;
      }

      GLib.log_structured(
        'define-keybindings-by-blueray453',
        level,
        {
          MESSAGE: `${msg}`,
          SYSLOG_IDENTIFIER: 'define-keybindings-by-blueray453',
          CODE_FILE: GLib.filename_from_uri(import.meta.url)[0]
        }
      );
    });

    setLogging(true);

    // journalctl -f -o cat SYSLOG_IDENTIFIER=define-keybindings-by-blueray453
    journal(`Enabled`);

    this._settings = this.getSettings(
      'org.gnome.shell.extensions.define-keybindings-by-blueray453'
    );

    journal(`${this._settings}`);

    // Map key names → actual accelerators and commands
    this._bindings = {
      'kb-1': { accel: '<Super>grave', command: 'align-windows' },
      'kb-2': { accel: '<Super>a', command: 'alacritty-keybinding' },
      'kb-3': { accel: '<Super>n', command: 'nemo-keybinding' },
      'kb-4': { accel: '<Super>f', command: 'fsearch-keybinding' },
      'kb-5': { accel: '<Super>c', command: 'codium-keybinding' },
      'kb-6': { accel: '<Super>b', command: 'firefox-keybinding' },
      'kb-7': { accel: '<Super>v', command: 'multimedia-keybinding' },
      'kb-8': { accel: '<Super>r', command: 'books-keybinding' },
      'kb-9': { accel: '<Super>m', command: 'toggle-mark-windows' },
      'kb-10': { accel: '<Super>w', command: 'gdmenu-activity-overview' },
      'kb-11': { accel: '<Super>Delete', command: 'close-other-windows' },
      'kb-12': { accel: '<Super>o', command: 'open-file-path' },
      'kb-13': { accel: '<Super>q', command: 'capture2text' },
      'kb-14': { accel: 'Print', command: 'gdmenu-screenshot' },
      'kb-15': { accel: '<Super>p', command: 'toggle-pin-windows' },
      'kb-16': { accel: '<Super>Tab', command: 'toggle-workspace' },
      'kb-17': { accel: '<Super>x', command: 'move-all-windows-to-respective-workspaces' }
    };

    // Register all keybindings
    for (const [name, { accel }] of Object.entries(this._bindings)) {
      this._settings.set_strv(name, [accel]);

      Main.wm.addKeybinding(
        name,
        this._settings,
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.ALL,
        () => this._onKeyPress(name)
      );
    }
  }

  _onKeyPress(name) {
    const entry = this._bindings[name];
    if (!entry) return;

    journal(`Keybinding triggered: ${name} (${entry.accel})`);

    try {
      GLib.spawn_command_line_async(entry.command);
    } catch (e) {
      journal(`Failed to run command for ${name}: ${e}`, true);
    }
  }

  disable() {
    if (!this._bindings) return;

    // Remove keybindings from Main.wm
    for (const name of Object.keys(this._bindings)) {
      Main.wm.removeKeybinding(name);
    }

    // Clear all GSettings entries for this extension
    for (const name of Object.keys(this._bindings)) {
      this._settings.reset(name);
    }

    this._bindings = null;
    this._settings = null;

    journal('Extension disabled: all keybindings removed and settings cleared.');
  }
}
