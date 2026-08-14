import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { setLogging, setLogFn, journal } from './utils.js';

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

    // --- Load settings for your keybindings ---
    this._settings = this.getSettings(
      'org.gnome.shell.extensions.define-keybindings-by-blueray453'
    );

    // --- Block the original overlay-key handler ---
    // Find the original handler's ID (the one that toggles the overview)
    this._originalOverlayHandlerId = GObject.signal_handler_find(
      global.display,
      { signalId: 'overlay-key' }
    );
    if (this._originalOverlayHandlerId !== null) {
      global.display.block_signal_handler(this._originalOverlayHandlerId);
      journal(`Blocked original overlay-key handler (ID: ${this._originalOverlayHandlerId})`);
    } else {
      journal('No original overlay-key handler found?');
    }

    // --- Connect our own handler ---
    this._overlayKeyHandlerId = global.display.connect('overlay-key', () => {
      this._onSuperKeyPressed();
    });
    journal(`Connected custom overlay-key handler (ID: ${this._overlayKeyHandlerId})`);

    this._bindings = {
      'kb-1': { accel: '<Super>grave', command: 'gnomeutils-call --interface windows AlignWindowsOfFocusedWindowWMClass' },
      'kb-2': { accel: '<Super>a', command: 'alacritty-keybinding' },
      'kb-3': { accel: '<Super>n', command: 'nemo-keybinding' },
      'kb-4': { accel: '<Super>f', command: 'fsearch-keybinding' },
      'kb-5': { accel: '<Super>c', command: 'codium-keybinding' },
      'kb-6': { accel: '<Super>b', command: 'firefox-keybinding' },
      'kb-7': { accel: '<Super>v', command: 'multimedia-keybinding' },
      'kb-8': { accel: '<Super>r', command: 'books-keybinding' },
      'kb-9': { accel: '<Super>m', command: 'gnomeutils-call -i tagged ToggleMarksFocusedWindow' },
      'kb-10': { accel: '<Super>w', command: 'gdmenu-activity-overview' },
      'kb-11': { accel: '<Super>Delete', command: 'gnomeutils-call --interface tagged CloseOtherNotMarkedWindowsCurrentWorkspaceOfFocusedWindowWMClass' },
      'kb-12': { accel: '<Super>o', command: 'open-file-path' },
      'kb-13': { accel: '<Super>q', command: 'capture2text' },
      'kb-14': { accel: 'Print', command: 'gdmenu-screenshot' },
      'kb-15': { accel: '<Super>p', command: 'gnomeutils-call -i tagged TogglePinsFocusedWindow' },
      'kb-16': { accel: '<Super>Tab', command: 'gnomeutils-call -i workspaces ToggleWorkspaces' },
      'kb-17': { accel: '<Super>x', command: 'move-all-windows-to-respective-workspaces' }
    };

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

  // --- Handler for the bare Super key ---
  _onSuperKeyPressed() {
    journal('Super key pressed (bare) - executing gdmenu --drun');
    if (Main.overview.visibleTarget) {
      Main.overview.hide();
    }
    try {
      GLib.spawn_command_line_async('gdmenu --drun');
    } catch (e) {
      journal(`Failed to run gdmenu: ${e}`, true);
    }
  }

  // --- Handler for your regular keybindings ---
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
    // --- Unblock the original handler ---
    if (this._originalOverlayHandlerId !== null) {
      global.display.unblock_signal_handler(this._originalOverlayHandlerId);
      journal(`Unblocked original overlay-key handler (ID: ${this._originalOverlayHandlerId})`);
      this._originalOverlayHandlerId = null;
    }

    // --- Disconnect our own handler ---
    if (this._overlayKeyHandlerId !== null) {
      global.display.disconnect(this._overlayKeyHandlerId);
      this._overlayKeyHandlerId = null;
      journal('Disconnected custom overlay-key handler');
    }

    // --- Clean up regular keybindings ---
    if (!this._bindings) return;
    for (const name of Object.keys(this._bindings)) {
      Main.wm.removeKeybinding(name);
      this._settings.reset(name);
    }
    this._bindings = null;
    this._settings = null;

    journal('Extension disabled: all cleaned.');
  }
}