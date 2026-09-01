import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { KEYBINDINGS } from './keybindingsData.js';

import {
  initLogging,
  createLogger,
} from './logger.js';

const journal = createLogger(import.meta.url);

const MODIFIER_KEYVALS = [
  [Clutter.ModifierType.SUPER_MASK, Clutter.KEY_Super_L],
  [Clutter.ModifierType.CONTROL_MASK, Clutter.KEY_Control_L],
  [Clutter.ModifierType.SHIFT_MASK, Clutter.KEY_Shift_L],
  [Clutter.ModifierType.MOD1_MASK, Clutter.KEY_Alt_L],
];

const RAW_MODIFIER_FOR_PARSED_MASK = [
  [Clutter.ModifierType.SHIFT_MASK, Clutter.ModifierType.SHIFT_MASK],
  [Clutter.ModifierType.CONTROL_MASK, Clutter.ModifierType.CONTROL_MASK],
  [Clutter.ModifierType.MOD1_MASK, Clutter.ModifierType.MOD1_MASK],
  [Clutter.ModifierType.SUPER_MASK, Clutter.ModifierType.MOD4_MASK],
];

export default class ExampleExtension extends Extension {
  enable() {
    initLogging(this.uuid, 'both', false);
    journal(`Enabled`);

    this._settings = this.getSettings(
      'org.gnome.shell.extensions.define-keybindings-by-blueray453'
    );

    this._virtualKeyboard = Clutter.get_default_backend()
      .get_default_seat()
      .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    journal(`[init] virtualKeyboard created: ${!!this._virtualKeyboard}`);

    this._pendingForwardTimeoutId = null;
    this._regrabTimeoutId = null;
    this._bindingsByKey = new Map(KEYBINDINGS.map(b => [b.key, b]));

    for (const { key, accel } of KEYBINDINGS) {
      if (this._settings.get_strv(key).length === 0)
        this._settings.set_strv(key, [accel]);

      this._addKeybinding(key);
    }
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

  _onKeyPress(key) {
    const entry = this._bindingsByKey?.get(key);
    if (!entry) return;

    if (entry.passthroughWmClass && this._focusedWmClassIs(entry.passthroughWmClass)) {
      journal(`Keybinding triggered: ${key} — forwarding ${entry.accel} to ${entry.passthroughWmClass}`);
      this._forwardAccelerator(key, entry.accel);
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

    const match = candidates.some(
      wc => actual.toLowerCase() === wc.toLowerCase()
    );

    journal(`[passthrough] wm_class="${actual}" candidates=[${candidates.join(', ')}] match=${match}`);
    return match;
  }

  _forwardAccelerator(key, accel) {
    journal(`[forward] parsing accelerator: "${accel}"`);

    let ok, keyval, mask;
    try {
      [ok, keyval, mask] = Gtk.accelerator_parse(accel);
    } catch (e) {
      journal(`[forward] EXCEPTION calling Gtk.accelerator_parse: ${e}`, true);
      return;
    }

    if (!ok) {
      journal(`[forward] FAILED to parse accelerator: ${accel}`, true);
      return;
    }
    if (!this._virtualKeyboard) {
      journal(`[forward] FAILED: _virtualKeyboard is null/undefined`, true);
      return;
    }

    const rawWaitMask = RAW_MODIFIER_FOR_PARSED_MASK
      .filter(([parsedBit]) => (mask & parsedBit) !== 0)
      .reduce((acc, [, rawBit]) => acc | rawBit, 0);

    this._waitForModifiersReleased(rawWaitMask, () => {
      journal(`[forward] removing grab for ${key} before injecting`);
      Main.wm.removeKeybinding(key);

      this._injectKeypress(keyval, mask);

      if (this._regrabTimeoutId) {
        GLib.source_remove(this._regrabTimeoutId);
        this._regrabTimeoutId = null;
      }

      this._regrabTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
        journal(`[forward] re-adding grab for ${key}`);
        this._addKeybinding(key);
        this._regrabTimeoutId = null;
        return GLib.SOURCE_REMOVE;
      });
    });
  }

  _waitForModifiersReleased(rawWaitMask, onReleased) {
    if (rawWaitMask === 0) {
      onReleased();
      return;
    }

    let attempts = 0;
    const MAX_ATTEMPTS = 40;

    this._pendingForwardTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 25, () => {
      const [, , modifiers] = global.get_pointer();
      attempts++;
      const relevant = modifiers & rawWaitMask;

      journal(`[forward] poll #${attempts}: modifiers=0b${modifiers.toString(2)} relevant=0b${relevant.toString(2)}`);

      if (relevant === 0) {
        journal(`[forward] modifiers released after ${attempts} poll(s)`);
        this._pendingForwardTimeoutId = null;
        onReleased();
        return GLib.SOURCE_REMOVE;
      }

      if (attempts >= MAX_ATTEMPTS) {
        journal(`[forward] gave up waiting for modifier release after ${attempts} polls — injecting anyway`, true);
        this._pendingForwardTimeoutId = null;
        onReleased();
        return GLib.SOURCE_REMOVE;
      }

      return GLib.SOURCE_CONTINUE;
    });
  }

  _injectKeypress(keyval, mask) {
    const modifiers = MODIFIER_KEYVALS
      .filter(([m]) => (mask & m) !== 0)
      .map(([, kv]) => kv);

    const now = Clutter.get_current_event_time() * 1000;
    journal(`[forward] injecting with eventTime=${now}`);

    try {
      for (const mod of modifiers)
        this._virtualKeyboard.notify_keyval(now, mod, Clutter.KeyState.PRESSED);

      this._virtualKeyboard.notify_keyval(now, keyval, Clutter.KeyState.PRESSED);
      this._virtualKeyboard.notify_keyval(now, keyval, Clutter.KeyState.RELEASED);

      for (const mod of modifiers.slice().reverse())
        this._virtualKeyboard.notify_keyval(now, mod, Clutter.KeyState.RELEASED);

      journal(`[forward] done — all events sent without throwing`);
    } catch (e) {
      journal(`[forward] EXCEPTION during notify_keyval sequence: ${e}`, true);
    }
  }

  disable() {
    if (this._pendingForwardTimeoutId) {
      GLib.source_remove(this._pendingForwardTimeoutId);
      this._pendingForwardTimeoutId = null;
    }
    if (this._regrabTimeoutId) {
      GLib.source_remove(this._regrabTimeoutId);
      this._regrabTimeoutId = null;
    }
    if (!this._bindingsByKey) return;
    for (const key of this._bindingsByKey.keys()) {
      Main.wm.removeKeybinding(key);
      this._settings.reset(key);
    }
    this._bindingsByKey = null;
    this._settings = null;
    this._virtualKeyboard = null;

    journal('Extension disabled: all cleaned.');
  }
}