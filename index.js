const THIRD_PARTY_TEMPLATE_PATH = /^\/scripts\/extensions\/third-party\/.+\.html$/i;
const TAURI_IPC_SIGNATURE = /@typedef\s+\{\{\s*callback:\s*string,\s*error:\s*string,\s*data:\s*\*\s*\}\}/;
const SCRIPT_TAG = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;

function isAndroidTauriRuntime(scope) {
    try {
        return /android/i.test(scope.navigator?.userAgent ?? '')
            && new URL(scope.location?.href).hostname === 'tauri.localhost'
            && !!scope.__TAURI_INTERNALS__;
    } catch {
        return false;
    }
}

/** Keep assigned polyfills callable while preventing for-in from treating them as array elements. */
export function hideEnumerableArrayPrototypeKeys(prototype) {
    const changes = [];
    if (prototype) {
        for (const key of Object.keys(prototype)) {
            const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
            if (!descriptor?.enumerable || !descriptor.configurable) continue;
            Object.defineProperty(prototype, key, { ...descriptor, enumerable: false });
            changes.push([key, descriptor]);
        }
    }

    const restore = () => {
        for (const [key, descriptor] of changes) {
            const current = Object.getOwnPropertyDescriptor(prototype, key);
            if (current?.enumerable === false
                && current.value === descriptor.value
                && current.get === descriptor.get
                && current.set === descriptor.set) {
                Object.defineProperty(prototype, key, descriptor);
            }
        }
    };
    restore.changedKeys = changes.map(([key]) => key);
    return restore;
}

/** Remove only the injected Tauri IPC script identified in the Android error log. */
export function stripInjectedTauriScript(html) {
    let changed = false;
    const cleaned = html.replace(SCRIPT_TAG, (script) => {
        if (!TAURI_IPC_SIGNATURE.test(script) || !script.includes('__TAURI_INTERNALS__')) {
            return script;
        }
        changed = true;
        return '';
    });
    return { html: cleaned, changed };
}

function isTargetTemplate(input, scope) {
    const value = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
    if (!value) return false;
    try {
        const base = new URL(scope.location.href);
        const url = new URL(value, base);
        return url.origin === base.origin && THIRD_PARTY_TEMPLATE_PATH.test(url.pathname);
    } catch {
        return false;
    }
}

/** Install a narrow fetch wrapper before other third-party extensions load. */
export function installTemplateFetchCompat(scope = globalThis) {
    if (!isAndroidTauriRuntime(scope) || typeof scope.fetch !== 'function') {
        return () => {};
    }

    const originalFetch = scope.fetch;
    async function compatFetch(input, init) {
        const response = await originalFetch.call(scope, input, init);
        if (!response.ok || !isTargetTemplate(input, scope)) return response;

        try {
            const originalHtml = await response.clone().text();
            const result = stripInjectedTauriScript(originalHtml);
            if (!result.changed) return response;

            const headers = new Headers(response.headers);
            headers.delete('content-length');
            headers.delete('content-encoding');
            const cleanedResponse = new Response(result.html, {
                status: response.status,
                statusText: response.statusText,
                headers,
            });
            scope.console?.info?.('[TT Template Compat] Removed injected Tauri IPC script from', String(input));
            return cleanedResponse;
        } catch (error) {
            scope.console?.warn?.('[TT Template Compat] Could not inspect template response', error);
            return response;
        }
    }

    scope.fetch = compatFetch;
    return () => {
        if (scope.fetch === compatFetch) scope.fetch = originalFetch;
    };
}

let restoreFetch = null;
let restoreArrayPrototype = null;

export function activate(scope = globalThis) {
    if (restoreFetch) return;
    restoreFetch = installTemplateFetchCompat(scope);
    if (!isAndroidTauriRuntime(scope)) return;

    restoreArrayPrototype = hideEnumerableArrayPrototypeKeys(scope.Array?.prototype);
    scope.console?.info?.('[TT Template Compat] Hidden enumerable Array.prototype keys:', restoreArrayPrototype.changedKeys);
    if (typeof scope.Array === 'function') {
        const remaining = [];
        for (const key in new scope.Array()) remaining.push(key);
        if (remaining.length) {
            scope.console?.warn?.('[TT Template Compat] Remaining inherited enumerable array keys:', remaining);
        }
    }
}

export function deactivate() {
    restoreArrayPrototype?.();
    restoreArrayPrototype = null;
    restoreFetch?.();
    restoreFetch = null;
}

