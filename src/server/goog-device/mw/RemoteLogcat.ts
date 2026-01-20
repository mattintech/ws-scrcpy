import WS from 'ws';
import { Mw, RequestParameters } from '../../mw/Mw';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as os from 'os';
import { Message } from '../../../types/Message';
import { ChannelCode } from '../../../common/ChannelCode';
import { Multiplexer } from '../../../packages/multiplexer/Multiplexer';

const OS_WINDOWS = os.platform() === 'win32';
const EVENT_TYPE_LOGCAT = 'logcat';

export interface LogcatClientMessage {
    type: 'start' | 'stop' | 'clear' | 'filter';
    udid?: string;
    filter?: string;
}

export class RemoteLogcat extends Mw {
    public static readonly TAG = 'RemoteLogcat';
    private logcatProcess?: ChildProcessWithoutNullStreams;
    private udid = '';
    private sendBuffer: NodeJS.Timeout | null = null;
    private buffer: string[] = [];

    public static processChannel(ws: Multiplexer, code: string): Mw | undefined {
        if (code !== ChannelCode.LOGC) {
            return;
        }
        return new RemoteLogcat(ws);
    }

    public static processRequest(_ws: WS, _params: RequestParameters): RemoteLogcat | undefined {
        // Logcat is only available through multiplexer
        return;
    }

    constructor(protected ws: WS | Multiplexer) {
        super(ws);
    }

    private startLogcat(udid: string, filter?: string): void {
        if (this.logcatProcess) {
            this.stopLogcat();
        }

        this.udid = udid;

        const adbPath = OS_WINDOWS ? 'adb.exe' : 'adb';
        const args = ['-s', udid, 'logcat', '-v', 'time'];

        if (filter) {
            args.push(filter);
        }

        this.logcatProcess = spawn(adbPath, args);

        this.logcatProcess.stdout.on('data', (data: Buffer) => {
            this.bufferData(data.toString());
        });

        this.logcatProcess.stderr.on('data', (data: Buffer) => {
            console.error(`[${RemoteLogcat.TAG}] stderr:`, data.toString());
        });

        this.logcatProcess.on('close', (code: number) => {
            console.log(`[${RemoteLogcat.TAG}] logcat process exited with code ${code}`);
            this.logcatProcess = undefined;
        });

        this.logcatProcess.on('error', (error: Error) => {
            console.error(`[${RemoteLogcat.TAG}] logcat error:`, error.message);
        });
    }

    private bufferData(data: string): void {
        const lines = data.split('\n');
        this.buffer.push(...lines.filter((line) => line.trim()));

        if (!this.sendBuffer) {
            this.sendBuffer = setTimeout(() => {
                this.flushBuffer();
            }, 50); // Batch sends every 50ms
        }
    }

    private flushBuffer(): void {
        if (this.buffer.length === 0) {
            this.sendBuffer = null;
            return;
        }

        const toSend = this.buffer.splice(0, 100); // Send max 100 lines at a time
        const message = JSON.stringify({
            type: EVENT_TYPE_LOGCAT,
            data: {
                type: 'lines',
                lines: toSend,
            },
        });

        if (this.ws.readyState === this.ws.OPEN) {
            this.ws.send(message);
        }

        if (this.buffer.length > 0) {
            this.sendBuffer = setTimeout(() => {
                this.flushBuffer();
            }, 50);
        } else {
            this.sendBuffer = null;
        }
    }

    private stopLogcat(): void {
        if (this.logcatProcess) {
            this.logcatProcess.kill();
            this.logcatProcess = undefined;
        }
    }

    private clearLogcat(): void {
        if (!this.udid) {
            return;
        }

        const adbPath = OS_WINDOWS ? 'adb.exe' : 'adb';
        const clearProcess = spawn(adbPath, ['-s', this.udid, 'logcat', '-c']);

        clearProcess.on('close', () => {
            if (this.ws.readyState === this.ws.OPEN) {
                this.ws.send(JSON.stringify({
                    type: EVENT_TYPE_LOGCAT,
                    data: {
                        type: 'cleared',
                    },
                }));
            }
        });
    }

    protected onSocketMessage(event: WS.MessageEvent): void {
        let data;
        try {
            data = JSON.parse(event.data.toString());
        } catch (error: any) {
            console.error(`[${RemoteLogcat.TAG}]`, error?.message);
            return;
        }
        this.handleMessage(data as Message).catch((error: Error) => {
            console.error(`[${RemoteLogcat.TAG}]`, error.message);
        });
    }

    private handleMessage = async (message: Message): Promise<void> => {
        if (message.type !== EVENT_TYPE_LOGCAT) {
            return;
        }
        const data: LogcatClientMessage = message.data as LogcatClientMessage;
        const { type } = data;

        switch (type) {
            case 'start':
                if (data.udid) {
                    this.startLogcat(data.udid, data.filter);
                }
                break;
            case 'stop':
                this.stopLogcat();
                break;
            case 'clear':
                this.clearLogcat();
                break;
            case 'filter':
                if (this.udid && data.filter !== undefined) {
                    // Restart with new filter
                    this.startLogcat(this.udid, data.filter);
                }
                break;
        }
    };

    public release(): void {
        super.release();
        if (this.sendBuffer) {
            clearTimeout(this.sendBuffer);
            this.sendBuffer = null;
        }
        this.stopLogcat();
    }
}
