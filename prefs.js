import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Adw from 'gi://Adw';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { KEYBINDINGS } from './keybindingsData.js';

// ---------------------------------------------------------------------------
// Module state.
//
// The prefs window can be built more than once per process (open prefs,
// close, reopen), so this state is reset at the start of every
// fillPreferencesWindow() call. All logic below reads/writes it directly.
// ---------------------------------------------------------------------------
const state = {
    settings: null,
    rows: [],   // { widget, resetToDefault, refreshLabel }
};

function resetState(settings) {
    state.settings = settings;
    state.rows = [];
}

// ---------------------------------------------------------------------------
// Row construction.
// ---------------------------------------------------------------------------

function buildRow(binding, window) {
    const row = new Adw.ActionRow({
        title: binding.description,
        subtitle: binding.command,
    });

    // ---- Shortcut label and editor ----
    const shortcutLabel = new Gtk.ShortcutLabel({
        valign: Gtk.Align.CENTER,
        disabled_text: 'Disabled',
    });

    const readCurrent = () => {
        const strv = state.settings.get_strv(binding.key);
        return strv.length > 0 ? strv[0] : '';
    };

    const refreshLabel = () => {
        shortcutLabel.set_accelerator(readCurrent());
    };
    refreshLabel();

    // Show placeholder default if not yet set
    if (readCurrent() === '')
        shortcutLabel.set_accelerator(binding.accel);

    const changedId = state.settings.connect(`changed::${binding.key}`, refreshLabel);
    row.connect('destroy', () => state.settings.disconnect(changedId));

    const editBtn = new Gtk.Button({
        child: shortcutLabel,
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });
    editBtn.connect('clicked', () => openCaptureDialog(window, binding, refreshLabel));
    row.add_suffix(editBtn);

    // ---- Passthrough editor button ----
    const passthroughLabel = new Gtk.Label({
        label: 'Passthrough',
        css_classes: ['dim-label'],
    });
    const passthroughBtn = new Gtk.Button({
        child: passthroughLabel,
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
        tooltip_text: 'Edit WM classes for passthrough',
    });
    passthroughBtn.connect('clicked', () => openPassthroughDialog(window, binding));
    row.add_suffix(passthroughBtn);

    // ---- Reset to default button ----
    const resetBtn = new Gtk.Button({
        icon_name: 'edit-undo-symbolic',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
        tooltip_text: 'Reset to default',
    });

    const resetToDefault = () => {
        state.settings.set_strv(binding.key, [binding.accel]);
        state.settings.set_strv(`${binding.key}-passthrough`, binding.passthroughWmClass || []);
        refreshLabel();
    };
    resetBtn.connect('clicked', resetToDefault);
    row.add_suffix(resetBtn);

    row.set_activatable_widget(editBtn);

    return { widget: row, resetToDefault, refreshLabel };
}

// ---------------------------------------------------------------------------
// Shortcut capture dialog.
// ---------------------------------------------------------------------------

function isModifierOnly(keyval) {
    return [
        Gdk.KEY_Shift_L, Gdk.KEY_Shift_R,
        Gdk.KEY_Control_L, Gdk.KEY_Control_R,
        Gdk.KEY_Alt_L, Gdk.KEY_Alt_R,
        Gdk.KEY_Super_L, Gdk.KEY_Super_R,
        Gdk.KEY_Meta_L, Gdk.KEY_Meta_R,
    ].includes(keyval);
}

function findConflict(ownKey, accel) {
    for (const binding of KEYBINDINGS) {
        if (binding.key === ownKey) continue;
        const strv = state.settings.get_strv(binding.key);
        if (strv.length > 0 && strv[0] === accel) return binding;
    }
    return null;
}

