// ==================== KEYBINDINGS DATA ====================
// Single source of truth for every keybinding this extension defines:
// which GSettings key backs it, its default accelerator, what command
// it runs, and its human-readable label. Both extension.js (to seed
// defaults and dispatch commands) and prefs.js (to build the editor UI)
// import this same array — edit a keybinding here once, nowhere else.
export const KEYBINDINGS = [
    { key: 'kb-1', accel: '<Super>grave', command: 'gnomeutils-call --interface windows AlignWindowsOfFocusedWindowWMClass', description: 'Align windows of focused window\'s app' },
    { key: 'kb-2', accel: '<Super>a', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 0', description: 'Switch to workspace 1' },
    { key: 'kb-3', accel: '<Super>n', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 1', description: 'Switch to workspace 2' },
    { key: 'kb-4', accel: '<Super>f', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 2', description: 'Switch to workspace 3' },
    { key: 'kb-5', accel: '<Super>c', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 3', description: 'Switch to workspace 4' },
    { key: 'kb-6', accel: '<Super>b', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 4', description: 'Switch to workspace 5' },
    { key: 'kb-7', accel: '<Super>v', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 5', description: 'Switch to workspace 6' },
    { key: 'kb-8', accel: '<Super>r', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 6', description: 'Switch to workspace 7' },
    { key: 'kb-9', accel: '<Super>x', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 7', description: 'Switch to workspace 8' },
    { key: 'kb-10', accel: '<Super>s', command: 'topnotch-call ToggleSelectedWindow', description: 'Toggle selection on focused window' },
    { key: 'kb-11', accel: '<Super>Delete', command: 'topnotch-call CloseNotSelectedWindows', description: 'Close windows not selected, on current workspace' },
    { key: 'kb-13', accel: '<Super>Tab', command: 'gnomeutils-call -i workspaces ToggleWorkspaces', description: 'Toggle workspaces overview' },
    { key: 'kb-14', accel: 'Print', command: 'gdmenu-screenshot', description: 'Take a screenshot' },
    { key: 'kb-15', accel: '<Super>o', command: 'open-file-path', description: 'Open file path', passthroughWmClass: ['VSCodium'] },
    { key: 'kb-16', accel: '<Super>q', command: 'capture2text', description: 'Capture text (OCR)' },
];

// Bump this whenever a default accel, passthrough list, or the set of
// active keys above changes. On the next enable() (or the next time
// prefs is opened) every persisted value is rewritten from this file.
// Do NOT bump for edits that must preserve existing user customizations.
export const KEYBINDINGS_VERSION = 1;

/**
 * Seed / migrate keybinding defaults.
 *
 *   - stored version < KEYBINDINGS_VERSION  →  force-overwrite every
 *     binding AND its passthrough list with the current defaults, reset
 *     retired slots (e.g. the old kb-11/kb-12 mark+pin toggles), and
 *     stamp the new version. User customizations are intentionally lost
 *     — the developer bumped the version, which is the "apply new
 *     defaults" signal.
 *
 *   - stored version up to date             →  seed only empty slots,
 *     leaving any user customization intact. This is the normal
 *     first-install path.
 *
 * Returns true if the version-gated migration ran. Idempotent: a second
 * call after a successful migration is a no-op.
 */
export function seedKeybindingDefaults(settings) {
    const stored = settings.get_int('keybindings-version');

    if (stored < KEYBINDINGS_VERSION) {
        for (const { key, accel, passthroughWmClass } of KEYBINDINGS) {
            settings.set_strv(key, [accel]);
            settings.set_strv(`${key}-passthrough`, passthroughWmClass || []);
        }

        // Reset slots that no longer appear in KEYBINDINGS. The schema
        // still declares them (removing a key would break existing
        // installs), but leaving stale values in GSettings is confusing.
        const activeKeys = new Set(KEYBINDINGS.map(b => b.key));
        for (const schemaKey of settings.list_keys()) {
            if (!/^kb-\d+(-passthrough)?$/.test(schemaKey)) continue;
            const base = schemaKey.replace(/-passthrough$/, '');
            if (!activeKeys.has(base))
                settings.reset(schemaKey);
        }

        settings.set_int('keybindings-version', KEYBINDINGS_VERSION);
        return true;
    }

    for (const { key, accel, passthroughWmClass } of KEYBINDINGS) {
        if (settings.get_strv(key).length === 0)
            settings.set_strv(key, [accel]);

        const pKey = `${key}-passthrough`;
        if (settings.get_strv(pKey).length === 0)
            settings.set_strv(pKey, passthroughWmClass || []);
    }
    return false;
}