'use strict';

/**
 * A collection of components which are most specific to static pages.
 *
 * @module static-pages/components
 */

export {Announcements} from './Announcements';
export {TableOfContents, MarkdownHeading, NextPreviousPageSection, HeaderWithLink} from './TableOfContents';
export {
	StackedBlockVisual, StackedBlockGroupedRow, sumPropertyFromList, groupByMultiple, cartesian
}from './StackedBlockVisual';
export {
	BasicStaticSectionBody, BasicUserContentBody, UserContentBodyList, EmbeddedHiglassActions
}from './BasicStaticSectionBody';
export {HomePageCarousel} from './HomePageCarousel';
