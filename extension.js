import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { KEYBINDINGS } from './keybindingsData.js';
import { initLogging, createLogger } from './logger.js';

const journal = createLogger(import.meta.url);

// Keyvals to synthesize for each parsed-accelerator modifier bit.
const MODIFIER_INFO = [
  { parsedBit: Clutter.ModifierType.SHIFT_MASK, keyval: Clutter.KEY_Shift_L },
  { parsedBit: Clutter.ModifierType.CONTROL_MASK, keyval: Clutter.KEY_Control_L },
  { parsedBit: Clutter.ModifierType.MOD1_MASK, keyval: Clutter.KEY_Alt_L },
  { parsedBit: Clutter.ModifierType.SUPER_MASK, keyval: Clutter.KEY_Super_L },
];

// Same modifiers, mapped to the RAW hardware modifier bit reported by
// global.get_pointer() for the same physical key. Super is the odd one
// out: accelerator parsing normalizes it to SUPER_MASK, but raw
// pointer/modifier state reports it as MOD4_MASK.
const RAW_MODIFIER_FOR_PARSED_MASK = [
  [Clutter.ModifierType.SHIFT_MASK, Clutter.ModifierType.SHIFT_MASK],
  [Clutter.ModifierType.CONTROL_MASK, Clutter.ModifierType.CONTROL_MASK],
  [Clutter.ModifierType.MOD1_MASK, Clutter.ModifierType.MOD1_MASK],
  [Clutter.ModifierType.SUPER_MASK, Clutter.ModifierType.MOD4_MASK],
];

// How long to leave the keybinding grab dropped after injecting, so the
// synthetic keypress has time to actually reach the focused app before
// Shell starts intercepting Super+O again.
const REGRAB_DELAY_MS = 150;

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

    this._regrabTimeoutId = null;
    this._bindingsByKey = new Map(KEYBINDINGS.map(b => [b.key, b]));

    for (const { key, accel } of KEYBINDINGS) {
      // Only seed the default if nothing's been saved yet (schema
      // defaults are now empty arrays — the real default accelerator
      // lives only in keybindingsData.js). Never overwrite a value
      // prefs.js has already set.
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

    // 1. Remove the shell's keybinding so it won't intercept our synthetic events
    journal(`[forward] removing grab for ${key} before injecting`);
    Main.wm.removeKeybinding(key);

    const now = Clutter.CURRENT_TIME;
    const superKeyval = Clutter.KEY_Super_L;   // the left Super key

    try {
      // 2. Programmatically release BOTH Super and O
      //    This clears the "already down" state so a fresh press is accepted.
      this._virtualKeyboard.notify_keyval(now, superKeyval, Clutter.KeyState.RELEASED);
      this._virtualKeyboard.notify_keyval(now, keyval, Clutter.KeyState.RELEASED);

      // 3. Re‑inject the full Super+O sequence:
      //    press Super, press O, release O, release Super.
      this._virtualKeyboard.notify_keyval(now, superKeyval, Clutter.KeyState.PRESSED);
      this._virtualKeyboard.notify_keyval(now, keyval, Clutter.KeyState.PRESSED);
      this._virtualKeyboard.notify_keyval(now, keyval, Clutter.KeyState.RELEASED);
      this._virtualKeyboard.notify_keyval(now, superKeyval, Clutter.KeyState.RELEASED);

      journal(`[forward] Released and re‑injected Super+O`);
    } catch (e) {
      journal(`[forward] EXCEPTION during notify_keyval sequence: ${e}`, true);
    }

    // 4. Re‑add the keybinding after a short delay so the events reach the app
    if (this._regrabTimeoutId) {
      GLib.source_remove(this._regrabTimeoutId);
      this._regrabTimeoutId = null;
    }

    this._regrabTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REGRAB_DELAY_MS, () => {
      journal(`[forward] re-adding grab for ${key}`);
      this._addKeybinding(key);
      this._regrabTimeoutId = null;
      return GLib.SOURCE_REMOVE;
    });
  }

  _injectKeypress(keyval, mask) {
    const modifiersInAccel = MODIFIER_INFO
      .filter(({ parsedBit }) => (mask & parsedBit) !== 0)
      .map(({ keyval: kv }) => kv);

    journal(`[forward] modifiers to synthesize: [${modifiersInAccel.map(k => k.toString(16)).join(', ')}]`);

    const now = Clutter.CURRENT_TIME;

    try {
      for (const mod of modifiersInAccel)
        this._virtualKeyboard.notify_keyval(now, mod, Clutter.KeyState.PRESSED);

      this._virtualKeyboard.notify_keyval(now, keyval, Clutter.KeyState.PRESSED);
      this._virtualKeyboard.notify_keyval(now, keyval, Clutter.KeyState.RELEASED);

      for (const mod of modifiersInAccel.slice().reverse())
        this._virtualKeyboard.notify_keyval(now, mod, Clutter.KeyState.RELEASED);

      journal(`[forward] done — all events sent without throwing`);
    } catch (e) {
      journal(`[forward] EXCEPTION during notify_keyval sequence: ${e}`, true);
    }
  }

  disable() {
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