/**
 * @name CallConfirmations
 * @displayName CallConfirmations
 * @description Prevent accidental calls with call confirmations.
 * @author LancersBucket
 * @authorId 355477882082033664
 * @version 1.0.3
 * @source https://github.com/LancersBucket/CallConfirmations
 */
/*@cc_on
@if (@_jscript)

var shell = WScript.CreateObject('WScript.Shell');
shell.Popup('It looks like you\'ve mistakenly tried to run me directly. That\'s not how you install plugins. \n(So don\'t do that!)', 0, 'I\'m a plugin for BetterDiscord', 0x30);

@else@*/
const config = {
    info: {
        name: 'CallConfirmations',
        version: '1.0.3',
        github: 'https://github.com/LancersBucket/CallConfirmations',
        github_raw: 'https://raw.githubusercontent.com/LancersBucket/CallConfirmations/refs/heads/master/CallConfirmations.plugin.js',
    },
    defaultConfig: [
        {
            type: 'switch',
            id: 'dm',
            name: 'DMs',
            note: 'Enables confirmation for DMs.',
            value: false,
        },
        {
            type: 'switch',
            id: 'gdm',
            name: 'Group DMs',
            note: 'Enables confirmation for Group DMs.',
            value: true,
        },
        {
            type: 'switch',
            id: 'server',
            name: 'Server VCs',
            note: 'Enables confirmation for Server VCs.',
            value: false,
        },
        {
            type: 'category',
            name: 'Core Settings',
            id: 'core',
            collapsible: true,
            shown: false,
            settings: [ // Core settings
                {
                    type: 'switch',
                    id: 'checkForUpdates',
                    name: 'Check for Updates',
                    note: 'Check for updates on startup.',
                    value: true,
                }
            ],
        }
    ],
};


