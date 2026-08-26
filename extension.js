import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
  initLogging,
  createLogger,
} from './logger.js';

const journal = createLogger(import.meta.url);

export default class ExampleExtension extends Extension {
  enable() {
    initLogging(this.uuid, 'both', false);
    journal(`Enabled`);

    // --- Load settings for your keybindings ---
    this._settings = this.getSettings(
      'org.gnome.shell.extensions.define-keybindings-by-blueray453'
    );

    // --- Your existing 17 keybindings (kb-18 removed) ---
    this._bindings = {
      'kb-1': { accel: '<Super>grave', command: 'gnomeutils-call --interface windows AlignWindowsOfFocusedWindowWMClass' },
      'kb-2': { accel: '<Super>a', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 0' },
      'kb-3': { accel: '<Super>n', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 1' },
      'kb-4': { accel: '<Super>f', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 2' },
      'kb-5': { accel: '<Super>c', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 3' },
      'kb-6': { accel: '<Super>b', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 4' },
      'kb-7': { accel: '<Super>v', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 5' },
      'kb-8': { accel: '<Super>r', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 6' },
      'kb-9': { accel: '<Super>x', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 7' },
      'kb-10': { accel: '<Super>Delete', command: 'gnomeutils-call --interface tagged CloseOtherNotMarkedWindowsCurrentWorkspaceOfFocusedWindowWMClass' },
      'kb-11': { accel: '<Super>m', command: 'gnomeutils-call -i tagged ToggleMarksFocusedWindow' },
      'kb-12': { accel: '<Super>p', command: 'gnomeutils-call -i tagged TogglePinsFocusedWindow' },
      'kb-13': { accel: '<Super>Tab', command: 'gnomeutils-call -i workspaces ToggleWorkspaces' },
      'kb-14': { accel: 'Print', command: 'gdmenu-screenshot' },
      'kb-15': { accel: '<Super>w', command: 'gdmenu-activity-overview' },
      'kb-16': { accel: '<Super>o', command: 'open-file-path' },
      'kb-17': { accel: '<Super>q', command: 'capture2text' },
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