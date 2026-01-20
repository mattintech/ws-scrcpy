import '../../../style/logcat.css';
import { LogcatClient } from '../client/LogcatClient';
import { ParamsBase } from '../../../types/ParamsBase';

export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E' | 'F' | 'S';

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    tag: string;
    pid: string;
    message: string;
    raw: string;
}

export class LogcatPanel {
    private container: HTMLElement;
    private logContainer: HTMLElement;
    private filterInput: HTMLInputElement;
    private levelSelect: HTMLSelectElement;
    private clearBtn: HTMLButtonElement;
    private autoScrollBtn: HTMLButtonElement;
    private client: LogcatClient;
    private entries: LogEntry[] = [];
    private maxEntries = 5000;
    private autoScroll = true;
    private isVisible = false;
    private filterText = '';
    private filterLevel: LogLevel = 'V';

    constructor(udid: string, params: ParamsBase) {
        this.client = new LogcatClient(udid, params);

        this.container = document.createElement('div');
        this.container.className = 'logcat-panel';
        this.container.style.display = 'none';

        // Header with controls
        const header = document.createElement('div');
        header.className = 'logcat-header';

        // Filter input
        this.filterInput = document.createElement('input');
        this.filterInput.type = 'text';
        this.filterInput.placeholder = 'Filter by tag or message...';
        this.filterInput.className = 'logcat-filter-input';
        this.filterInput.addEventListener('input', () => {
            this.filterText = this.filterInput.value.toLowerCase();
            this.applyFilter();
        });

        // Level select
        this.levelSelect = document.createElement('select');
        this.levelSelect.className = 'logcat-level-select';
        const levels: { value: LogLevel; label: string }[] = [
            { value: 'V', label: 'Verbose' },
            { value: 'D', label: 'Debug' },
            { value: 'I', label: 'Info' },
            { value: 'W', label: 'Warning' },
            { value: 'E', label: 'Error' },
            { value: 'F', label: 'Fatal' },
        ];
        levels.forEach(({ value, label }) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            this.levelSelect.appendChild(option);
        });
        this.levelSelect.addEventListener('change', () => {
            this.filterLevel = this.levelSelect.value as LogLevel;
            this.applyFilter();
        });

        // Clear button
        this.clearBtn = document.createElement('button');
        this.clearBtn.className = 'logcat-btn';
        this.clearBtn.textContent = 'Clear';
        this.clearBtn.addEventListener('click', () => {
            this.clear();
        });

        // Auto-scroll button
        this.autoScrollBtn = document.createElement('button');
        this.autoScrollBtn.className = 'logcat-btn logcat-btn-active';
        this.autoScrollBtn.textContent = 'Auto-scroll';
        this.autoScrollBtn.addEventListener('click', () => {
            this.autoScroll = !this.autoScroll;
            this.autoScrollBtn.classList.toggle('logcat-btn-active', this.autoScroll);
        });

        header.appendChild(this.filterInput);
        header.appendChild(this.levelSelect);
        header.appendChild(this.clearBtn);
        header.appendChild(this.autoScrollBtn);

        // Log container
        this.logContainer = document.createElement('div');
        this.logContainer.className = 'logcat-logs';

        this.container.appendChild(header);
        this.container.appendChild(this.logContainer);

        // Setup client events
        this.client.on('lines', (lines) => {
            this.addLines(lines);
        });

        this.client.on('cleared', () => {
            this.entries = [];
            this.logContainer.innerHTML = '';
        });
    }

    private parseLogLine(line: string): LogEntry | null {
        // Android logcat format: "MM-DD HH:MM:SS.mmm PID/TAG LEVEL: message"
        // or "MM-DD HH:MM:SS.mmm LEVEL/TAG(PID): message"
        const match = line.match(/^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEFS])\s+([^:]+):\s*(.*)$/);

        if (match) {
            return {
                timestamp: match[1],
                pid: match[2],
                level: match[4] as LogLevel,
                tag: match[5].trim(),
                message: match[6],
                raw: line,
            };
        }

        // Alternative format
        const match2 = line.match(/^([VDIWEFS])\/([^(]+)\(\s*(\d+)\):\s*(.*)$/);
        if (match2) {
            return {
                timestamp: '',
                level: match2[1] as LogLevel,
                tag: match2[2].trim(),
                pid: match2[3],
                message: match2[4],
                raw: line,
            };
        }

        // If we can't parse, return as info message
        if (line.trim()) {
            return {
                timestamp: '',
                level: 'I',
                tag: '',
                pid: '',
                message: line,
                raw: line,
            };
        }

        return null;
    }

    private shouldShowEntry(entry: LogEntry): boolean {
        // Filter by level
        const levelOrder: LogLevel[] = ['V', 'D', 'I', 'W', 'E', 'F', 'S'];
        const entryLevelIndex = levelOrder.indexOf(entry.level);
        const filterLevelIndex = levelOrder.indexOf(this.filterLevel);

        if (entryLevelIndex < filterLevelIndex) {
            return false;
        }

        // Filter by text
        if (this.filterText) {
            const searchText = `${entry.tag} ${entry.message}`.toLowerCase();
            if (!searchText.includes(this.filterText)) {
                return false;
            }
        }

        return true;
    }

    private createLogElement(entry: LogEntry): HTMLElement {
        const el = document.createElement('div');
        el.className = `logcat-line logcat-level-${entry.level.toLowerCase()}`;

        const timestamp = document.createElement('span');
        timestamp.className = 'logcat-timestamp';
        timestamp.textContent = entry.timestamp;

        const level = document.createElement('span');
        level.className = 'logcat-level';
        level.textContent = entry.level;

        const tag = document.createElement('span');
        tag.className = 'logcat-tag';
        tag.textContent = entry.tag;

        const message = document.createElement('span');
        message.className = 'logcat-message';
        message.textContent = entry.message;

        el.appendChild(timestamp);
        el.appendChild(level);
        el.appendChild(tag);
        el.appendChild(message);

        return el;
    }

    private addLines(lines: string[]): void {
        const fragment = document.createDocumentFragment();

        for (const line of lines) {
            const entry = this.parseLogLine(line);
            if (!entry) continue;

            this.entries.push(entry);

            if (this.shouldShowEntry(entry)) {
                fragment.appendChild(this.createLogElement(entry));
            }
        }

        // Trim old entries if needed
        while (this.entries.length > this.maxEntries) {
            this.entries.shift();
            if (this.logContainer.firstChild) {
                this.logContainer.removeChild(this.logContainer.firstChild);
            }
        }

        this.logContainer.appendChild(fragment);

        if (this.autoScroll) {
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }
    }

    private applyFilter(): void {
        this.logContainer.innerHTML = '';
        const fragment = document.createDocumentFragment();

        for (const entry of this.entries) {
            if (this.shouldShowEntry(entry)) {
                fragment.appendChild(this.createLogElement(entry));
            }
        }

        this.logContainer.appendChild(fragment);

        if (this.autoScroll) {
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }
    }

    private clear(): void {
        this.client.clear();
        this.entries = [];
        this.logContainer.innerHTML = '';
    }

    public show(): void {
        if (!this.isVisible) {
            this.container.style.display = 'flex';
            this.isVisible = true;
            this.client.connect();
        }
    }

    public hide(): void {
        if (this.isVisible) {
            this.container.style.display = 'none';
            this.isVisible = false;
            this.client.disconnect();
        }
    }

    public toggle(): void {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    public getElement(): HTMLElement {
        return this.container;
    }

    public release(): void {
        this.client.disconnect();
        if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
    }
}
