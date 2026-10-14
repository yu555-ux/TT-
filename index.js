const THIRD_PARTY_TEMPLATE_PATH = /^\/scripts\/extensions\/third-party\/.+\.html$/i;
const TAURI_IPC_SIGNATURE = /@typedef\s+\{\{\s*callback:\s*string,\s*error:\s*string,\s*data:\s*\*\s*\}\}/;
const SCRIPT_TAG = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;

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
    if (!/android/i.test(scope.navigator?.userAgent ?? '')
        || new URL(scope.location?.href ?? 'http://invalid/').hostname !== 'tauri.localhost'
        || !scope.__TAURI_INTERNALS__
        || typeof scope.fetch !== 'function') {
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

export function activate() {
    restoreFetch ??= installTemplateFetchCompat();
}

export function deactivate() {
    restoreFetch?.();
    restoreFetch = null;
}