function openCaptureDialog(window, binding, onSaved) {
    const dialog = new Adw.Window({
        transient_for: window,
        modal: true,
        default_width: 380,
        default_height: 160,
        title: `Set shortcut — ${binding.description}`,
    });

    const box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        margin_top: 24,
        margin_bottom: 24,
        margin_start: 24,
        margin_end: 24,
        valign: Gtk.Align.CENTER,
    });

    box.append(new Gtk.Label({
        label: 'Press a key combination, or Escape to cancel.\nBackspace clears the shortcut.',
        justify: Gtk.Justification.CENTER,
        wrap: true,
    }));

    const preview = new Gtk.ShortcutLabel({ halign: Gtk.Align.CENTER });
    box.append(preview);

    const status = new Gtk.Label({
        label: '',
        css_classes: ['error'],
        wrap: true,
        justify: Gtk.Justification.CENTER,
    });
    box.append(status);

    dialog.set_content(box);

    const controller = new Gtk.EventControllerKey();
    dialog.add_controller(controller);

    controller.connect('key-pressed', (ctrl, keyval, keycode, modState) => {
        if (keyval === Gdk.KEY_Escape) {
            dialog.close();
            return true;
        }
        if (keyval === Gdk.KEY_BackSpace) {
            state.settings.set_strv(binding.key, []);
            onSaved();
            dialog.close();
            return true;
        }

        const mask = modState & Gtk.accelerator_get_default_mod_mask();
        if (!Gtk.accelerator_valid(keyval, mask) || isModifierOnly(keyval))
            return true;

        const accel = Gtk.accelerator_name(keyval, mask);
        preview.set_accelerator(accel);

        const conflict = findConflict(binding.key, accel);
        if (conflict) {
            status.set_label(`Already used by "${conflict.description}"`);
            return true;
        }

        state.settings.set_strv(binding.key, [accel]);
        onSaved();
        dialog.close();
        return true;
    });

    dialog.present();
}

// ---------------------------------------------------------------------------
// Passthrough dialog.
// ---------------------------------------------------------------------------

function openPassthroughDialog(window, binding) {
    const dialog = new Adw.Window({
        transient_for: window,
        modal: true,
        default_width: 400,
        default_height: 200,
        title: `Passthrough classes for "${binding.description}"`,
    });

    const box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        margin_top: 24,
        margin_bottom: 24,
        margin_start: 24,
        margin_end: 24,
    });

    box.append(new Gtk.Label({
        label: 'Enter WM class names (comma‑separated).\nExample: VSCodium, firefox',
        justify: Gtk.Justification.CENTER,
        wrap: true,
    }));

    const entry = new Gtk.Entry({
        placeholder_text: 'e.g., VSCodium, firefox',
        halign: Gtk.Align.FILL,
    });

    const currentList = state.settings.get_strv(`${binding.key}-passthrough`);
    entry.set_text(currentList.join(', '));

    box.append(entry);

    const buttonBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        halign: Gtk.Align.CENTER,
        margin_top: 12,
    });

    const saveBtn = new Gtk.Button({ label: 'Save', css_classes: ['suggested-action'] });
    const cancelBtn = new Gtk.Button({ label: 'Cancel' });

    saveBtn.connect('clicked', () => {
        const text = entry.get_text();
        const items = text.split(',').map(s => s.trim()).filter(s => s.length > 0);
        state.settings.set_strv(`${binding.key}-passthrough`, items);
        dialog.close();
    });

    cancelBtn.connect('clicked', () => dialog.close());

    buttonBox.append(saveBtn);
    buttonBox.append(cancelBtn);
    box.append(buttonBox);

    dialog.set_content(box);
    dialog.present();
}

// ---------------------------------------------------------------------------
// Page construction.
// ---------------------------------------------------------------------------

function buildPage(window) {
    const page = new Adw.PreferencesPage({
        title: 'Keybindings',
        icon_name: 'input-keyboard-symbolic',
    });
    window.add(page);

    const group = new Adw.PreferencesGroup({
        title: 'Shortcuts',
        description: 'Click a shortcut to change it. Use the "Passthrough" button to set WM classes that should bypass this shortcut.',
    });
    page.add(group);

    for (const binding of KEYBINDINGS) {
        const row = buildRow(binding, window);
        state.rows.push(row);
        group.add(row.widget);
    }

    // ---- Reset all ----
    const miscGroup = new Adw.PreferencesGroup();
    page.add(miscGroup);

    const resetRow = new Adw.ActionRow({ title: 'Reset all shortcuts to defaults' });
    const resetBtn = new Gtk.Button({
        label: 'Reset All',
        css_classes: ['destructive-action'],
        valign: Gtk.Align.CENTER,
    });
    resetBtn.connect('clicked', () => {
        for (const row of state.rows)
            row.resetToDefault();
    });
    resetRow.add_suffix(resetBtn);
    resetRow.set_activatable_widget(resetBtn);
    miscGroup.add(resetRow);
}

// ---------------------------------------------------------------------------
// Preferences entry point.
//
// This class exists only because GNOME Shell requires an ExtensionPreferences
// subclass and because getSettings() is only reachable from it. All the real
// work is done by the module-level functions above.
// ---------------------------------------------------------------------------

export default class DefineKeybindingsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        resetState(this.getSettings());
        buildPage(window);
    }
}