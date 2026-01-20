import '../../../style/devicelist.css';
import { BaseDeviceTracker } from '../../client/BaseDeviceTracker';
import { SERVER_PORT } from '../../../common/Constants';
import { ACTION } from '../../../common/Action';
import GoogDeviceDescriptor from '../../../types/GoogDeviceDescriptor';
import Util from '../../Util';
import { Attribute } from '../../Attribute';
import { DeviceState } from '../../../common/DeviceState';
import { Message } from '../../../types/Message';
import { ParamsDeviceTracker } from '../../../types/ParamsDeviceTracker';
import { HostItem } from '../../../types/Configuration';
import { ChannelCode } from '../../../common/ChannelCode';
import { Tool } from '../../client/Tool';

const ANDROID_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="android-icon">
    <path d="M17.6 11.48V11.43V11.48M6.4 11.48V11.43V11.48M16.11 4.34L17.77 2.68C17.96 2.5 17.96 2.18 17.77 2C17.59 1.81 17.27 1.81 17.08 2L15.28 3.81C14.16 3.32 12.95 3.03 11.67 3.03C10.43 3.03 9.25 3.3 8.17 3.78L6.38 1.97C6.2 1.78 5.88 1.78 5.69 1.97C5.5 2.16 5.5 2.47 5.69 2.66L7.35 4.32C4.93 5.92 3.27 8.57 3 11.63H20.37C20.1 8.55 18.43 5.89 16.11 4.34M6.4 9.98C5.8 9.98 5.33 9.5 5.33 8.9C5.33 8.3 5.81 7.82 6.4 7.82C7 7.82 7.5 8.3 7.5 8.9C7.5 9.5 7 9.98 6.4 9.98M17.6 9.98C17 9.98 16.5 9.5 16.5 8.9C16.5 8.3 17 7.82 17.6 7.82C18.2 7.82 18.67 8.3 18.67 8.9C18.67 9.5 18.2 9.98 17.6 9.98M3 12.63V20.37C3 21.27 3.73 22 4.63 22H5.25V16C5.25 15.45 5.7 15 6.25 15H17.75C18.3 15 18.75 15.45 18.75 16V22H19.37C20.27 22 21 21.27 21 20.37V12.63H3Z"/>
