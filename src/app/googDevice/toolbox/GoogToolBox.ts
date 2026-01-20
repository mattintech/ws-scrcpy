import { ToolBox } from '../../toolbox/ToolBox';
import KeyEvent from '../android/KeyEvent';
import SvgImage from '../../ui/SvgImage';
import { KeyCodeControlMessage } from '../../controlMessage/KeyCodeControlMessage';
import { ToolBoxButton } from '../../toolbox/ToolBoxButton';
import { ToolBoxElement } from '../../toolbox/ToolBoxElement';
import { ToolBoxCheckbox } from '../../toolbox/ToolBoxCheckbox';
import { ToolBoxSelect } from '../../toolbox/ToolBoxSelect';
import { StreamClientScrcpy } from '../client/StreamClientScrcpy';
import { BasePlayer } from '../../player/BasePlayer';
import { BaseCanvasBasedPlayer } from '../../player/BaseCanvasBasedPlayer';

const SCALE_OPTIONS = [
    { value: '0.5', label: '50%' },
    { value: '0.75', label: '75%' },
    { value: '1', label: '100%' },
    { value: '1.25', label: '125%' },
    { value: '1.5', label: '150%' },
    { value: '2', label: '200%' },
];

const BUTTONS = [
    {
        title: 'Power',
        code: KeyEvent.KEYCODE_POWER,
        icon: SvgImage.Icon.POWER,
    },
    {
        title: 'Volume up',
        code: KeyEvent.KEYCODE_VOLUME_UP,
        icon: SvgImage.Icon.VOLUME_UP,
    },
    {
        title: 'Volume down',
        code: KeyEvent.KEYCODE_VOLUME_DOWN,
        icon: SvgImage.Icon.VOLUME_DOWN,
    },
    {
        title: 'Back',
        code: KeyEvent.KEYCODE_BACK,
        icon: SvgImage.Icon.BACK,
    },
    {
        title: 'Home',
        code: KeyEvent.KEYCODE_HOME,
        icon: SvgImage.Icon.HOME,
    },
    {
        title: 'Overview',
        code: KeyEvent.KEYCODE_APP_SWITCH,
        icon: SvgImage.Icon.OVERVIEW,
    },
];

export class GoogToolBox extends ToolBox {
    protected constructor(list: ToolBoxElement<any>[]) {
        super(list);
    }

    public static createToolBox(
        udid: string,
        player: BasePlayer,
        client: StreamClientScrcpy,
        moreBox?: HTMLElement,
        deviceView?: HTMLElement,
    ): GoogToolBox {
        const playerName = player.getName();
        const list = BUTTONS.slice();
        const handler = <K extends keyof HTMLElementEventMap, T extends HTMLElement>(
            type: K,
            element: ToolBoxElement<T>,
        ) => {
            if (!element.optional?.code) {
                return;
            }
            const { code } = element.optional;
            const action = type === 'mousedown' ? KeyEvent.ACTION_DOWN : KeyEvent.ACTION_UP;
            const event = new KeyCodeControlMessage(action, code, 0, 0);
            client.sendMessage(event);
        };
        const elements: ToolBoxElement<any>[] = list.map((item) => {
            const button = new ToolBoxButton(item.title, item.icon, {
                code: item.code,
            });
            button.addEventListener('mousedown', handler);
            button.addEventListener('mouseup', handler);
            return button;
        });
        if (player.supportsScreenshot) {
            const screenshot = new ToolBoxButton('Take screenshot', SvgImage.Icon.CAMERA);
            screenshot.addEventListener('click', () => {
                player.createScreenshot(client.getDeviceName());
            });
            elements.push(screenshot);
        }

        // Video recording button (only for canvas-based players)
        if (player instanceof BaseCanvasBasedPlayer && player.supportsRecording) {
            const recordBtn = new ToolBoxButton('Record video', SvgImage.Icon.RECORD);
            const btnElement = recordBtn.getElement();
            recordBtn.addEventListener('click', () => {
                const canvasPlayer = player as BaseCanvasBasedPlayer;
                if (canvasPlayer.isRecording) {
                    canvasPlayer.stopRecording();
                    btnElement.style.color = '';
                    btnElement.title = 'Record video';
                    // Update icon back to record
                    btnElement.innerHTML = '';
                    btnElement.appendChild(SvgImage.create(SvgImage.Icon.RECORD));
                } else {
                    if (canvasPlayer.startRecording()) {
                        btnElement.style.color = 'hsl(0, 100%, 50%)';
                        btnElement.title = 'Stop recording';
                        // Update icon to stop
                        btnElement.innerHTML = '';
                        btnElement.appendChild(SvgImage.create(SvgImage.Icon.STOP));
                    }
                }
            });
            elements.push(recordBtn);
        }

        // APK install button
        const apkBtn = new ToolBoxButton('Install APK', SvgImage.Icon.APK);
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.apk';
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', () => {
            const files = fileInput.files;
            if (files && files.length > 0) {
                const file = files[0];
                // Trigger file push through the existing drag-and-drop handler
                const event = new CustomEvent('apk-install', { detail: { file } });
                document.dispatchEvent(event);
            }
            fileInput.value = ''; // Reset for next selection
        });
        apkBtn.addEventListener('click', () => {
            fileInput.click();
        });
        elements.push(apkBtn);

        const keyboard = new ToolBoxCheckbox(
            'Capture keyboard',
            SvgImage.Icon.KEYBOARD,
            `capture_keyboard_${udid}_${playerName}`,
        );
        keyboard.addEventListener('click', (_, el) => {
            const element = el.getElement();
            client.setHandleKeyboardEvents(element.checked);
        });
        elements.push(keyboard);

        // Logcat toggle button
        const logcatBtn = new ToolBoxCheckbox('Toggle Logcat', SvgImage.Icon.LOGCAT, `logcat_${udid}_${playerName}`);
        logcatBtn.addEventListener('click', () => {
            const event = new CustomEvent('toggle-logcat');
            document.dispatchEvent(event);
        });
        elements.push(logcatBtn);

        // Scale dropdown
        const scaleSelect = new ToolBoxSelect('Display Scale', SCALE_OPTIONS, '1');
        scaleSelect.addEventListener('change', () => {
            const scale = parseFloat(scaleSelect.getValue());
            if (deviceView) {
                const videoEl = deviceView.querySelector('.video') as HTMLElement;
                if (videoEl) {
                    videoEl.style.transform = scale === 1 ? '' : `scale(${scale})`;
                    videoEl.style.transformOrigin = 'top right';
                }
            }
        });
        elements.push(scaleSelect);

        if (moreBox) {
            const displayId = player.getVideoSettings().displayId;
            const id = `show_more_${udid}_${playerName}_${displayId}`;
            const more = new ToolBoxCheckbox('More', SvgImage.Icon.MORE, id);
            more.addEventListener('click', (_, el) => {
                const element = el.getElement();
                moreBox.style.display = element.checked ? 'block' : 'none';
            });
            elements.unshift(more);
        }
        return new GoogToolBox(elements);
    }
}
