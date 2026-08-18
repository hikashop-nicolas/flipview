// Vendored from StPageFlip (MIT, github.com/Nodlik/StPageFlip, master ab30ecc).
// Upstream is unmaintained: 42 open issues, 4 open pull requests, and an issue
// asking for it to be marked abandoned. We own it from here.
/**
 * Type representing a point on a plane
 */
export interface Point {
    x: number;
    y: number;
}

/**
 * Type representing a coordinates of the rectangle on the plane
 */
export interface RectPoints {
    /** Coordinates of the top left corner */
    topLeft: Point;
    /** Coordinates of the top right corner */
    topRight: Point;
    /** Coordinates of the bottom left corner */
    bottomLeft: Point;
    /** Coordinates of the bottom right corner */
    bottomRight: Point;
}

/**
 * Type representing a rectangle
 */
export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/**
 * Type representing a book area
 */
export interface PageRect {
    left: number;
    top: number;
    width: number;
    height: number;
    /** Page width. If portrait mode is equal to the width of the book. In landscape mode - half of the total width. */
    pageWidth: number;
}

/**
 * Type representing a line segment contains two points: start and end
 */
export type Segment = [Point, Point];