</svg>`;

export class DeviceTracker extends BaseDeviceTracker<GoogDeviceDescriptor, never> {
    public static readonly ACTION = ACTION.GOOG_DEVICE_LIST;
    public static readonly CREATE_DIRECT_LINKS = true;
    private static instancesByUrl: Map<string, DeviceTracker> = new Map();
    protected static tools: Set<Tool> = new Set();
    protected tableId = 'goog_device_list';

    public static start(hostItem: HostItem): DeviceTracker {
        const url = this.buildUrlForTracker(hostItem).toString();
        let instance = this.instancesByUrl.get(url);
        if (!instance) {
            instance = new DeviceTracker(hostItem, url);
        }
        return instance;
    }

    public static getInstance(hostItem: HostItem): DeviceTracker {
        return this.start(hostItem);
    }

    protected constructor(params: HostItem, directUrl: string) {
        super({ ...params, action: DeviceTracker.ACTION }, directUrl);
        DeviceTracker.instancesByUrl.set(directUrl, this);
        this.buildDeviceTable();
        this.openNewConnection();
    }

    protected onSocketOpen(): void {
        // nothing here;
    }

    protected setIdAndHostName(id: string, hostName: string): void {
        super.setIdAndHostName(id, hostName);
        for (const value of DeviceTracker.instancesByUrl.values()) {
            if (value.id === id && value !== this) {
                console.warn(
                    `Tracker with url: "${this.url}" has the same id(${this.id}) as tracker with url "${value.url}"`,
                );
                console.warn(`This tracker will shut down`);
                this.destroy();
            }
        }
    }

    onInterfaceSelected = (event: Event): void => {
        const selectElement = event.currentTarget as HTMLSelectElement;
        const option = selectElement.selectedOptions[0];
        const url = decodeURI(option.getAttribute(Attribute.URL) || '');
        const name = option.getAttribute(Attribute.NAME) || '';
        const fullName = decodeURIComponent(selectElement.getAttribute(Attribute.FULL_NAME) || '');
        const udid = selectElement.getAttribute(Attribute.UDID) || '';
        this.updateLink({ url, name, fullName, udid, store: true });
    };

    private updateLink(params: { url: string; name: string; fullName: string; udid: string; store: boolean }): void {
        const { url, name, fullName, udid, store } = params;
        const playerTds = document.getElementsByName(
            encodeURIComponent(`${DeviceTracker.AttributePrefixPlayerFor}${fullName}`),
        );
        if (typeof udid !== 'string') {
            return;
        }
        if (store) {
            const localStorageKey = DeviceTracker.getLocalStorageKey(fullName || '');
            if (localStorage && name) {
                localStorage.setItem(localStorageKey, name);
            }
        }
        const action = ACTION.STREAM_SCRCPY;
        playerTds.forEach((item) => {
            item.innerHTML = '';
            const playerFullName = item.getAttribute(DeviceTracker.AttributePlayerFullName);
            const playerCodeName = item.getAttribute(DeviceTracker.AttributePlayerCodeName);
            if (!playerFullName || !playerCodeName) {
                return;
            }
            const link = DeviceTracker.buildLink(
                {
                    action,
                    udid,
                    player: decodeURIComponent(playerCodeName),
                    ws: url,
                },
                decodeURIComponent(playerFullName),
                this.params,
            );
            item.appendChild(link);
        });
    }

    onActionButtonClick = (event: MouseEvent): void => {
        const button = event.currentTarget as HTMLButtonElement;
        const udid = button.getAttribute(Attribute.UDID);
        const pidString = button.getAttribute(Attribute.PID) || '';
        const command = button.getAttribute(Attribute.COMMAND) as string;
        const pid = parseInt(pidString, 10);
        const data: Message = {
            id: this.getNextId(),
            type: command,
            data: {
                udid: typeof udid === 'string' ? udid : undefined,
                pid: isNaN(pid) ? undefined : pid,
            },
        };

        if (this.ws && this.ws.readyState === this.ws.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    };

    private static getLocalStorageKey(udid: string): string {
        return `device_list::${udid}::interface`;
    }

    protected static createUrl(params: ParamsDeviceTracker, udid = ''): URL {
        const secure = !!params.secure;
        const hostname = params.hostname || location.hostname;
        const port = typeof params.port === 'number' ? params.port : secure ? 443 : 80;
        const pathname = params.pathname || location.pathname;
        const urlObject = this.buildUrl({ ...params, secure, hostname, port, pathname });
        if (udid) {
            urlObject.searchParams.set('action', ACTION.PROXY_ADB);
            urlObject.searchParams.set('remote', `tcp:${SERVER_PORT.toString(10)}`);
            urlObject.searchParams.set('udid', udid);
        }
        return urlObject;
    }

    protected static createInterfaceOption(name: string, url: string): HTMLOptionElement {
        const optionElement = document.createElement('option');
        optionElement.setAttribute(Attribute.URL, url);
        optionElement.setAttribute(Attribute.NAME, name);
        optionElement.innerText = `proxy over adb`;
        return optionElement;
    }

    protected buildDeviceRow(tbody: Element, device: GoogDeviceDescriptor): void {
        let selectedInterfaceUrl = '';
        let selectedInterfaceName = '';
        const fullName = `${this.id}_${Util.escapeUdid(device.udid)}`;
        const isActive = device.state === DeviceState.DEVICE;
        const hasPid = device.pid !== -1;
        const cardId = `device_card_${fullName}`;
        const selectId = `interface_select_${fullName}`;

        // Build interface URL for the card click
        const proxyInterfaceUrl = DeviceTracker.createUrl(this.params, device.udid).toString();
        const proxyInterfaceName = 'proxy';
        const localStorageKey = DeviceTracker.getLocalStorageKey(fullName);
        const lastSelected = localStorage && localStorage.getItem(localStorageKey);

        // Default to proxy interface
        selectedInterfaceUrl = proxyInterfaceUrl;
        selectedInterfaceName = proxyInterfaceName;

        // Build card using DOM methods to avoid HTML escaping issues
        const cardElement = document.createElement('div');
        cardElement.id = cardId;
        cardElement.className = `device-card ${isActive ? 'active' : 'not-active'}`;
        cardElement.setAttribute(Attribute.UDID, device.udid);

        // Screenshot section with Android icon
        const screenshotDiv = document.createElement('div');
        screenshotDiv.className = 'device-card-screenshot';
        const placeholderDiv = document.createElement('div');
        placeholderDiv.className = 'screenshot-placeholder';
        placeholderDiv.innerHTML = ANDROID_ICON_SVG;
        screenshotDiv.appendChild(placeholderDiv);
        cardElement.appendChild(screenshotDiv);

        // Info section
        const infoDiv = document.createElement('div');
        infoDiv.className = 'device-card-info';

        // Header with name and state
        const headerDiv = document.createElement('div');
        headerDiv.className = 'device-card-header';
        const nameDiv = document.createElement('div');
        nameDiv.className = 'device-card-name';
        nameDiv.textContent = `${device['ro.product.manufacturer']} ${device['ro.product.model']}`;
        const stateDiv = document.createElement('div');
        stateDiv.className = 'device-card-state';
        stateDiv.title = `State: ${device.state}`;
        headerDiv.appendChild(nameDiv);
        headerDiv.appendChild(stateDiv);
        infoDiv.appendChild(headerDiv);

        // Details section
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'device-card-details';
        const osDiv = document.createElement('div');
        osDiv.className = 'device-card-os';
        osDiv.innerHTML = `<span class="label">Android</span> <span class="value">${device['ro.build.version.release']}</span> <span class="sdk">(API ${device['ro.build.version.sdk']})</span>`;
        const serialDiv = document.createElement('div');
        serialDiv.className = 'device-card-serial';
        serialDiv.textContent = device.udid;
        detailsDiv.appendChild(osDiv);
        detailsDiv.appendChild(serialDiv);
        infoDiv.appendChild(detailsDiv);

        // Actions section
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'device-card-actions';
        const selectElement = document.createElement('select');
        selectElement.id = selectId;
        selectElement.className = 'interface-select';
        selectElement.setAttribute(Attribute.UDID, device.udid);
        selectElement.setAttribute(Attribute.FULL_NAME, fullName);
        selectElement.name = encodeURIComponent(`${DeviceTracker.AttributePrefixInterfaceSelectFor}${fullName}`);
        actionsDiv.appendChild(selectElement);
        const statusDiv = document.createElement('div');
        statusDiv.className = 'device-card-status';
        statusDiv.innerHTML = hasPid ? '<span class="status-ready">Ready</span>' : '<span class="status-stopped">Stopped</span>';
        actionsDiv.appendChild(statusDiv);
        infoDiv.appendChild(actionsDiv);

        cardElement.appendChild(infoDiv);

        if (selectElement) {
            /// #if SCRCPY_LISTENS_ON_ALL_INTERFACES
            device.interfaces.forEach((iface) => {
                const params = {
                    ...this.params,
                    secure: false,
                    hostname: iface.ipv4,
                    port: SERVER_PORT,
                };
                const url = DeviceTracker.createUrl(params).toString();
                const optionElement = DeviceTracker.createInterfaceOption(iface.name, url);
                optionElement.innerText = `${iface.name}: ${iface.ipv4}`;
                selectElement.appendChild(optionElement);
                if (lastSelected) {
                    if (lastSelected === iface.name || !selectedInterfaceName) {
                        optionElement.selected = true;
                        selectedInterfaceUrl = url;
                        selectedInterfaceName = iface.name;
                    }
                } else if (device['wifi.interface'] === iface.name) {
                    optionElement.selected = true;
                    selectedInterfaceUrl = url;
                    selectedInterfaceName = iface.name;
                }
            });
            /// #endif

            if (isActive) {
                const adbProxyOption = DeviceTracker.createInterfaceOption(proxyInterfaceName, proxyInterfaceUrl);
                adbProxyOption.innerText = 'proxy over adb';
                if (lastSelected === proxyInterfaceName || !selectedInterfaceName) {
                    adbProxyOption.selected = true;
                    selectedInterfaceUrl = proxyInterfaceUrl;
                    selectedInterfaceName = proxyInterfaceName;
                }
                selectElement.appendChild(adbProxyOption);
            }

            selectElement.onchange = this.onInterfaceSelected;
            // Prevent card click when interacting with select
            selectElement.onclick = (e: Event) => e.stopPropagation();
        }

        // Make the card clickable to launch H264 Converter stream
        if (cardElement && isActive && hasPid) {
            cardElement.style.cursor = 'pointer';
            cardElement.onclick = (e: MouseEvent) => {
                // Don't trigger if clicking on select or other interactive elements
                if ((e.target as HTMLElement).tagName === 'SELECT' ||
                    (e.target as HTMLElement).tagName === 'OPTION') {
                    return;
                }
                this.launchStream(device.udid, selectedInterfaceUrl);
            };

            // Update click handler when interface changes
            if (selectElement) {
                selectElement.onchange = (e: Event) => {
                    this.onInterfaceSelected(e);
                    const select = e.currentTarget as HTMLSelectElement;
                    const option = select.selectedOptions[0];
                    const newUrl = decodeURI(option.getAttribute(Attribute.URL) || '');
                    if (newUrl) {
                        selectedInterfaceUrl = newUrl;
                    }
                };
            }
        }

        tbody.appendChild(cardElement);
    }

    private launchStream(udid: string, wsUrl: string): void {
        // Launch H264 Converter (MSE player) stream
        const action = ACTION.STREAM_SCRCPY;
        const player = 'mse'; // H264 Converter player code name

        const params: Record<string, string> = {
            action,
            udid,
            player,
            ws: wsUrl,
        };

        const hash = `#!${new URLSearchParams(params).toString()}`;
        const { hostname, port, pathname, protocol } = location;
        const url = `${protocol}//${hostname}:${port}${pathname}${hash}`;

        window.open(url, '_blank', 'noopener,noreferrer');
    }

    protected getChannelCode(): string {
        return ChannelCode.GTRC;
    }

    public destroy(): void {
        super.destroy();
        DeviceTracker.instancesByUrl.delete(this.url.toString());
        if (!DeviceTracker.instancesByUrl.size) {
            const holder = document.getElementById(BaseDeviceTracker.HOLDER_ELEMENT_ID);
            if (holder && holder.parentElement) {
                holder.parentElement.removeChild(holder);
            }
        }
    }
}
