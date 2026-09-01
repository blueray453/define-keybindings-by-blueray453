import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { KEYBINDINGS } from './keybindingsData.js';
import { initLogging, createLogger } from './logger.js';

const journal = createLogger(import.meta.url);

export default class ExampleExtension extends Extension {
  enable() {
    initLogging(this.uuid, 'both', false);
    journal('Enabled');

    this._settings = this.getSettings(
      'org.gnome.shell.extensions.define-keybindings-by-blueray453'
    );

    this._bindingsByKey = new Map(KEYBINDINGS.map(b => [b.key, b]));

    // ---- Seed defaults from keybindingsData.js (SSOT) ----
    for (const { key, accel, passthroughWmClass } of KEYBINDINGS) {
      // Accelerator
      if (this._settings.get_strv(key).length === 0) {
        this._settings.set_strv(key, [accel]);
      }
      // Passthrough list
      const pKey = `${key}-passthrough`;
      if (this._settings.get_strv(pKey).length === 0) {
        this._settings.set_strv(pKey, passthroughWmClass || []);
      }
    }

    // ---- Add all keybindings initially ----
    for (const { key } of KEYBINDINGS) {
      this._addKeybinding(key);
    }

    // Track which passthrough keys are currently added
    this._passthroughAdded = new Set();

    // ---- Focus change signal ----
    this._focusSignalId = global.display.connect('notify::focus-window', () => {
      this._updatePassthroughBindings();
    });

    // ---- Listen for passthrough list changes in GSettings ----
    this._passthroughChangedIds = [];
    for (const { key } of KEYBINDINGS) {
      const id = this._settings.connect(`changed::${key}-passthrough`, () => {
        this._updatePassthroughBindings();
      });
      this._passthroughChangedIds.push(id);
    }

    // ---- Apply initial state ----
    this._updatePassthroughBindings();

    journal('Extension enabled with dynamic passthrough management');
  }

  _addKeybinding(key) {
    Main.wm.addKeybinding(
      key,
      this._settings,
      Meta.KeyBindingFlags.NONE,
      Shell.ActionMode.ALL,
      () => this._onKeyPress(key)
    );
  }

  _removeKeybinding(key) {
    Main.wm.removeKeybinding(key);
  }

  _onKeyPress(key) {
    const entry = this._bindingsByKey.get(key);
    if (!entry) return;

    // Guard: should never happen because passthrough bindings are removed
    // when the focused window matches, but keep as safety net.
    if (this._getPassthroughList(key).length > 0 &&
      this._focusedWmClassIs(this._getPassthroughList(key))) {
      journal(`Keybinding ${key} triggered but window is passthrough – ignoring`);
      return;
    }

    journal(`Keybinding triggered: ${key} (${entry.accel})`);
    try {
      GLib.spawn_command_line_async(entry.command);
    } catch (e) {
      journal(`Failed to run command for ${key}: ${e}`, true);
    }
  }

  _focusedWmClassIs(wmClassOrClasses) {
    const win = global.display.focus_window;
    const actual = win?.get_wm_class();
    if (!actual) return false;

    const candidates = Array.isArray(wmClassOrClasses)
      ? wmClassOrClasses
      : [wmClassOrClasses];

    return candidates.some(
      wc => actual.toLowerCase() === wc.toLowerCase()
    );
  }

  _getPassthroughList(key) {
    const list = this._settings.get_strv(`${key}-passthrough`);
    return list.filter(s => s.trim().length > 0);
  }

  _updatePassthroughBindings() {
    const win = global.display.focus_window;
    const wmClass = win?.get_wm_class()?.toLowerCase();

    for (const [key, entry] of this._bindingsByKey) {
      const list = this._getPassthroughList(key);
      const shouldRemove = wmClass && list.some(cls => cls.toLowerCase() === wmClass);

      const currentlyAdded = this._passthroughAdded.has(key);
      if (shouldRemove && currentlyAdded) {
        this._removeKeybinding(key);
        this._passthroughAdded.delete(key);
        journal(`Removed keybinding ${key} (passthrough window focused)`);
      } else if (!shouldRemove && !currentlyAdded) {
        this._addKeybinding(key);
        this._passthroughAdded.add(key);
        journal(`Re-added keybinding ${key} (passthrough window lost focus)`);
      }
    }
  }

  disable() {
    // Disconnect focus signal
    if (this._focusSignalId) {
      global.display.disconnect(this._focusSignalId);
      this._focusSignalId = null;
    }

    // Disconnect passthrough change signals
    if (this._passthroughChangedIds) {
      for (const id of this._passthroughChangedIds) {
        this._settings.disconnect(id);
      }
      this._passthroughChangedIds = null;
    }

    // Remove all keybindings (but DO NOT reset settings)
    if (this._bindingsByKey) {
      for (const key of this._bindingsByKey.keys()) {
        Main.wm.removeKeybinding(key);
      }
      this._bindingsByKey = null;
    }

    this._settings = null;
    this._passthroughAdded = null;

    journal('Extension disabled: all cleaned.');
  }
}