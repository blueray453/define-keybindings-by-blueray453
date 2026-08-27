import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Adw from 'gi://Adw';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    loadDefinitions, saveDefinitions, createDefinition,
    definitionsFromImport, definitionsForExport, findAccelConflict, MAX_SLOTS,
} from './keybindingsStore.js';

export default class DefineKeybindingsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'Keybindings',
            icon_name: 'input-keyboard-symbolic',
        });
        window.add(page);

        this._group = new Adw.PreferencesGroup({
            title: 'Shortcuts',
            description: 'Click a shortcut to change it.',
        });
        page.add(this._group);

        const addRow = new Adw.ActionRow({ title: 'Add a new shortcut' });
        const addBtn = new Gtk.Button({ icon_name: 'list-add-symbolic', valign: Gtk.Align.CENTER, css_classes: ['flat'] });
        addBtn.connect('clicked', () => this._openEditDialog(window, settings, null));
        addRow.add_suffix(addBtn);
        addRow.set_activatable_widget(addBtn);
        this._group.add(addRow);

        // ---- Import / Export ----
        const ioGroup = new Adw.PreferencesGroup({
            title: 'Backup',
            description: 'Save or load your shortcuts as a JSON file',
        });
        page.add(ioGroup);

        const ioRow = new Adw.ActionRow({ title: 'Shortcuts file' });
        const exportBtn = new Gtk.Button({ label: 'Export…', valign: Gtk.Align.CENTER });
        exportBtn.connect('clicked', () => this._onExportClicked(window, settings));
        ioRow.add_suffix(exportBtn);
        const importBtn = new Gtk.Button({ label: 'Import…', valign: Gtk.Align.CENTER });
        importBtn.connect('clicked', () => this._onImportClicked(window, settings));
        ioRow.add_suffix(importBtn);
        ioGroup.add(ioRow);

        this._rowWidgets = [];
        this._rebuildRows(settings, window);

        // Keeps prefs in sync if definitions change from elsewhere (import,
        // or — in principle — a second open prefs window).
        this._definitionsChangedId = settings.connect(
            'changed::keybinding-definitions', () => this._rebuildRows(settings, window));

        window.connect('close-request', () => {
            if (this._definitionsChangedId) {
                settings.disconnect(this._definitionsChangedId);
                this._definitionsChangedId = null;
            }
            return false;
        });
    }

    _rebuildRows(settings, window) {
        for (const row of this._rowWidgets)
            this._group.remove(row);
        this._rowWidgets = [];

        const definitions = loadDefinitions(settings);
        for (const def of definitions) {
            const row = this._buildRow(settings, def, window);
            this._rowWidgets.push(row);
            this._group.add(row);
        }
    }

    _buildRow(settings, def, window) {
        const row = new Adw.ActionRow({
            title: def.description,
            subtitle: def.command,
        });

        const shortcutLabel = new Gtk.ShortcutLabel({
            accelerator: def.accel || '',
            disabled_text: 'Disabled',
            valign: Gtk.Align.CENTER,
        });
        const editBtn = new Gtk.Button({ child: shortcutLabel, valign: Gtk.Align.CENTER, css_classes: ['flat'] });
        editBtn.connect('clicked', () => this._openEditDialog(window, settings, def));
        row.add_suffix(editBtn);

        const removeBtn = new Gtk.Button({
            icon_name: 'user-trash-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: 'Remove',
        });
        removeBtn.connect('clicked', () => this._removeDefinition(settings, def.id));
        row.add_suffix(removeBtn);

        row.set_activatable_widget(editBtn);
        return row;
    }

    _removeDefinition(settings, id) {
        const definitions = loadDefinitions(settings).filter(d => d.id !== id);
        saveDefinitions(settings, definitions);
        // 'changed::keybinding-definitions' fires _rebuildRows automatically.
    }

    // One dialog handles both "add" (existingDef === null) and "edit"
    // (existingDef set) — same fields, same validation.
    _openEditDialog(window, settings, existingDef) {
        const isNew = existingDef === null;
        const dialog = new Adw.Window({
            transient_for: window,
            modal: true,
            default_width: 420,
            default_height: 320,
            title: isNew ? 'Add Shortcut' : 'Edit Shortcut',
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 24, margin_bottom: 24, margin_start: 24, margin_end: 24,
        });

        const descEntry = new Gtk.Entry({ text: existingDef?.description ?? '', placeholder_text: 'Description' });
        box.append(new Gtk.Label({ label: 'Description', xalign: 0 }));
        box.append(descEntry);

        const cmdEntry = new Gtk.Entry({ text: existingDef?.command ?? '', placeholder_text: 'Command to run' });
        box.append(new Gtk.Label({ label: 'Command', xalign: 0 }));
        box.append(cmdEntry);

        box.append(new Gtk.Label({ label: 'Shortcut', xalign: 0 }));
        const shortcutPreview = new Gtk.ShortcutLabel({ accelerator: existingDef?.accel ?? '', halign: Gtk.Align.START });
        let capturedAccel = existingDef?.accel ?? '';
        const captureBtn = new Gtk.Button({ child: shortcutPreview, halign: Gtk.Align.START });

        const status = new Gtk.Label({ label: '', css_classes: ['error'], wrap: true, xalign: 0 });
        box.append(status);

        captureBtn.connect('clicked', () => {
            captureBtn.set_label('Press a key combination…');
            const controller = new Gtk.EventControllerKey();
            dialog.add_controller(controller);
            const handlerId = controller.connect('key-pressed', (ctrl, keyval, keycode, state) => {
                if (keyval === Gdk.KEY_Escape) {
                    dialog.remove_controller(controller);
                    shortcutPreview.set_accelerator(capturedAccel);
                    captureBtn.set_child(shortcutPreview);
                    return true;
                }
                if (keyval === Gdk.KEY_BackSpace) {
                    capturedAccel = '';
                    shortcutPreview.set_accelerator('');
                    dialog.remove_controller(controller);
                    captureBtn.set_child(shortcutPreview);
                    return true;
                }
                const mask = state & Gtk.accelerator_get_default_mod_mask();
                if (!Gtk.accelerator_valid(keyval, mask))
                    return true;
                if ([Gdk.KEY_Shift_L, Gdk.KEY_Shift_R, Gdk.KEY_Control_L, Gdk.KEY_Control_R,
                Gdk.KEY_Alt_L, Gdk.KEY_Alt_R, Gdk.KEY_Super_L, Gdk.KEY_Super_R,
                Gdk.KEY_Meta_L, Gdk.KEY_Meta_R].includes(keyval))
                    return true;

                capturedAccel = Gtk.accelerator_name(keyval, mask);
                shortcutPreview.set_accelerator(capturedAccel);
                dialog.remove_controller(controller);
                captureBtn.set_child(shortcutPreview);
                return true;
            });
        });
        box.append(captureBtn);

        const buttonBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8, halign: Gtk.Align.END });
        const cancelBtn = new Gtk.Button({ label: 'Cancel' });
        cancelBtn.connect('clicked', () => dialog.close());
        const saveBtn = new Gtk.Button({ label: isNew ? 'Add' : 'Save', css_classes: ['suggested-action'] });
        saveBtn.connect('clicked', () => {
            const definitions = loadDefinitions(settings);
            const conflict = capturedAccel ? findAccelConflict(definitions, existingDef?.id ?? null, capturedAccel) : null;
            if (conflict) {
                status.set_label(`Shortcut already used by "${conflict.description}"`);
                return;
            }

            if (isNew) {
                const created = createDefinition(definitions, {
                    description: descEntry.get_text(), command: cmdEntry.get_text(), accel: capturedAccel,
                });
                if (!created) {
                    status.set_label(`No free slots left (max ${MAX_SLOTS})`);
                    return;
                }
                definitions.push(created);
            } else {
                const idx = definitions.findIndex(d => d.id === existingDef.id);
                if (idx !== -1) {
                    definitions[idx] = {
                        ...definitions[idx],
                        description: descEntry.get_text(),
                        command: cmdEntry.get_text(),
                        accel: capturedAccel,
                    };
                }
            }

            saveDefinitions(settings, definitions);
            dialog.close();
        });
        buttonBox.append(cancelBtn);
        buttonBox.append(saveBtn);
        box.append(buttonBox);

        dialog.set_content(box);
        dialog.present();
    }

    _onExportClicked(window, settings) {
        const dialog = new Gtk.FileChooserNative({
            title: 'Export Shortcuts', transient_for: window,
            action: Gtk.FileChooserAction.SAVE, accept_label: '_Save', cancel_label: '_Cancel',
        });
        dialog.set_current_name('keybindings.json');
        const filter = new Gtk.FileFilter();
        filter.set_name('JSON files');
        filter.add_pattern('*.json');
        dialog.add_filter(filter);

        dialog.connect('response', (self, id) => {
            if (id === Gtk.ResponseType.ACCEPT) {
                try {
                    const file = dialog.get_file();
                    const data = definitionsForExport(loadDefinitions(settings));
                    const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2));
                    file.replace_contents(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                } catch (e) {
                    this._showError(window, `Export failed: ${e.message}`);
                }
            }
            dialog.destroy();
        });
        dialog.show();
    }

    _onImportClicked(window, settings) {
        const dialog = new Gtk.FileChooserNative({
            title: 'Import Shortcuts', transient_for: window,
            action: Gtk.FileChooserAction.OPEN, accept_label: '_Open', cancel_label: '_Cancel',
        });
        const filter = new Gtk.FileFilter();
        filter.set_name('JSON files');
        filter.add_pattern('*.json');
        dialog.add_filter(filter);

        dialog.connect('response', (self, id) => {
            if (id === Gtk.ResponseType.ACCEPT) {
                try {
                    const file = dialog.get_file();
                    const [, contents] = file.load_contents(null);
                    const raw = JSON.parse(new TextDecoder().decode(contents));
                    const definitions = definitionsFromImport(raw);
                    saveDefinitions(settings, definitions);
                } catch (e) {
                    this._showError(window, `Import failed: ${e.message}`);
                }
            }
            dialog.destroy();
        });
        dialog.show();
    }

    _showError(window, message) {
        const dialog = new Adw.AlertDialog({ heading: 'Keybindings', body: message });
        dialog.add_response('ok', 'OK');
        dialog.present(window);
    }
}