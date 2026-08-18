// @ts-nocheck
// Vendored from StPageFlip (MIT, github.com/Nodlik/StPageFlip, master ab30ecc).
// Upstream is unmaintained: 42 open issues, 4 open pull requests, and an issue
// asking for it to be marked abandoned. We own it from here.
//
// Checking is off inside this tree only: upstream predates strictNullChecks and
// turning it on cascades to ~150 sites, which would bury our own patches. Files
// get tightened as we touch them.
import { UI } from './UI';
import { PageFlip } from '../PageFlip';
import type { FlipSetting } from '../Settings';

/**
 * UI for HTML mode
 */
export class HTMLUI extends UI {
    private items: NodeListOf<HTMLElement> | HTMLElement[];

    constructor(
        inBlock: HTMLElement,
        app: PageFlip,
        setting: FlipSetting,
        items: NodeListOf<HTMLElement> | HTMLElement[]
    ) {
        super(inBlock, app, setting);

        // Second wrapper to HTML page
        this.wrapper.insertAdjacentHTML('afterbegin', '<div class="stf__block"></div>');

        this.distElement = inBlock.querySelector('.stf__block');

        this.items = items;
        for (const item of items) {
            this.distElement.appendChild(item);
        }

        this.setHandlers();
    }

    public clear(): void {
        for (const item of this.items) {
            this.parentElement.appendChild(item);
        }
    }

    /**
     * Update page list from HTMLElements
     *
     * @param {(NodeListOf<HTMLElement>|HTMLElement[])} items - List of pages as HTML Element
     */
    public updateItems(items: NodeListOf<HTMLElement> | HTMLElement[]): void {
        this.removeHandlers();

        this.distElement.innerHTML = '';

        for (const item of items) {
            this.distElement.appendChild(item);
        }
        this.items = items;

        this.setHandlers();
    }

    public update(): void {
        this.app.getRender().update();
    }
}
