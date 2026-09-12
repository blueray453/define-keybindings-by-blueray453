import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { KEYBINDINGS } from './keybindingsData.js';
import { initLogging, createLogger } from './logger.js';

const journal = createLogger(import.meta.url);

const SETTINGS_SCHEMA = 'org.gnome.shell.extensions.define-keybindings-by-blueray453';

// ---------------------------------------------------------------------------
// Module state.
//
// Everything the extension tracks at runtime lives here, not on the Extension
// instance. The logic below is plain functions reading and writing this
// object, so there is exactly one place to look for "what state does this
// extension keep".
// ---------------------------------------------------------------------------
const state = {
  settings: null,
  bindingsByKey: null,     // Map: key -> KEYBINDINGS entry
  passthroughAdded: null,  // Set: keys whose binding is currently registered
  focusSignalId: 0,
  passthroughChangedIds: [],
};

// ---------------------------------------------------------------------------
// Settings helpers.
// ---------------------------------------------------------------------------

// Seed defaults from keybindingsData.js (SSOT). Only writes when the stored
// value is empty, so user customizations are never overwritten on re-enable.
function seedDefaults() {
  for (const { key, accel, passthroughWmClass } of KEYBINDINGS) {
    if (state.settings.get_strv(key).length === 0)
      state.settings.set_strv(key, [accel]);

    const pKey = `${key}-passthrough`;
    if (state.settings.get_strv(pKey).length === 0)
      state.settings.set_strv(pKey, passthroughWmClass || []);
  }
}

function getPassthroughList(key) {
  const list = state.settings.get_strv(`${key}-passthrough`);
  return list.filter(s => s.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Keybinding registration.
// ---------------------------------------------------------------------------

function addKeybinding(key) {
  Main.wm.addKeybinding(
    key,
    state.settings,
    Meta.KeyBindingFlags.NONE,
    Shell.ActionMode.ALL,
    () => onKeyPress(key),
  );
}

function removeKeybinding(key) {
  Main.wm.removeKeybinding(key);
}

function onKeyPress(key) {
  const entry = state.bindingsByKey.get(key);
  if (!entry) return;

  // Guard: should never happen because passthrough bindings are removed
  // when the focused window matches, but keep as safety net.
  const list = getPassthroughList(key);
  if (list.length > 0 && focusedWmClassIs(list)) {
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

// ---------------------------------------------------------------------------
// Focus / passthrough logic.
// ---------------------------------------------------------------------------

function focusedWmClassIs(wmClassOrClasses) {
  const win = global.display.focus_window;
  const actual = win?.get_wm_class();
  if (!actual) return false;

  const candidates = Array.isArray(wmClassOrClasses)
    ? wmClassOrClasses
    : [wmClassOrClasses];

  return candidates.some(wc => actual.toLowerCase() === wc.toLowerCase());
}

function updatePassthroughBindings() {
  const win = global.display.focus_window;
  const wmClass = win?.get_wm_class()?.toLowerCase();

  for (const [key] of state.bindingsByKey) {
    const list = getPassthroughList(key);
    const shouldRemove = wmClass && list.some(cls => cls.toLowerCase() === wmClass);

    const currentlyAdded = state.passthroughAdded.has(key);
    if (shouldRemove && currentlyAdded) {
      removeKeybinding(key);
      state.passthroughAdded.delete(key);
      journal(`Removed keybinding ${key} (passthrough window focused)`);
    } else if (!shouldRemove && !currentlyAdded) {
      addKeybinding(key);
      state.passthroughAdded.add(key);
      journal(`Re-added keybinding ${key} (passthrough window lost focus)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Lifecycle. Called from the Extension subclass below.
// ---------------------------------------------------------------------------

function setup() {
  state.bindingsByKey = new Map(KEYBINDINGS.map(b => [b.key, b]));
  state.passthroughAdded = new Set();
  state.focusSignalId = 0;
  state.passthroughChangedIds = [];

  // Seed defaults before any addKeybinding() call, because addKeybinding()
  // reads the accelerator from settings.
  seedDefaults();

  // Register every keybinding once. updatePassthroughBindings() at the end
  // reconciles this initial set against the current focus.
  for (const { key } of KEYBINDINGS) {
    addKeybinding(key);
    state.passthroughAdded.add(key);
  }

  state.focusSignalId = global.display.connect('notify::focus-window', updatePassthroughBindings);

  for (const { key } of KEYBINDINGS) {
    const id = state.settings.connect(`changed::${key}-passthrough`, updatePassthroughBindings);
    state.passthroughChangedIds.push(id);
  }

  updatePassthroughBindings();
}

function teardown() {
  if (state.focusSignalId) {
    global.display.disconnect(state.focusSignalId);
    state.focusSignalId = 0;
  }

  for (const id of state.passthroughChangedIds)
    state.settings.disconnect(id);
  state.passthroughChangedIds = [];

  // Remove all keybindings (but DO NOT reset settings).
  if (state.bindingsByKey) {
    for (const key of state.bindingsByKey.keys())
      Main.wm.removeKeybinding(key);
  }

  state.settings = null;
  state.bindingsByKey = null;
  state.passthroughAdded = null;
}

// ---------------------------------------------------------------------------
// Extension entry point.
//
// This class exists only because GNOME Shell requires an Extension subclass
// and because enable/disable hooks and the settings object come from it. All
// the real work is done by the module-level functions above.
// ---------------------------------------------------------------------------

export default class ExampleExtension extends Extension {
  enable() {
    initLogging(this.uuid, 'both', false);
    journal('Enabled');

    // Only getSettings() is reachable from here; stash it on module state
    // before handing off to setup().
    state.settings = this.getSettings(SETTINGS_SCHEMA);

    setup();

    journal('Extension enabled with dynamic passthrough management');
  }

  disable() {
    teardown();
    journal('Extension disabled: all cleaned.');
  }
}