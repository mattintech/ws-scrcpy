import { Optional, ToolBoxElement } from './ToolBoxElement';

export interface SelectOption {
    value: string;
    label: string;
}

export class ToolBoxSelect extends ToolBoxElement<HTMLSelectElement> {
    private readonly select: HTMLSelectElement;
    private readonly wrapper: HTMLDivElement;

    constructor(title: string, options: SelectOption[], defaultValue?: string, optional?: Optional) {
        super(title, optional);

        this.wrapper = document.createElement('div');
        this.wrapper.classList.add('control-select-wrapper');

        const select = document.createElement('select');
        select.classList.add('control-select');
        select.title = title;

        options.forEach((opt) => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            if (defaultValue && opt.value === defaultValue) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        this.wrapper.appendChild(select);
        this.select = select;
    }

    public getElement(): HTMLSelectElement {
        return this.select;
    }

    public getAllElements(): HTMLElement[] {
        return [this.wrapper];
    }

    public getValue(): string {
        return this.select.value;
    }

    public setValue(value: string): void {
        this.select.value = value;
    }
}
