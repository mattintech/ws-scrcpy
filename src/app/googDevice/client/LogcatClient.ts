import { TypedEmitter } from '../../../common/TypedEmitter';
import { ChannelCode } from '../../../common/ChannelCode';
import Util from '../../Util';
import { ParamsBase } from '../../../types/ParamsBase';

const EVENT_TYPE_LOGCAT = 'logcat';

export interface LogcatEvents {
    lines: string[];
    cleared: void;
    connected: void;
    disconnected: void;
}

export interface LogcatMessage {
    type: string;
    data: {
        type: 'lines' | 'cleared';
        lines?: string[];
    };
}

export class LogcatClient extends TypedEmitter<LogcatEvents> {
    private ws?: WebSocket;
    private udid: string;
    private params: ParamsBase;
    private reconnectTimeout?: ReturnType<typeof setTimeout>;
    private isConnected = false;

    constructor(udid: string, params: ParamsBase) {
        super();
        this.udid = udid;
        this.params = params;
    }

    public connect(): void {
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            return;
        }

        const protocol = this.params.secure ? 'wss' : 'ws';
        const host = this.params.hostname || location.hostname;
        const port = this.params.port || location.port;
        const path = this.params.pathname || '/';

        // Create multiplexer connection URL
        const url = `${protocol}://${host}:${port}${path}?action=multiplex`;

        this.ws = new WebSocket(url);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            // Send channel code to identify this as a logcat channel
            const channelCode = Util.stringToUtf8ByteArray(ChannelCode.LOGC);
            this.ws?.send(channelCode);
            this.isConnected = true;
            this.emit('connected', undefined);

            // Start logcat
            this.sendMessage({
                type: EVENT_TYPE_LOGCAT,
                data: {
                    type: 'start',
                    udid: this.udid,
                },
            });
        };

        this.ws.onmessage = (event: MessageEvent) => {
            this.onMessage(event);
        };

        this.ws.onclose = () => {
            this.isConnected = false;
            this.emit('disconnected', undefined);
            this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
            console.error('[LogcatClient] WebSocket error:', error);
        };
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimeout) {
            return;
        }
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = undefined;
            if (!this.isConnected) {
                this.connect();
            }
        }, 3000);
    }

    private onMessage(event: MessageEvent): void {
        let data: LogcatMessage;
        try {
            if (typeof event.data === 'string') {
                data = JSON.parse(event.data);
            } else {
                // Binary data - convert to string
                const text = new TextDecoder().decode(event.data);
                data = JSON.parse(text);
            }
        } catch (error) {
            console.error('[LogcatClient] Failed to parse message:', error);
            return;
        }

        if (data.type !== EVENT_TYPE_LOGCAT) {
            return;
        }

        switch (data.data.type) {
            case 'lines':
                if (data.data.lines) {
                    this.emit('lines', data.data.lines);
                }
                break;
            case 'cleared':
                this.emit('cleared', undefined);
                break;
        }
    }

    private sendMessage(message: object): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    public setFilter(filter: string): void {
        this.sendMessage({
            type: EVENT_TYPE_LOGCAT,
            data: {
                type: 'filter',
                filter,
            },
        });
    }

    public clear(): void {
        this.sendMessage({
            type: EVENT_TYPE_LOGCAT,
            data: {
                type: 'clear',
            },
        });
    }

    public disconnect(): void {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = undefined;
        }

        if (this.ws) {
            this.sendMessage({
                type: EVENT_TYPE_LOGCAT,
                data: {
                    type: 'stop',
                },
            });
            this.ws.close();
            this.ws = undefined;
        }
        this.isConnected = false;
    }

    public getConnectionStatus(): boolean {
        return this.isConnected;
    }
}
