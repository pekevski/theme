import * as appCommon from "tns-core-modules/application/application-common";
import * as app from "tns-core-modules/application";
import { removeFromRootViewCssClasses, removeCssClass } from "tns-core-modules/css/system-classes";
import { device, isAndroid, screen } from "tns-core-modules/platform";
import * as view from "tns-core-modules/ui/core/view";
import * as frame from "tns-core-modules/ui/frame";

const removeClass = removeCssClass || removeFromRootViewCssClasses;

const display = screen.mainScreen;
const whiteSpaceRegExp = /\s+/;
const platformClass = `ns-${isAndroid ? "android" : "ios"}`;
const sdkVersionClass = device.sdkVersion.replace(".", "-");

let started = false;

export class ClassList {
    constructor(className) {
        this.list = new Set();

        (className || "").split(whiteSpaceRegExp).forEach((v) => v && this.list.add(v));
    }

    add(...classes) {
        classes.forEach((v) => this.list.add(v));

        return this;
    }

    remove(...classes) {
        classes.forEach((v) => this.list.delete(v));

        return this;
    }

    get() {
        return Array.from(this.list).join(" ");
    }
}

export class Theme {
    static setMode(mode, root = app.getRootView()) {
        Theme.currentMode = mode;
        Theme.rootView = root;

        if (!root || !mode) {
            return;
        }

        const classList = new ClassList(Theme.rootView.className);

        classList.remove(Theme.Light, Theme.Dark);

        if (Theme.currentMode !== Theme.Auto) {
            removeClass(Theme.Light);
            removeClass(Theme.Dark);
            classList.add(Theme.currentMode);
        } else {
            // Reset to Auto system theme
            setTimeout(appCommon.systemAppearanceChanged.bind(this, Theme.rootView, app.systemAppearance()));
        }

        Theme.rootView.className = classList.get();
    }

    static toggleMode(isDark) {
        if (isDark === undefined) {
            const mode = Theme.currentMode === Theme.Auto && app.systemAppearance ? `ns-${app.systemAppearance()}` : Theme.getMode();

            Theme.setMode(mode === Theme.Light ? Theme.Dark : Theme.Light);

            return;
        }

        Theme.setMode(isDark ? Theme.Dark : Theme.Light);
    }

    static getMode() {
        const root = app.getRootView();

        return Theme.currentMode || (((root && root.className) || "").indexOf(Theme.Dark) !== -1 ? Theme.Dark : Theme.Light);
    }
}

Theme.Light = "ns-light";
Theme.Dark = "ns-dark";
Theme.Auto = "auto";

export default Theme;

// Where the magic happens
const oldSetupAsRootView = view.ViewCommon.prototype._setupAsRootView;
view.ViewCommon.prototype._setupAsRootView = function() {
    oldSetupAsRootView.call(this, ...arguments);
    Theme.setMode(Theme.currentMode, this);
};

// Disable SystemAppearance changes if Theme.currentMode is not auto
const oldSystemAppearanceChanged = appCommon.systemAppearanceChanged;

if (oldSystemAppearanceChanged) {
    appCommon.systemAppearanceChanged = function () {
        if (Theme.currentMode === Theme.Auto) {
            oldSystemAppearanceChanged.call(this, ...arguments);
        }
    };
}

// Make sure to substitute systemAppearance method too, as some plugins call it directly
const oldSystemAppearance = app.systemAppearance;

if (oldSystemAppearance) {
    app.systemAppearance = function () {
        if (Theme.currentMode === Theme.Auto) {
            return oldSystemAppearance.call(this, ...arguments);
        }

        return Theme.currentMode.substr(3);
    };
}

/* Deprecated root class setters, now available in core modules */
function updateRootClasses(orientation, root = app.getRootView(), classes = []) {
    const classList = new ClassList(root.className);

    classList
        .remove("ns-portrait", "ns-landscape", "ns-unknown", ...classes)
        .add(`ns-${orientation}`, ...classes);

    root.className = classList.get();
}

function handleOrientation({ newValue: orientation }) {
    updateRootClasses(orientation);

    if (view._rootModalViews.length) {
        const classList = new ClassList(app.getRootView().className);

        view._rootModalViews.forEach((view) => updateRootClasses(orientation, view, classList.add("ns-modal").list));
    }
}

function getOrientation() {
    return display.heightDIPs > display.widthDIPs ? "portrait" : "landscape";
}

const rootModalTrap = {
    defineProperty(target, key, desc) {
        if (desc && "value" in desc) {
            target[key] = desc.value;

            if (desc.value instanceof frame.Frame) {
                const classList = new ClassList(app.getRootView().className);

                updateRootClasses(getOrientation(), desc.value, classList.add("ns-modal").list);
            }
        }

        return target;
    }
};

app.on(app.displayedEvent, () => {
    const root = app.getRootView();

    // Bail out if no root view or root classes already set (pre 6.1).
    if (!root || root.cssClasses.has("ns-root")) {
        // Add ns-{platform}-{sdkVersion} classes
        if (root) {
            root.className = new ClassList(root.className)
                .add(`${platformClass}__${sdkVersionClass}`)
                .get();
        }

        return;
    }

    // Get notified when a modal is created.
    view._rootModalViews = new Proxy(view._rootModalViews, rootModalTrap);

    root.className = new ClassList(root.className)
        .add("ns-root", platformClass, `ns-${device.deviceType.toLowerCase()}`)
        .get();

    if (!started) {
        handleOrientation({ newValue: getOrientation() });
        app.on(app.orientationChangedEvent, handleOrientation);
        started = true;
    }
});
