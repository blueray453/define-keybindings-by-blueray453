import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { loadDefinitions } from './keybindingsStore.js';
import { initLogging, createLogger } from './logger.js';

const journal = createLogger(import.meta.url);

export default class ExampleExtension extends Extension {
  enable() {
    initLogging(this.uuid, 'both', false);
    journal(`Enabled`);

    this._settings = this.getSettings(
      'org.gnome.shell.extensions.define-keybindings-by-blueray453'
    );

    this._bound = new Map(); // id -> { slot, command }

    const definitions = loadDefinitions(this._settings);
    for (const def of definitions)
      this._bindOne(def);

    this._definitionsChangedId = this._settings.connect(
      'changed::keybinding-definitions', () => this._onDefinitionsChanged());
  }

  _slotName(slot) {
    return `slot-${slot}`;
  }

  _bindOne(def) {
    const slotName = this._slotName(def.slot);
    this._settings.set_strv(slotName, def.accel ? [def.accel] : []);
    Main.wm.addKeybinding(
      slotName,
      this._settings,
      Meta.KeyBindingFlags.NONE,
      Shell.ActionMode.ALL,
      () => this._onKeyPress(def.id)
    );
    this._bound.set(def.id, { slot: def.slot, command: def.command });
  }

  _unbindOne(id, slot) {
    Main.wm.removeKeybinding(this._slotName(slot));
    this._settings.reset(this._slotName(slot));
    this._bound.delete(id);
  }

  // Live add/remove/edit — fires whenever prefs.js (or an import) writes
  // a new definitions array. Diffs against what's currently bound so
  // only what actually changed gets rebound; no shell reload needed.
  _onDefinitionsChanged() {
    const definitions = loadDefinitions(this._settings);
    const newById = new Map(definitions.map(d => [d.id, d]));

    // Removed
    for (const [id, { slot }] of [...this._bound]) {
      if (!newById.has(id))
        this._unbindOne(id, slot);
    }

    // Added or changed
    for (const def of definitions) {
      const existing = this._bound.get(def.id);
      if (!existing) {
        this._bindOne(def);
        continue;
      }
      if (existing.slot !== def.slot) {
        // Shouldn't normally happen (slots are stable once assigned),
        // but handle it defensively rather than leaving a stale bind.
        this._unbindOne(def.id, existing.slot);
        this._bindOne(def);
        continue;
      }
      // Same slot: just refresh accel/command in place. Writing the
      // slot's own settings value is enough for Shell to pick up an
      // accelerator change live — no need to remove/re-add the binding.
      this._settings.set_strv(this._slotName(def.slot), def.accel ? [def.accel] : []);
      existing.command = def.command;
    }
  }

  _onKeyPress(id) {
    const entry = this._bound.get(id);
    if (!entry || !entry.command) return;
    journal(`Keybinding triggered: ${id}`);
    try {
      GLib.spawn_command_line_async(entry.command);
    } catch (e) {
      journal(`Failed to run command for ${id}: ${e}`, true);
    }
  }

  disable() {
    if (this._definitionsChangedId) {
      this._settings.disconnect(this._definitionsChangedId);
      this._definitionsChangedId = null;
    }

    if (this._bound) {
      for (const [id, { slot }] of this._bound)
        this._unbindOne(id, slot);
      this._bound = null;
    }

    this._settings = null;
    journal('Extension disabled: all cleaned.');
  }
}