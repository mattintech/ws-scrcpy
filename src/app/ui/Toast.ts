export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface ToastOptions {
    message: string;
    type?: ToastType;
    duration?: number;
    progress?: number; // 0-100, shows progress bar if provided
}

export class Toast {
    private static container: HTMLElement | null = null;
    private static toasts: Map<string, HTMLElement> = new Map();

    private static getContainer(): HTMLElement {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
        return this.container;
    }

    private static getTypeColor(type: ToastType): string {
        switch (type) {
            case 'success':
                return 'var(--svg-checkbox-bg-color, hsl(172, 100%, 37%))';
            case 'error':
                return 'hsl(0, 70%, 50%)';
            case 'warning':
                return 'hsl(45, 100%, 50%)';
            case 'info':
            default:
                return 'var(--link-color, hsl(218, 85%, 43%))';
        }
    }

    public static show(options: ToastOptions): string {
        const { message, type = 'info', duration = 3000, progress } = options;
        const container = this.getContainer();

        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.id = id;
        toast.style.borderLeftColor = this.getTypeColor(type);

        const messageEl = document.createElement('div');
        messageEl.className = 'toast-message';
        messageEl.textContent = message;
        toast.appendChild(messageEl);

        if (typeof progress === 'number') {
            const progressBar = document.createElement('div');
            progressBar.className = 'toast-progress';
            const progressFill = document.createElement('div');
            progressFill.className = 'toast-progress-fill';
            progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
            progressBar.appendChild(progressFill);
            toast.appendChild(progressBar);
        }

        container.appendChild(toast);
        this.toasts.set(id, toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('toast-show');
        });

        if (duration > 0 && typeof progress !== 'number') {
            setTimeout(() => {
                this.dismiss(id);
            }, duration);
        }

        return id;
    }

    public static update(id: string, options: Partial<ToastOptions>): void {
        const toast = this.toasts.get(id);
        if (!toast) {
            return;
        }

        if (options.message !== undefined) {
            const messageEl = toast.querySelector('.toast-message');
            if (messageEl) {
                messageEl.textContent = options.message;
            }
        }

        if (options.type !== undefined) {
            toast.style.borderLeftColor = this.getTypeColor(options.type);
        }

        if (options.progress !== undefined) {
            let progressBar = toast.querySelector('.toast-progress') as HTMLElement;
            if (!progressBar) {
                progressBar = document.createElement('div');
                progressBar.className = 'toast-progress';
                const progressFill = document.createElement('div');
                progressFill.className = 'toast-progress-fill';
                progressBar.appendChild(progressFill);
                toast.appendChild(progressBar);
            }
            const fill = progressBar.querySelector('.toast-progress-fill') as HTMLElement;
            if (fill) {
                fill.style.width = `${Math.min(100, Math.max(0, options.progress))}%`;
            }
        }
    }

    public static dismiss(id: string): void {
        const toast = this.toasts.get(id);
        if (!toast) {
            return;
        }

        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');

        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
            this.toasts.delete(id);
        }, 300);
    }

    public static info(message: string, duration?: number): string {
        return this.show({ message, type: 'info', duration });
    }

    public static success(message: string, duration?: number): string {
        return this.show({ message, type: 'success', duration });
    }

    public static error(message: string, duration?: number): string {
        return this.show({ message, type: 'error', duration: duration ?? 5000 });
    }

    public static warning(message: string, duration?: number): string {
        return this.show({ message, type: 'warning', duration });
    }
}
