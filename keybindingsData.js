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
    { key: 'kb-10', accel: '<Super>Delete', command: 'gnomeutils-call --interface tagged CloseOtherNotMarkedWindowsCurrentWorkspaceOfFocusedWindowWMClass', description: 'Close windows not marked, on current workspace' },
    { key: 'kb-11', accel: '<Super>m', command: 'gnomeutils-call -i tagged ToggleMarksFocusedWindow', description: 'Toggle mark on focused window' },
    { key: 'kb-12', accel: '<Super>p', command: 'gnomeutils-call -i tagged TogglePinsFocusedWindow', description: 'Toggle pin on focused window' },
    { key: 'kb-13', accel: '<Super>Tab', command: 'gnomeutils-call -i workspaces ToggleWorkspaces', description: 'Toggle workspaces overview' },
    { key: 'kb-14', accel: 'Print', command: 'gdmenu-screenshot', description: 'Take a screenshot' },
    { key: 'kb-15', accel: '<Super>w', command: 'gdmenu-activity-overview', description: 'Open activity overview' },
    { key: 'kb-16', accel: '<Super>o', command: 'open-file-path', description: 'Open file path' },
    { key: 'kb-17', accel: '<Super>q', command: 'capture2text', description: 'Capture text (OCR)' },
];
