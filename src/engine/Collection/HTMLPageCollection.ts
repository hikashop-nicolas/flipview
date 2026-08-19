// Vendored from StPageFlip (MIT, github.com/Nodlik/StPageFlip, master ab30ecc).
// Upstream is unmaintained: 42 open issues, 4 open pull requests, and an issue
// asking for it to be marked abandoned. We own it from here.
import { HTMLPage } from '../Page/HTMLPage';
import { Render } from '../Render/Render';
import { PageCollection } from './PageCollection';
import { PageFlip } from '../PageFlip';
import { PageDensity } from '../Page/Page';

/**
 * Сlass representing a collection of pages as HTML Element
 */
export class HTMLPageCollection extends PageCollection {
    private readonly pagesElement: NodeListOf<HTMLElement> | HTMLElement[];

    constructor(
        app: PageFlip,
        render: Render,
        _element: HTMLElement,
        items: NodeListOf<HTMLElement> | HTMLElement[]
    ) {
        super(app, render);

        this.pagesElement = items;
    }

    public load(): void {
        for (const pageElement of this.pagesElement) {
            const declared = pageElement.dataset['density'];
            const page = new HTMLPage(
                this.render,
                pageElement,
                declared === 'hard' ? PageDensity.HARD : PageDensity.SOFT
            );

            // Ours: a page that says what it is keeps it. Without this the
            // collection makes every cover rigid, and "rigid covers off" does
            // nothing at all.
            if (declared !== undefined) {
                page.chooseDensity(declared === 'hard' ? PageDensity.HARD : PageDensity.SOFT);
            }

            page.load();
            this.pages.push(page);
        }

        this.createSpread();
    }
}
