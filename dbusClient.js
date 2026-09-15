import Gio from 'gi://Gio';

import { createLogger } from './logger.js';
const journal = createLogger(import.meta.url);

// ==================== GENERIC DBUS CLIENT CALL ====================
// One place that knows the shape of Gio.DBus.session.call() so every
// caller in this extension gets the same logging and error handling
// instead of repeating the nine-argument call and a bespoke callback.
//
// `parameters` is a GLib.Variant tuple (e.g. new GLib.Variant('(u)', [n]))
// or null for a method with no in-args. `replyType` is a GLib.VariantType
// for the expected reply, or null if the method returns nothing.
//
// Fire-and-forget: doesn't block the caller, doesn't throw — failures
// (service not running, method missing, method threw) are logged and
// swallowed, since callers here are typically key/signal handlers that
// have no useful way to surface an error back to the user anyway.
export function callDBusMethod(busName, objectPath, interfaceName, methodName, parameters = null, replyType = null) {
    Gio.DBus.session.call(
        busName,
        objectPath,
        interfaceName,
        methodName,
        parameters,
        replyType,
        Gio.DBusCallFlags.NONE,
        -1,
        null,
        (connection, result) => {
            try {
                connection.call_finish(result);
                journal(`[callDBusMethod] ${interfaceName}.${methodName} succeeded`);
            } catch (e) {
                journal(`[callDBusMethod] ${interfaceName}.${methodName} failed: ${e.message}`, true);
            }
        },
    );
}
