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

    // Map key -> entry
    this._bindingsByKey = new Map(KEYBINDINGS.map(b => [b.key, b]));

    // Which keys have passthrough? (for quick lookup)
    this._passthroughKeys = KEYBINDINGS
      .filter(b => b.passthroughWmClass)
      .map(b => b.key);

    // Seed GSettings defaults
    for (const { key, accel } of KEYBINDINGS) {
      if (this._settings.get_strv(key).length === 0)
        this._settings.set_strv(key, [accel]);
    }

    // Add all keybindings initially
    for (const { key } of KEYBINDINGS) {
      this._addKeybinding(key);
    }

    // Track which passthrough keys are currently added (we'll toggle them)
    // We'll assume they start as added; the focus handler will adjust.
    this._passthroughAdded = new Set(this._passthroughKeys);

    // Connect focus change signal
    this._focusSignalId = global.display.connect('notify::focus-window', () => {
      this._updatePassthroughBindings();
    });

    // Apply initial state based on current focus
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

    // This should never be called for passthrough keys when they are removed,
    // but keep as safeguard.
    if (entry.passthroughWmClass && this._focusedWmClassIs(entry.passthroughWmClass)) {
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

  _updatePassthroughBindings() {
    const win = global.display.focus_window;
    const wmClass = win?.get_wm_class()?.toLowerCase();

    // Determine if any passthrough key should be active for this window
    let shouldRemove = false;
    if (wmClass) {
      for (const key of this._passthroughKeys) {
        const entry = this._bindingsByKey.get(key);
        if (!entry) continue;
        const candidates = Array.isArray(entry.passthroughWmClass)
          ? entry.passthroughWmClass
          : [entry.passthroughWmClass];
        if (candidates.some(c => c.toLowerCase() === wmClass)) {
          shouldRemove = true;
          break;
        }
      }
    }

    // For each passthrough key, add or remove as needed
    for (const key of this._passthroughKeys) {
      const currentlyAdded = this._passthroughAdded.has(key);
      if (shouldRemove) {
        if (currentlyAdded) {
          this._removeKeybinding(key);
          this._passthroughAdded.delete(key);
          journal(`Removed keybinding ${key} (passthrough window focused)`);
        }
      } else {
        if (!currentlyAdded) {
          this._addKeybinding(key);
          this._passthroughAdded.add(key);
          journal(`Re-added keybinding ${key} (passthrough window lost focus)`);
        }
      }
    }
  }

  disable() {
    // Disconnect signal
    if (this._focusSignalId) {
      global.display.disconnect(this._focusSignalId);
      this._focusSignalId = null;
    }

    // Remove all keybindings
    if (this._bindingsByKey) {
      for (const key of this._bindingsByKey.keys()) {
        Main.wm.removeKeybinding(key);
        this._settings.reset(key);
      }
      this._bindingsByKey = null;
    }

    this._settings = null;
    this._passthroughAdded = null;

    journal('Extension disabled: all cleaned.');
  }
}