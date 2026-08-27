// ==================== KEYBINDING DEFINITIONS STORE ====================
// Single source of truth for keybindings: a JSON array stored in the
// 'keybinding-definitions' GSettings key, each entry shaped
// { id, description, command, accel, slot }. `slot` is an index into a
// fixed pool of real slot-N GSettings keys (Main.wm.addKeybinding needs
// an actual `as`-typed key to bind to — it can't bind into a JSON blob
// directly), assigned once when a definition is created and kept
// stable across edits. Both extension.js and prefs.js import this so
// there's exactly one place that knows the data shape and slot rules.

export const MAX_SLOTS = 40;

// Seed data used only the very first time the extension ever runs (empty
// definitions key). After that, GSettings is authoritative — editing
// this array does nothing for existing installs.
export const DEFAULT_KEYBINDINGS = [
    { id: 'kb-1', accel: '<Super>grave', command: 'gnomeutils-call --interface windows AlignWindowsOfFocusedWindowWMClass', description: 'Align windows of focused window\'s app' },
    { id: 'kb-2', accel: '<Super>a', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 0', description: 'Switch to workspace 1' },
    { id: 'kb-3', accel: '<Super>n', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 1', description: 'Switch to workspace 2' },
    { id: 'kb-4', accel: '<Super>f', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 2', description: 'Switch to workspace 3' },
    { id: 'kb-5', accel: '<Super>c', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 3', description: 'Switch to workspace 4' },
    { id: 'kb-6', accel: '<Super>b', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 4', description: 'Switch to workspace 5' },
    { id: 'kb-7', accel: '<Super>v', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 5', description: 'Switch to workspace 6' },
    { id: 'kb-8', accel: '<Super>r', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 6', description: 'Switch to workspace 7' },
    { id: 'kb-9', accel: '<Super>x', command: 'gnomeutils-call -i keybinding SwitchToWorkspace 7', description: 'Switch to workspace 8' },
    { id: 'kb-10', accel: '<Super>Delete', command: 'gnomeutils-call --interface tagged CloseOtherNotMarkedWindowsCurrentWorkspaceOfFocusedWindowWMClass', description: 'Close windows not marked, on current workspace' },
    { id: 'kb-11', accel: '<Super>m', command: 'gnomeutils-call -i tagged ToggleMarksFocusedWindow', description: 'Toggle mark on focused window' },
    { id: 'kb-12', accel: '<Super>p', command: 'gnomeutils-call -i tagged TogglePinsFocusedWindow', description: 'Toggle pin on focused window' },
    { id: 'kb-13', accel: '<Super>Tab', command: 'gnomeutils-call -i workspaces ToggleWorkspaces', description: 'Toggle workspaces overview' },
    { id: 'kb-14', accel: 'Print', command: 'gdmenu-screenshot', description: 'Take a screenshot' },
    { id: 'kb-15', accel: '<Super>w', command: 'gdmenu-activity-overview', description: 'Open activity overview' },
    { id: 'kb-16', accel: '<Super>o', command: 'open-file-path', description: 'Open file path' },
    { id: 'kb-17', accel: '<Super>q', command: 'capture2text', description: 'Capture text (OCR)' },
];

function generateId() {
    return `kb-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function assignSlot(existingDefinitions) {
    const used = new Set(existingDefinitions.map(d => d.slot));
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
        if (!used.has(slot))
            return slot;
    }
    return null; // pool exhausted
}

// Reads the definitions array from GSettings. On first-ever run (empty
// string / '[]' / invalid JSON), seeds it from DEFAULT_KEYBINDINGS with
// slots 0..16 and persists that immediately.
export function loadDefinitions(settings) {
    const raw = settings.get_string('keybinding-definitions');
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        parsed = null;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
        const seeded = DEFAULT_KEYBINDINGS.map((b, i) => ({ ...b, slot: i }));
        saveDefinitions(settings, seeded);
        return seeded;
    }

    return parsed;
}

export function saveDefinitions(settings, definitions) {
    settings.set_string('keybinding-definitions', JSON.stringify(definitions));
}

// Builds a new definition object with a freshly assigned slot, or
// returns null if the slot pool is full (caller should show an error).
export function createDefinition(existingDefinitions, { description, command, accel }) {
    const slot = assignSlot(existingDefinitions);
    if (slot === null)
        return null;
    return {
        id: generateId(),
        description: description || 'Untitled shortcut',
        command: command || '',
        accel: accel || '',
        slot,
    };
}

// Used by import: takes a plain array of {description, command, accel}
// (no slot/id required — those are ours to assign) and rebuilds a full,
// freshly slot-assigned definitions array. Throws on shape errors so
// callers can show a clear message rather than silently importing junk.
export function definitionsFromImport(rawArray) {
    if (!Array.isArray(rawArray))
        throw new Error('Expected a JSON array of keybindings');
    if (rawArray.length > MAX_SLOTS)
        throw new Error(`Too many keybindings (max ${MAX_SLOTS})`);

    const result = [];
    rawArray.forEach((entry, i) => {
        if (!entry || typeof entry !== 'object')
            throw new Error(`Entry ${i} is not an object`);
        if (typeof entry.description !== 'string' || typeof entry.command !== 'string' || typeof entry.accel !== 'string')
            throw new Error(`Entry ${i} is missing description/command/accel as strings`);
        result.push({
            id: typeof entry.id === 'string' ? entry.id : generateId(),
            description: entry.description,
            command: entry.command,
            accel: entry.accel,
            slot: i,
        });
    });
    return result;
}

// What export writes: strip the internal `slot` field since it's
// meaningless outside this install's pool — on import, slots are always
// reassigned fresh from array order.
export function definitionsForExport(definitions) {
    return definitions.map(({ id, description, command, accel }) => ({ id, description, command, accel }));
}

export function findAccelConflict(definitions, ownId, accel) {
    return definitions.find(d => d.id !== ownId && d.accel === accel) ?? null;
}
