// Vendored from StPageFlip (MIT, github.com/Nodlik/StPageFlip, master ab30ecc).
// Upstream is unmaintained: 42 open issues, 4 open pull requests, and an issue
// asking for it to be marked abandoned. We own it from here.
import { Render } from '../Render/Render';
import type { Point } from '../BasicTypes';

/**
 * State of the page on the basis of which rendering
 */
export interface PageState {
    /** Page rotation angle */
    angle: number;

    /** Page scope */
    area: (Point | null)[];

    /** Page position */
    position: Point;

    /** Rotate angle for hard pages */
    hardAngle: number;

    /** Rotate angle for hard pages at renedering time */
    hardDrawingAngle: number;
}

export enum PageOrientation {
    /** Left side page */
    LEFT,

    /** Right side page */
    RIGHT,
}

export enum PageDensity {
    SOFT = 'soft',
    HARD = 'hard',
}

/**
 * Class representing a book page
 */
export abstract class Page {
    /** State of the page on the basis of which rendering */
    protected state: PageState;
    /** Render object */
    protected render: Render;

    /** Page Orientation */
    protected orientation!: PageOrientation;

    /** Density at creation */
    protected createdDensity: PageDensity;
    /**
     * Whether the density came from the page itself rather than from a default.
     *
     * Ours: the collection makes the cover and a lone last page rigid whether or
     * not anyone asked, which leaves a caller no way to say "not rigid". A page
     * that has chosen is left alone.
     */
    protected chosenDensity = false;
    /** Density at the time of rendering (Depends on neighboring pages) */
    protected nowDrawingDensity: PageDensity;

    protected constructor(render: Render, density: PageDensity) {
        this.state = {
            angle: 0,
            area: [],
            position: { x: 0, y: 0 },
            hardAngle: 0,
            hardDrawingAngle: 0,
        };

        this.createdDensity = density;
        this.nowDrawingDensity = this.createdDensity;

        this.render = render;
    }

    /**
     * Render static page
     * 
     * @param {PageOrientation} orient - Static page orientation
     */
    public abstract simpleDraw(orient: PageOrientation): void;

    /**
     * Render dynamic page, using state
     * 
     * @param {PageDensity} tempDensity - Density at the time of rendering 
     */
    public abstract draw(tempDensity?: PageDensity): void;

    /**
     * Page loading
     */
    public abstract load(): void;

    /**
     * Set a constant page density
     * 
     * @param {PageDensity} density 
     */
    /** Says that this page's density is its own, and not to be overridden. */
    public chooseDensity(density: PageDensity): void {
        this.chosenDensity = true;
        this.setDensity(density);
    }

    public hasChosenDensity(): boolean {
        return this.chosenDensity;
    }

    public setDensity(density: PageDensity): void {
        this.createdDensity = density;
        this.nowDrawingDensity = density;
    }

    /**
     * Set temp page density to next render
     * 
     * @param {PageDensity}  density 
     */
    public setDrawingDensity(density: PageDensity): void {
        this.nowDrawingDensity = density;
    }

    /**
     * Set page position
     * 
     * @param {Point} pagePos 
     */
    public setPosition(pagePos: Point): void {
        this.state.position = pagePos;
    }

    /**
     * Set page angle
     * 
     * @param {number} angle 
     */
    public setAngle(angle: number): void {
        this.state.angle = angle;
    }

    /**
     * Set page crop area
     * 
     * @param {Point[]} area 
     */
    public setArea(area: (Point | null)[]): void {
        this.state.area = area;
    }

    /**
     * Rotate angle for hard pages to next render
     * 
     * @param {number} angle 
     */
    public setHardDrawingAngle(angle: number): void {
        this.state.hardDrawingAngle = angle;
    }

    /**
     * Rotate angle for hard pages
     * 
     * @param {number} angle 
     */
    public setHardAngle(angle: number): void {
        this.state.hardAngle = angle;
        this.state.hardDrawingAngle = angle;
    }

    /**
     * Set page orientation
     * 
     * @param {PageOrientation} orientation 
     */
    public setOrientation(orientation: PageOrientation): void {
        this.orientation = orientation;
    }

    /**
     * Get temp page density
     */
    public getDrawingDensity(): PageDensity {
        return this.nowDrawingDensity;
    }

    /**
     * Get a constant page density
     */
    public getDensity(): PageDensity {
        return this.createdDensity;
    }
    
    /**
     * Get rotate angle for hard pages
     */
    public getHardAngle(): number {
        return this.state.hardAngle;
    }

    public abstract newTemporaryCopy(): Page | null;
    public abstract getTemporaryCopy(): Page | null;
    public abstract hideTemporaryCopy(): void;
}
