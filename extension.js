import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { KEYBINDINGS } from './keybindingsData.js';
import { callDBusMethod } from './dbusClient.js';
import { initLogging, createLogger } from './logger.js';

const journal = createLogger(import.meta.url);

const SETTINGS_SCHEMA = 'org.gnome.shell.extensions.define-keybindings-by-blueray453';

// Cross-extension: TopNotchWorkspaces' overlay service.
const TOPNOTCH_BUS_NAME = 'io.github.blueray453.TopNotchWorkspaces';
const TOPNOTCH_OVERLAY_PATH = '/io/github/blueray453/TopNotchWorkspaces/Overlay';
const TOPNOTCH_OVERLAY_IFACE = 'io.github.blueray453.TopNotchWorkspaces.Overlay';

// ---------------------------------------------------------------------------
// Module state.
// ---------------------------------------------------------------------------
const state = {
  settings: null,
  bindingsByKey: null,     // Map: key -> KEYBINDINGS entry
  passthroughAdded: null,  // Set: keys whose binding is currently registered
  focusSignalId: 0,
  passthroughChangedIds: [],
  overlayKeyHandlerId: 0,
  originalOverlayHandlerId: 0,
};

// ---------------------------------------------------------------------------
// Settings helpers.
// ---------------------------------------------------------------------------

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
// Overlay key (bare Super).
//
// GNOME's native overlay-key handler (on global.display) toggles the overview.
// We block that handler and connect our own, which hides the overview (if
// visible) and asks TopNotchWorkspaces to toggle its all-apps overlay.
//
// No settings involved — the override is active whenever this extension is
// enabled and restored on disable.
// ---------------------------------------------------------------------------

function onSuperKeyPressed() {
  if (Main.overview.visibleTarget)
    Main.overview.hide();

  callDBusMethod(
    TOPNOTCH_BUS_NAME, TOPNOTCH_OVERLAY_PATH, TOPNOTCH_OVERLAY_IFACE,
    'ToggleAllApps',
  );
}

function enableOverlayKeyOverride() {
  if (state.overlayKeyHandlerId !== 0)
    return;

  state.originalOverlayHandlerId = GObject.signal_handler_find(
    global.display,
    { signalId: 'overlay-key' },
  );

  if (state.originalOverlayHandlerId !== 0) {
    global.display.block_signal_handler(state.originalOverlayHandlerId);
    journal(`Blocked original overlay-key handler (ID: ${state.originalOverlayHandlerId})`);
  } else {
    journal('No original overlay-key handler found to block.');
  }

  state.overlayKeyHandlerId = global.display.connect('overlay-key', onSuperKeyPressed);
  journal(`Connected custom overlay-key handler (ID: ${state.overlayKeyHandlerId})`);
}

function disableOverlayKeyOverride() {
  if (state.overlayKeyHandlerId !== 0) {
    global.display.disconnect(state.overlayKeyHandlerId);
    state.overlayKeyHandlerId = 0;
    journal('Disconnected custom overlay-key handler');
  }

  if (state.originalOverlayHandlerId !== 0) {
    global.display.unblock_signal_handler(state.originalOverlayHandlerId);
    state.originalOverlayHandlerId = 0;
    journal('Unblocked original overlay-key handler');
  }
}

// ---------------------------------------------------------------------------
// Lifecycle.
// ---------------------------------------------------------------------------

function setup() {
  state.bindingsByKey = new Map(KEYBINDINGS.map(b => [b.key, b]));
  state.passthroughAdded = new Set();
  state.focusSignalId = 0;
  state.passthroughChangedIds = [];
  state.overlayKeyHandlerId = 0;
  state.originalOverlayHandlerId = 0;

  seedDefaults();

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
  enableOverlayKeyOverride();
}

function teardown() {
  disableOverlayKeyOverride();

  if (state.focusSignalId) {
    global.display.disconnect(state.focusSignalId);
    state.focusSignalId = 0;
  }

  for (const id of state.passthroughChangedIds)
    state.settings.disconnect(id);
  state.passthroughChangedIds = [];

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
// ---------------------------------------------------------------------------

export default class DefineKeybindingsExtension extends Extension {
  enable() {
    initLogging(this.uuid, 'both', false);
    journal('Enabled');

    state.settings = this.getSettings(SETTINGS_SCHEMA);

    setup();

    journal('Extension enabled with dynamic passthrough management');
  }

  disable() {
    teardown();
    journal('Extension disabled: all cleaned.');
  }
}