module.exports = class CallConfirmations {
    constructor(meta) {
        this.meta = meta;
        this.api = new BdApi(this.meta.name);
        this.settings = this.api.Data.load('settings') || this.defaultSettings();

        // Ensure all keys exist in settings
        this.ensureDefaultSettings();

        this.events = []
    }

    ensureDefaultSettings() {
        const defaultSettings = this.defaultSettings();
        for (const key in defaultSettings) {
            if (typeof defaultSettings[key] === 'object' && !Array.isArray(defaultSettings[key])) {
                this.settings[key] = { ...defaultSettings[key], ...this.settings[key] };
            } else if (!(key in this.settings)) {
                this.settings[key] = defaultSettings[key];
            }
        }
        this.api.Data.save('settings', this.settings);
    }

    defaultSettings() {
        return config.defaultConfig.reduce((acc, cur) => {
            if (cur.type === 'category') {
                acc[cur.id] = cur.settings.reduce((a, c) => {
                    a[c.id] = c.value;
                    return a;
                }, {});
            } else {
                acc[cur.id] = cur.value;
            }
            return acc;
        }, {});
    }

    async checkForUpdates() {
        try {
            // Check the latest version on remote
            const request = new XMLHttpRequest();
            request.open('GET', config.info.github_raw);
            request.onload = () => {
                if (request.status === 200) {
                    const remoteVersion = request.responseText.match(/version: ['"]([\d.]+)['"]/i)?.[1];
                    const localVersion = config.info.version;

                    const compareVersions = (a, b) => {
                        const aParts = a.split('.').map(Number);
                        const bParts = b.split('.').map(Number);
                        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                            const aPart = aParts[i] || 0;
                            const bPart = bParts[i] || 0;
                            if (aPart > bPart) return 1;
                            if (aPart < bPart) return -1;
                        }
                        return 0;
                    };
                    if (remoteVersion && compareVersions(remoteVersion, localVersion) > 0) {
                        this.api.Logger.info(`Update to v${remoteVersion} available.`);
                        BdApi.UI.showConfirmationModal('CallConfirmations Update',
                            `A new version of CallConfirmations (**v${remoteVersion}**) is available!\n\n` +
                            `You are on **v${localVersion}**. Please see the [changelog](${config.info.github}/blob/main/CHANGELOG.md) for a list of changes.\n\n` +
                            `Would you like to update now?`,
                            {
                                confirmText: 'Update',
                                onConfirm: () => {
                                    this.api.Logger.info("Updating plugin...");
                                    require('fs').writeFileSync(
                                        require('path').join(BdApi.Plugins.folder, `${config.info.name}.plugin.js`),
                                        request.responseText
                                    );
                                    this.api.Logger.info("Plugin updated! BetterDiscord will now reload the plugin.");
                                }
                            }
                        );
                    } else {
                        this.api.Logger.info("No updates available.");
                    }
                } else {
                    this.api.Logger.error(`Failed to check for updates. Status: ${request.status}`);
                }
            };
            request.send();
        } catch (e) {
            this.api.Logger.error('Failed to check for updates:', e);
        }
    }

    startObserver() {
        // Disconnect previous observer if exists
        if (this.observer) this.observer.disconnect();

        // Only fire when a button is added to the DOM
        this.observer = new MutationObserver((mutationsList) => {
            let buttonAdded = false;
            for (const mutation of mutationsList) {
                for (const node of mutation.addedNodes) {
                    if (
                        node.nodeType === 1 && // Element node
                        (
                            (node.matches && node.matches('[class*="link"][role="button"], [class*="clickable"][role="button"][aria-label*=Call]')) ||
                            (node.querySelector && node.querySelector('[class*="link"][role="button"], [class*="clickable"][role="button"][aria-label*=Call]'))
                        )
                    ) {
                        buttonAdded = true;
                        break;
                    }
                }
                if (buttonAdded) break;
            }
            if (buttonAdded) {
                this.removeLinkEvents();
                this.addLinkEvents();
            }
        });
        this.observer.observe(document.body, { childList: true, subtree: true });

        // Initial run
        this.removeLinkEvents();
        this.addLinkEvents();
    }

    stopObserver() {
        if (this.observer) this.observer.disconnect();
        this.observer = null;
        this.removeLinkEvents();
    }

    addLinkEvents() {
        this.events = [];
        // VC channels, and DM/GDM Call + Video Call buttons
        const links = document.querySelectorAll("[class*='link'][role='button'], [class*='clickable'][role='button'][aria-label*='Call']");

        // Generate new event handler for each channel option
        for (const el of links) {
            const eventHandler = (e) => {
                const target = e.target;
                // If the event has the _isCallConfirmation tag then we have already handled it, so skip it
                if (e && e._isCallConfirmation === true) return;
                if (target) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    this.handleClick(el);
                }
            };
            // Add the event to the global list so it can be removed later
            this.events.push([el, eventHandler]);

            // Add the event listener
            el.addEventListener('click', eventHandler, { capture: true });
        }
    }

    // Removes all event handlers
    removeLinkEvents() {
        if (!this.events) return;
        for (const [el, handler] of this.events) {
            el.removeEventListener('click', handler, { capture: true });
        }
        this.events = [];
    }

    handleClick(element) {
        var mode = false
        
        // Get location of the button, either a GDM, DM or Server
        if (document.querySelector("[class*='title'] [class*='hiddenVisually']").textContent == 'Group DM') {
            mode = "gdm";
        }
        else if (document.querySelector("[class*='title'] [class*='hiddenVisually']").textContent == 'Direct Message') {
            mode = "dm";
        }
        else if (document.querySelector("[class*='sidebarList'] [aria-label*='(server)']")) {
            mode = "server";
        }

        // Generate a new prompt depending on where the button was pressed
        var prompt = "";
        switch (mode) {
            case "gdm":
                try {
                    var loc = document.querySelector("[aria-label*='Edit Group'] [class*='text']").textContent;
                } catch (e) {
                    var loc = 'Group DM';
                    this.api.Logger.error(`Name of ${loc} could not be found.\n${e}`);
                }
                prompt = `You are about to call **${loc}**.`;
                break;
            case "dm":
                try {
                    var loc = document.querySelector("[class*='titleWrapper'] h1 span:first-child").textContent;
                } catch (e) {
                    var loc = 'Direct Message';
                    this.api.Logger.error(`Name of ${loc} could not be found.\n${e}`);
                }
                prompt = `You are about to call **${loc}**.`;
                break;
            case "server":
                try {
                    var loc = document.querySelector("[class*='base'] [class*='bar'] [class*='title']").textContent;
                    var channelName = element.querySelector("[class*='name']").textContent;
                } catch (e) {
                    var loc = 'Server';
                    var channelName = 'Voice Channel';
                    this.api.Logger.error(`Name of ${loc}/${channelName} could not be found.\n${e}`);
                }
                prompt = `You are about to join a call in **${loc}**'s VC (**${channelName}**).`;
                break;
            default:
                this.api.Logger.info("No prompt is generatable.");
                break;
        }

        const dispatchClickEvent = () => {
            // Redispatch the click event to the original element
            const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: false,
                view: window,
            });
            clickEvent._isCallConfirmation = true;
            
            element.dispatchEvent(clickEvent);
        };

        if (mode && this.settings[mode]) {
            BdApi.UI.showConfirmationModal('Call Confirmation', `${prompt} Are you sure?`,
                {
                    confirmText: 'Yes',
                    onConfirm: dispatchClickEvent
                }
            );
        } else {
            dispatchClickEvent();
        }
    }

    async start() {
        this.ensureDefaultSettings();

        if (this.settings.core.checkForUpdates) {
            this.api.Logger.info("Checking for updates...");
            await this.checkForUpdates();
        }

        this.startObserver();
    }

    stop() {
        this.stopObserver();
    }

    getSettingsPanel() {
        const settings = JSON.parse(JSON.stringify(config.defaultConfig));
        settings.forEach(setting => {
            if (setting.type === 'category') {
                setting.settings.forEach(subSetting => {
                    // Try to set the value, if it's missing, initialize to default value.
                    try {
                        subSetting.value = this.settings[setting.id][subSetting.id];    
                    } catch (error) {
                        this.api.Logger.error(error);
                    }
                });
            } else {
                setting.value = this.settings[setting.id];
            }
        });

        return this.api.UI.buildSettingsPanel({
            settings,
            onChange: (category, id, value) => {
                if (category !== null) {
                    // Try to modify the key, if the category is missing, create it.
                    try {
                        this.settings[category][id] = value;
                    } catch (error) {
                        this.settings[category] = {};
                        this.settings[category][id] = value;
                    }
                } else {
                    this.settings[id] = value;
                }
                this.api.Data.save('settings', this.settings);
            },
        });
    }
};
/*@end@*/