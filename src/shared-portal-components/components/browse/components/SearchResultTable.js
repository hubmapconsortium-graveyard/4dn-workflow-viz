'use strict';

/* @flow */

import React from 'react';
import PropTypes from 'prop-types';
import url from 'url';
import _ from 'underscore';
import queryString from 'querystring';
import memoize from 'memoize-one';
import ReactTooltip from 'react-tooltip';
import Infinite from 'react-infinite';
import { Sticky, StickyContainer } from 'react-sticky';

import { Detail } from './../../ui/ItemDetailList';
import { patchedConsoleInstance as console } from './../../util/patched-console';
import { isServerSide } from './../../util/misc';
import { navigate } from './../../util/navigate';
import { itemUtil } from './../../util/object';
import { load } from './../../util/ajax';
import { getPageVerticalScrollPosition, getElementOffset, responsiveGridState } from './../../util/layout';
import { getItemTypeTitle } from './../../util/schema-transforms';
import { requestAnimationFrame as raf, style } from './../../viz/utilities';
import { Alerts } from './../../ui/Alerts';

import {
    columnsToColumnDefinitions, ResultRowColumnBlockValue, DEFAULT_WIDTH_MAP,
    getColumnWidthFromDefinition, HeadersRow
} from './table-commons';



const ResultRowColumnBlock = React.memo(function ResultRowColumnBlock(props){
    const { columnDefinition, columnNumber, mounted, headerColumnWidths, schemas, windowWidth } = props;
    let blockWidth;

    if (mounted){
        blockWidth = headerColumnWidths[columnNumber] || getColumnWidthFromDefinition(columnDefinition, mounted, windowWidth);
    } else {
        blockWidth = getColumnWidthFromDefinition(columnDefinition, mounted, windowWidth);
    }

    return ( // props includes result
        <div className="search-result-column-block" style={{ "width" : blockWidth }} data-field={columnDefinition.field}>
            <ResultRowColumnBlockValue {...props} width={blockWidth} schemas={schemas} />
        </div>
    );
});

/** Not used anywhere (?) */
const DefaultDetailPane = React.memo(function DefaultDetailPane({ result }){
    return (
        <div>
            {result.description ?
                <div className="flexible-description-box result-table-result-heading">
                    {result.description}
                </div>
                : null}
            <div className="item-page-detail">
                <h4 className="text-300">Details</h4>
                <Detail context={result} open={false}/>
            </div>
        </div>
    );
});


class ResultDetail extends React.PureComponent{

    static propTypes = {
        'result'    : PropTypes.object.isRequired,
        'open'      : PropTypes.bool.isRequired,
        'renderDetailPane': PropTypes.func.isRequired,
        'rowNumber' : PropTypes.number,
        'toggleDetailOpen' : PropTypes.func.isRequired
    };

    constructor(props){
        super(props);
        this.setDetailHeightFromPane = this.setDetailHeightFromPane.bind(this);
        this.state = { 'closing' : false };

        this.detailRef = React.createRef();

        this.firstFoundHeight = null;
    }

    /**
     * @todo Call this function in ExperimentSetDetailPane to keep heights up-to-date
     * when Processed Files or Raw Files sections are expanded/collapsed as well as just row itself.
     */
    setDetailHeightFromPane(height = null){
        const { setDetailHeight } = this.props;
        if (typeof height !== 'number'){
            var domElem = this.detailRef && this.detailRef.current;
            height = domElem && parseInt(domElem.offsetHeight);
            if (!this.firstFoundHeight && height && !isNaN(height)){
                this.firstFoundHeight = height;
            }
        }
        if (isNaN(height) || typeof height !== 'number') {
            height = this.firstFoundHeight || 1;
        }
        setDetailHeight(height);
    }

    componentDidUpdate(pastProps, pastState){
        const { open, setDetailHeight } = this.props;
        if (pastProps.open !== open){
            if (open && typeof setDetailHeight === 'function'){
                setTimeout(this.setDetailHeightFromPane, 100);
            }
        }
    }

    render(){
        const { open, rowNumber, result, tableContainerWidth, tableContainerScrollLeft, renderDetailPane, toggleDetailOpen } = this.props;
        const { closing } = this.state;
        return (
            <div className={"result-table-detail-container detail-" + (open || closing ? 'open' : 'closed')}>
                { open ?
                    <div className="result-table-detail" ref={this.detailRef} style={{
                        'width' : tableContainerWidth,
                        'transform' : style.translate3d(tableContainerScrollLeft)
                    }}>
                        { renderDetailPane(result, rowNumber, tableContainerWidth, this.setDetailHeightFromPane) }
                        <div className="close-button-container text-center" onClick={toggleDetailOpen} data-tip="Collapse Details">
                            <i className="icon icon-angle-up fas"/>
                        </div>
                    </div>
                    : <div/> }
            </div>
        );
    }
}


class ResultRow extends React.PureComponent {

    static areWidthsEqual(arr1, arr2){
        if (arr1.length !== arr2.length) return false;
        for (var i = 0; i < arr1.length; i++){
            if (arr1[i] !== arr2[i]) return false;
        }
        return true;
    }

    static propTypes = {
        'result'            : PropTypes.shape({
            '@type'             : PropTypes.arrayOf(PropTypes.string).isRequired,
            '@id'               : PropTypes.string,
            'lab'               : PropTypes.object,
            'display_title'     : PropTypes.string.isRequired,
            'status'            : PropTypes.string,
            'date_created'      : PropTypes.string.isRequired
        }).isRequired,
        'rowNumber'         : PropTypes.number.isRequired,
        'mounted'           : PropTypes.bool.isRequired,
        'columnDefinitions'     : PropTypes.arrayOf(PropTypes.shape({
            'title'             : PropTypes.string.isRequired,
            'field'             : PropTypes.string.isRequired,
            'render'            : PropTypes.func,
            'widthMap'          : PropTypes.shape({
                'lg'                : PropTypes.number.isRequired,
                'md'                : PropTypes.number.isRequired,
                'sm'                : PropTypes.number.isRequired
            })
        })).isRequired,
        'headerColumnWidths' : PropTypes.array,
        'renderDetailPane'  : PropTypes.func.isRequired,
        'openDetailPanes' : PropTypes.object.isRequired,
        'setDetailHeight' : PropTypes.func.isRequired,
        'id' : PropTypes.string.isRequired
    };

    constructor(props){
        super(props);
        //this.shouldComponentUpdate = this.shouldComponentUpdate.bind(this);
        this.toggleDetailOpen = _.throttle(this.toggleDetailOpen.bind(this), 250);
        this.isOpen = this.isOpen.bind(this);
        this.setDetailHeight = this.setDetailHeight.bind(this);
        this.handleDragStart = this.handleDragStart.bind(this);
    }

    setDetailHeight(){
        const { id, setDetailHeight : parentSetDetailHeight } = this.props;
        parentSetDetailHeight(id, ...arguments);
    }

    toggleDetailOpen(){
        const { id, toggleDetailPaneOpen } = this.props;
        toggleDetailPaneOpen(id);
    }

    isOpen(){
        const { openDetailPanes, id } = this.props;
        return openDetailPanes[id] || false;
    }

    /** Add some JSON data about the result item upon initiating dragstart. */
    handleDragStart(evt){
        if (!evt || !evt.dataTransfer) return;
        const { result, href, schemas } = this.props;

        // Result JSON itself.
        evt.dataTransfer.setData('text/4dn-item-json', JSON.stringify(result));

        // Result URL and @id.
        const hrefParts = url.parse(href);
        const atId = itemUtil.atId(result);
        const formedURL = (
            (hrefParts.protocol || '') +
            (hrefParts.hostname ? '//' +  hrefParts.hostname + (hrefParts.port ? ':' + hrefParts.port : '') : '') +
            atId
        );
        evt.dataTransfer.setData('text/plain', formedURL);
        evt.dataTransfer.setData('text/uri-list', formedURL);
        evt.dataTransfer.setData('text/4dn-item-id', atId);

        // Add cool drag image (generate HTML element showing display_title and item type)
        if (!document || !document.createElement) return;
        const element = document.createElement('div');
        element.className = "draggable-item-cursor";
        let innerText = result.display_title;  // document.createTextNode('')
        const innerBoldElem = document.createElement('strong');
        innerBoldElem.appendChild(document.createTextNode(innerText));
        element.appendChild(innerBoldElem);
        element.appendChild(document.createElement('br'));
        innerText = getItemTypeTitle(result, schemas);  // document.createTextNode('')
        element.appendChild(document.createTextNode(innerText));
        document.body.appendChild(element);
        evt.dataTransfer.setDragImage(element, 150, 30);
        setTimeout(()=>{
            document.body.removeChild(element);
        }, 10);
    }

    renderColumns(){
        // TODO (?) prop func to do this to control which columns get which props.
        // to make more reusable re: e.g. `selectedFiles` (= 4DN-specific).
        const { columnDefinitions, selectedFiles } = this.props;
        const detailOpen  = this.isOpen();
        return _.map(columnDefinitions, (columnDefinition, columnNumber) => {
            const passedProps = _.extend(
                // Contains required 'result', 'rowNumber', 'href', 'headerColumnWidths', 'mounted', 'windowWidth', 'schemas', 'currentAction
                _.omit(this.props, 'tableContainerWidth', 'tableContainerScrollLeft', 'renderDetailPane', 'id'),
                {
                    columnDefinition, columnNumber, detailOpen,
                    'key' : columnDefinition.field,
                    'toggleDetailOpen' : this.toggleDetailOpen,
                    // Only needed on first column (contains title, checkbox)
                    'selectedFiles' : columnNumber === 0 ? selectedFiles : null
                }
            );
            return <ResultRowColumnBlock {...passedProps} />;
        });
    }

    render(){
        const { rowNumber, currentAction } = this.props;
        const detailOpen  = this.isOpen();
        const isDraggable = currentAction === 'selection';

        /**
         * Props passed to ResultDetail include:
         * `result`, `renderDetailPane`, `rowNumber`, `tableContainerWidth`, `tableContainerScrollLeft`.
         *
         * It should also contain selectedFiles if parent passes it down.
         */
        const detailProps = _.omit(this.props,
            'openDetailPanes', 'mounted', 'headerColumnWidths', 'columnDefinitions', 'id',
            'detailOpen', 'setDetailHeight'
        );

        return (
            <div className={"search-result-row detail-" + (detailOpen ? 'open' : 'closed') + (isDraggable ? ' is-draggable' : '')} data-row-number={rowNumber} /* ref={(r)=>{
                // TODO POTENTIALLY: Use to set height on open/close icon & sticky title column.
                var height = (r && r.offsetHeight) || null;
                if (height && height !== this.rowFullHeight){
                    this.rowFullHeight = height;
                }
            }}*/>
                <div className="columns clearfix result-table-row" draggable={isDraggable} onDragStart={isDraggable ? this.handleDragStart : null}>
                    { this.renderColumns() }
                </div>
                <ResultDetail {...detailProps} open={!!(detailOpen)}
                    toggleDetailOpen={this.toggleDetailOpen} setDetailHeight={this.setDetailHeight} />
            </div>
        );
    }
}


class LoadMoreAsYouScroll extends React.PureComponent {

    static propTypes = {
        'href' : PropTypes.string.isRequired,
        'limit' : PropTypes.number,
        'rowHeight' : PropTypes.number.isRequired
    };

    static defaultProps = {
        'limit' : 25,
        'debouncePointerEvents' : 150,
        'openRowHeight' : 56,
        'onDuplicateResultsFoundCallback' : function(){
            Alerts.queue({ 'title' : 'Results Refreshed', 'message' : 'Results have changed while loading and have been refreshed.', 'navigateDisappearThreshold' : 1 });
        }
    };

    static canLoadMore(totalExpected, results){
        return totalExpected > results.length;
    }

    constructor(props){
        super(props);
        this.getInitialFrom = this.getInitialFrom.bind(this);
        this.rebuiltHref = this.rebuiltHref.bind(this);
        this.handleLoad = _.throttle(this.handleLoad.bind(this), 3000);
        //this.handleScrollingStateChange = this.handleScrollingStateChange.bind(this);
        //this.handleScrollExt = this.handleScrollExt.bind(this);
        var state = {
            'isLoading' : false,
            'canLoad' : true
        };
        this.lastIsScrolling = false;
        if (typeof props.mounted === 'undefined'){
            state.mounted = false;
        }
        this.state = state;
    }

    componentDidMount(){
        if (typeof this.state.mounted === 'boolean') {
            this.setState({ 'mounted' : true });
        }
    }

    getInitialFrom(){
        const { href } = this.props;
        if (typeof href === 'string'){
            const parts = url.parse(href, true);
            if (parts.query.limit && !isNaN(parts.query.from)) return parseInt(parts.query.from);
        }
        return 0;
    }

    rebuiltHref(){
        const { href, results } = this.props;
        const parts = url.parse(href, true);
        const q = parts.query;
        const initialFrom = this.getInitialFrom();
        q.from = initialFrom + results.length;
        parts.search = '?' + queryString.stringify(q);
        return url.format(parts);
    }

    handleLoad(){
        const nextHref = this.rebuiltHref();
        const loadCallback = (resp) => {
            if (resp && resp['@graph'] && resp['@graph'].length > 0){
                const { onDuplicateResultsFoundCallback, results, setResults } = this.props;
                // Check if have same result, if so, refresh all results (something has changed on back-end)
                const oldKeys = _.map(results, itemUtil.atId);
                const newKeys = _.map(resp['@graph'], itemUtil.atId);
                const keyIntersection = _.intersection(oldKeys.sort(), newKeys.sort());
                if (keyIntersection.length > 0){
                    console.error('FOUND ALREADY-PRESENT RESULT IN NEW RESULTS', keyIntersection, newKeys);
                    this.setState({ 'isLoading' : false }, ()=>{
                        navigate('', { 'inPlace' : true }, onDuplicateResultsFoundCallback);
                    });
                } else {
                    this.setState({ 'isLoading' : false }, ()=>{
                        setResults(results.slice(0).concat(resp['@graph']));
                    });
                }
            } else {
                this.setState({  'isLoading' : false });
            }
        };

        this.setState({ 'isLoading' : true }, ()=>{
            load(nextHref, loadCallback, 'GET', loadCallback);
        });
    }

    render(){
        const {
            children, rowHeight, openDetailPanes, openRowHeight, tableContainerWidth, tableContainerScrollLeft, totalExpected, results,
            mounted: propMounted
        } = this.props;
        const { mounted: stateMounted, isLoading } = this.state;
        if (!(propMounted || stateMounted)){
            return <div>{ children }</div>;
        }
        const elementHeight = _.keys(openDetailPanes).length === 0 ? rowHeight : React.Children.map(children, function(c){
            if (typeof openDetailPanes[c.props.id] === 'number'){
                //console.log('height', openDetailPanes[c.props.id], rowHeight, 2 + openDetailPanes[c.props.id] + openRowHeight);
                return openDetailPanes[c.props.id] + openRowHeight + 2;
            }
            return rowHeight;
        });
        const canLoad = LoadMoreAsYouScroll.canLoadMore(totalExpected, results);
        return (
            <Infinite
                elementHeight={elementHeight}
                useWindowAsScrollContainer
                onInfiniteLoad={this.handleLoad}
                isInfiniteLoading={isLoading}
                timeScrollStateLastsForAfterUserScrolls={250}
                //onChangeScrollState={this.handleScrollingStateChange}
                loadingSpinnerDelegate={(
                    <div className="search-result-row loading text-center" style={{
                        'maxWidth' : tableContainerWidth,
                        'transform' : style.translate3d(tableContainerScrollLeft)
                    }}>
                        <i className="icon icon-circle-o-notch icon-spin" />&nbsp; Loading...
                    </div>
                )}
                infiniteLoadBeginEdgeOffset={canLoad ? 200 : undefined}
                preloadAdditionalHeight={Infinite.containerHeightScaleFactor(1.5)}
                preloadBatchSize={Infinite.containerHeightScaleFactor(1.5)}>
                { children }
            </Infinite>
        );
    }
}

class ShadowBorderLayer extends React.Component {

    static shadowStateClass(hiddenLeftEdgeContentWidth = 0, hiddenRightEdgeContentWidth = 0){
        var shadowBorderClassName = "";
        if (hiddenLeftEdgeContentWidth > 0) shadowBorderClassName += ' shadow-left';
        if (hiddenRightEdgeContentWidth > 0) shadowBorderClassName += ' shadow-right';
        return shadowBorderClassName;
    }

    static defaultProps = {
        'horizontalScrollRateOnEdgeButton' : 10
    };

    static isWindowPastTableTop(tableContainerElement, windowHeight = null, scrollTop = null, tableTopOffset = null){
        if (isServerSide()) return false;
        if (!windowHeight)      windowHeight    = window.innerHeight;
        if (!scrollTop)         scrollTop       = getPageVerticalScrollPosition();
        if (!tableTopOffset)    tableTopOffset  = getElementOffset(tableContainerElement).top;
        if (windowHeight / 2 + scrollTop > tableTopOffset){
            return true;
        }
        return false;
    }

    constructor(props){
        super(props);
        this.scrolling = false;
        this.performScrollAction = this.performScrollAction.bind(this);
        this.handleLeftScrollButtonMouseDown = this.handleScrollButtonMouseDown.bind(this, 'left');
        this.handleRightScrollButtonMouseDown = this.handleScrollButtonMouseDown.bind(this, 'right');
        this.handleScrollButtonUp = this.handleScrollButtonUp.bind(this);
        this.lastDimClassName = null;
    }

    shouldComponentUpdate(nextProps){
        if (this.props.isWindowPastTableTop !== nextProps.isWindowPastTableTop) return true;
        var pastEdges = this.edgeHiddenContentWidths(this.props);
        var newEdges = this.edgeHiddenContentWidths(nextProps);
        if (newEdges.left !== pastEdges.left || newEdges.right !== pastEdges.right) return true;
        var dimClassName = this.tallDimensionClass(nextProps);
        if (this.lastDimClassName !== dimClassName){
            this.lastDimClassName = dimClassName;
            return true;
        }
        return false;
    }

    edgeHiddenContentWidths(props = this.props){
        var edges = { 'left' : 0, 'right' : 0 };
        var { fullRowWidth, tableContainerScrollLeft, tableContainerWidth } = props;
        if (fullRowWidth > tableContainerWidth){
            if (tableContainerScrollLeft > 5){
                //shadowBorderClassName += ' shadow-left';
                edges.left = tableContainerScrollLeft;
            }
            if (tableContainerScrollLeft + tableContainerWidth <= fullRowWidth - 5){
                edges.right = ((fullRowWidth - tableContainerWidth) - tableContainerScrollLeft);
                //shadowBorderClassName += ' shadow-right';
            }
        }
        return edges;
    }

    shadowStateClass(edges, props = this.props){
        if (!edges) edges = this.edgeHiddenContentWidths();
        return ShadowBorderLayer.shadowStateClass(edges.left, edges.right);
    }

    tallDimensionClass(props = this.props){
        var cls;
        var tableHeight = (props.innerContainerElem && props.innerContainerElem.offsetHeight) || 0;
        if (tableHeight > 800){
            cls = ' tall';
            /*
            if (!isServerSide()){
                var windowHeight = window.innerHeight;
                var scrollTop = document && document.body && document.body.scrollTop;
                var tableTopOffset = getElementOffset(props.innerContainerElem).top;
                if (windowHeight / 2 + scrollTop > tableTopOffset){
                    cls += ' fixed-position-arrows';
                }
            }
            */
        } else {
            cls = ' short';
        }
        return cls;
        //return this.lastDimClassName;
    }

    handleScrollButtonMouseDown(direction = "right", evt){
        if (evt.button === 0) { // Left click
            this.scrolling = true;
            this.performScrollAction(direction);
        }
    }

    edgeScrollButtonLeft(leftEdgeContentWidth){
        if (!this.props.innerContainerElem) return null;
        var className = "edge-scroll-button left-edge";
        if (typeof leftEdgeContentWidth !== 'number' || leftEdgeContentWidth === 0) {
            className += ' faded-out';
        }
        return (
            <div className={className} onMouseDown={this.handleLeftScrollButtonMouseDown} onMouseUp={this.handleScrollButtonUp} onMouseOut={this.handleScrollButtonUp}>
                <i className="icon icon-caret-left fas"/>
            </div>
        );
    }

    edgeScrollButtonRight(rightEdgeContentWidth){
        if (!this.props.innerContainerElem) return null;
        var className = "edge-scroll-button right-edge";
        if (typeof rightEdgeContentWidth !== 'number' || rightEdgeContentWidth === 0) {
            className += ' faded-out';
        }
        return (
            <div className={className} onMouseDown={this.handleRightScrollButtonMouseDown} onMouseUp={this.handleScrollButtonUp} onMouseOut={this.handleScrollButtonUp}>
                <i className="icon icon-caret-right fas"/>
            </div>
        );
    }

    performScrollAction(direction = "right"){
        const { horizontalScrollRateOnEdgeButton, tableContainerWidth, fullRowWidth, innerContainerElem, setContainerScrollLeft } = this.props;
        const scrollAction = (depth) => {
            var change = (direction === 'right' ? 1 : -1) * horizontalScrollRateOnEdgeButton;
            var maxScrollLeft = fullRowWidth - tableContainerWidth;
            var leftOffset = Math.max(0, Math.min(maxScrollLeft, innerContainerElem.scrollLeft + change));
            innerContainerElem.scrollLeft = leftOffset;
            setContainerScrollLeft(leftOffset);

            if (depth >= 10000){
                console.error("Reached depth 10k on a recursive function 'performScrollAction.'");
                return;
            }

            if (this.scrolling) {
                raf(function(){
                    scrollAction(depth + 1);
                });
            }
        };

        scrollAction(0);
    }

    handleScrollButtonUp(){
        this.scrolling = false;
    }

    render(){
        if (this.props.fullRowWidth <= this.props.tableContainerWidth) return null;
        var edges = this.edgeHiddenContentWidths();
        return (
            <div className={"shadow-border-layer hidden-xs" + this.shadowStateClass(edges) + this.tallDimensionClass() + (this.props.isWindowPastTableTop ? ' fixed-position-arrows' : '')}>
                { this.edgeScrollButtonLeft(edges.left) }{ this.edgeScrollButtonRight(edges.right) }
            </div>
        );
    }
}




class DimensioningContainer extends React.PureComponent {

    static resetHeaderColumnWidths(columnDefinitions, mounted = false, windowWidth=null){
        //const listOfZeroes = [].fill(0, 0, columnDefinitions.length);
        return _.map(columnDefinitions, function(colDef, i){
            return getColumnWidthFromDefinition(colDef, mounted, windowWidth);
        });
    }

    static findLargestBlockWidth(columnField){
        if (isServerSide() || !document.querySelectorAll) return null;
        var elementsFound = document.querySelectorAll('div.search-result-column-block[data-field="' + columnField + '"] .value');
        if (elementsFound){
            elementsFound = [...elementsFound];
        }

        var maxColWidth = null;

        if (elementsFound && elementsFound.length > 0){

            var headerElement = document.querySelector('div.search-headers-column-block[data-field="' + columnField + '"] .column-title');

            maxColWidth = Math.max(
                _.reduce(elementsFound, function(m, elem){
                    return Math.max(m, elem.offsetWidth);
                }, 0),
                (headerElement && (headerElement.offsetWidth + 12)) || 0
            );
        }

        return maxColWidth;
    }

    static findAndDecreaseColumnWidths(columnDefinitions, padding = 30, windowWidth=null){
        return columnDefinitions.map(function(colDef){
            var w = DimensioningContainer.findLargestBlockWidth(colDef.field);
            if (typeof w === 'number' && w < colDef.widthMap.lg) return w + padding;
            return getColumnWidthFromDefinition(colDef, true, windowWidth);
        });
    }

    static setDetailPanesLeftOffset(detailPanes, leftOffset = 0, cb = null){
        if (detailPanes && detailPanes.length > 0){
            var transformStyle = style.translate3d(leftOffset);
            _.forEach(detailPanes, function(d){
                d.style.transform = transformStyle;
            });
        }
        if (typeof cb === 'function') cb();
    }

    static findDetailPaneElements(){
        if (document && document.querySelectorAll){
            return Array.from(document.querySelectorAll('.result-table-detail'));
        }
        return null;
    }

    /**
     * We previously had used `object.itemUtil.compareResultsByID`, however
     * `getDerivedStateFromProps` is ran right before every single render so
     * for performance we compare list/object reference instead.
     *
     * If results have changed, it implicitly means something like href or user
     * session has changed as well.
     */
    static getDerivedStateFromProps(props, state){
        if (state.originalResults !== props.results){
            console.warn('props.results have changed, resetting some state -- ');
            return {
                'results' : props.results.slice(0),
                'openDetailPanes' : {},
                'originalResults' : props.results
            };
        }
        return null;
    }

    constructor(props){
        super(props);
        this.throttledUpdate = _.debounce(this.forceUpdate.bind(this), 500);
        this.toggleDetailPaneOpen = _.throttle(this.toggleDetailPaneOpen.bind(this), 500);
        this.setDetailHeight = this.setDetailHeight.bind(this);
        this.setContainerScrollLeft = this.setContainerScrollLeft.bind(this);
        this.onHorizontalScroll = this.onHorizontalScroll.bind(this);
        this.onVerticalScroll = _.throttle(this.onVerticalScroll.bind(this), 200);
        this.setHeaderWidths = _.throttle(this.setHeaderWidths.bind(this), 300);
        this.getTableDims = this.getTableDims.bind(this);
        this.resetWidths = this.resetWidths.bind(this);
        this.setResults = this.setResults.bind(this);
        this.canLoadMore = this.canLoadMore.bind(this);
        this.stickyHeaderTopOffset = this.stickyHeaderTopOffset.bind(this);
        this.renderHeadersRow = this.renderHeadersRow.bind(this);
        this.state = {
            'mounted'   : false,
            'widths'    : DimensioningContainer.resetHeaderColumnWidths(props.columnDefinitions, false, props.windowWidth),
            // We cache this here in order to be able props.results vs state.orginalResults
            // in getDerivedStateFromProps.
            // SearchResultTable _does not_ get context passed in, so we compare results instead.
            'originalResults' : props.results,
            'results'   : props.results.slice(0),
            'isWindowPastTableTop' : false,
            // { row key : detail pane height } used for determining if detail pane is open + height for Infinite listview
            'openDetailPanes' : {}
        };

        this.innerContainerRef      = React.createRef();
        this.loadMoreAsYouScrollRef = React.createRef();
    }

    componentDidMount(){
        var { columnDefinitions, windowWidth, registerWindowOnScrollHandler } = this.props,
            nextState = _.extend(this.getTableDims(), {
                'mounted' : true
            }),
            innerContainerElem = this.innerContainerRef.current;

        if (innerContainerElem){
            var fullRowWidth = HeadersRow.fullRowWidth(columnDefinitions, this.state.mounted, [], windowWidth);
            if (innerContainerElem.offsetWidth < fullRowWidth){
                nextState.widths = DimensioningContainer.findAndDecreaseColumnWidths(columnDefinitions, 30, windowWidth);
                nextState.isWindowPastTableTop = ShadowBorderLayer.isWindowPastTableTop(innerContainerElem);
            }
            innerContainerElem.addEventListener('scroll', this.onHorizontalScroll);
        } else {
            nextState.widths = DimensioningContainer.findAndDecreaseColumnWidths(columnDefinitions, 30, windowWidth);
        }

        // Register onScroll handler.
        this.scrollHandlerUnsubscribeFxn = registerWindowOnScrollHandler(this.onVerticalScroll);

        this.setState(nextState);
    }

    componentWillUnmount(){
        if (this.scrollHandlerUnsubscribeFxn){
            this.scrollHandlerUnsubscribeFxn();
            delete this.scrollHandlerUnsubscribeFxn;
        }
        const innerContainerElem = this.innerContainerRef.current;
        innerContainerElem && innerContainerElem.removeEventListener('scroll', this.onHorizontalScroll);
    }

    componentDidUpdate(pastProps, pastState){

        if (pastState.results !== this.state.results){
            ReactTooltip.rebuild();
        }

        if (pastProps.columnDefinitions.length !== this.props.columnDefinitions.length/* || this.props.results !== pastProps.results*/){
            // We have a list of widths in state; if new col is added, these are no longer aligned, so we reset.
            // We may optioanlly (currently disabled) also do this if _original_ results have changed as extra glitter to decrease some widths re: col values.
            // (if done when state.results have changed, it would occur way too many times to be performant (state.results changes as-you-scroll))
            this.resetWidths();
        } else if (pastProps.windowWidth !== this.props.windowWidth){
            this.setState(this.getTableDims());
        }
    }

    toggleDetailPaneOpen(rowKey, cb = null){
        this.setState(function({ openDetailPanes }){
            openDetailPanes = _.clone(openDetailPanes);
            if (openDetailPanes[rowKey]){
                delete openDetailPanes[rowKey];
            } else {
                openDetailPanes[rowKey] = true;
            }
            return { openDetailPanes };
        }, cb);
    }

    setDetailHeight(rowKey, height, cb){
        this.setState(function({ openDetailPanes }){
            openDetailPanes = _.clone(openDetailPanes);
            if (typeof openDetailPanes[rowKey] === 'undefined'){
                return null;
            }
            openDetailPanes[rowKey] = height;
            return { openDetailPanes };
        }, cb);
    }

    setContainerScrollLeft(nextScrollLeft){
        this.setState(function({ tableContainerScrollLeft }){
            if (tableContainerScrollLeft === nextScrollLeft) {
                return null;
            }
            return { 'tableContainerScrollLeft' : nextScrollLeft };
        });
    }

    onHorizontalScroll(e){
        e && e.stopPropagation();
        this.setContainerScrollLeft(e.target.scrollLeft || 0);
        return false;
    }

    onVerticalScroll(e){
        //if (!document || !window || !this.refs.innerContainer) return null;

        setTimeout(()=>{

            // Means this callback was finally (after setTimeout) called after `innerContainer` or `this` have been dismounted -- negligible occurence.
            const innerContainerElem = this.innerContainerRef.current;
            if (!innerContainerElem) return null;

            const { windowHeight, windowWidth } = this.props;
            const scrollTop = getPageVerticalScrollPosition();
            const tableTopOffset = getElementOffset(innerContainerElem).top;

            //var isWindowPastTableTop = ShadowBorderLayer.isWindowPastTableTop(innerContainerElem, windowHeight, scrollTop, tableTopOffset);


            var done = false;

            // Resize to full width.
            /*
            if (typeof this.props.fullWidthInitOffset === 'number' && typeof this.props.fullWidthContainerSelectorString === 'string'
                && !isServerSide() && document && document.body && document.querySelector
            ){
                var bodyWidth = document.body.offsetWidth || window.innerWidth;
                if (bodyWidth > 1200) {
                    var extraWidth = bodyWidth - 1180;
                    var distanceToTopOfTable = tableTopOffset - scrollTop + this.props.stickyHeaderTopOffset;
                    var pageTableContainer = document.querySelector(this.props.fullWidthContainerSelectorString);
                    if (pageTableContainer){
                        if (distanceToTopOfTable <= 5){
                            pageTableContainer.style.transition = "none";
                            pageTableContainer.style.marginLeft = pageTableContainer.style.marginRight = -(extraWidth / 2) + 'px';
                            if (this.lastDistanceToTopOfTable !== distanceToTopOfTable || !this.state.isWindowPastTableTop){
                                vizUtil.requestAnimationFrame(()=>{
                                    this.setState({ 'isWindowPastTableTop' : true });
                                });
                            }
                            done = true;
                        } else if (distanceToTopOfTable > 5 && distanceToTopOfTable <= this.props.fullWidthInitOffset){

                            //var fullWidthInitOffset = Math.min(this.props.fullWidthInitOffset, tableTopOffset + this.props.stickyHeaderTopOffset);
                            //var difScale = (fullWidthInitOffset - distanceToTopOfTable) / fullWidthInitOffset;
                            //pageTableContainer.style.transition = "margin-left .33s, margin-right .33s";
                            //pageTableContainer.style.marginLeft = pageTableContainer.style.marginRight = -((extraWidth * difScale) / 2) + 'px';
                            //if (this.lastDistanceToTopOfTable !== distanceToTopOfTable || !this.state.isWindowPastTableTop){
                            //    this.setState({ 'isWindowPastTableTop' : true });
                            //}

                        } else if (distanceToTopOfTable > this.props.fullWidthInitOffset){
                            pageTableContainer.style.transition = "margin-left .6s, margin-right .6s";
                            pageTableContainer.style.marginLeft = pageTableContainer.style.marginRight = '0px';
                            if ((this.lastDistanceToTopOfTable <= this.props.fullWidthInitOffset) || this.state.isWindowPastTableTop){
                                vizUtil.requestAnimationFrame(()=>{
                                    this.setState({ 'isWindowPastTableTop' : false });
                                });
                            }
                            done = true;
                        }
                        this.lastDistanceToTopOfTable = distanceToTopOfTable;

                    }
                    //console.log('V',scrollTop, tableTopOffset, distanceToTopOfTable);
                }
            }
            */

            if (!done){
                var isWindowPastTableTop = ShadowBorderLayer.isWindowPastTableTop(innerContainerElem, windowHeight, scrollTop, tableTopOffset);
                if (isWindowPastTableTop !== this.state.isWindowPastTableTop){
                    this.setState({ 'isWindowPastTableTop' : isWindowPastTableTop });
                }
            }


        }, 0);


    }

    getTableLeftOffset(){
        var innerContainerElem = this.innerContainerRef.current;
        return (innerContainerElem && getElementOffset(innerContainerElem).left) || null;
    }

    getTableContainerWidth(){
        var innerContainerElem = this.innerContainerRef.current;
        return (innerContainerElem && innerContainerElem.offsetWidth) || null;
    }

    getTableScrollLeft(){
        var innerContainerElem = this.innerContainerRef.current;
        return (innerContainerElem && typeof innerContainerElem.scrollLeft === 'number') ? innerContainerElem.scrollLeft : null;
    }

    getTableDims(){
        if (!SearchResultTable.isDesktopClientside(this.props.windowWidth)){
            return {
                'tableContainerWidth'       : this.getTableContainerWidth(),
                'tableContainerScrollLeft'  : null,
                'tableLeftOffset'           : null
            };
        }
        return {
            'tableContainerWidth'       : this.getTableContainerWidth(),
            'tableContainerScrollLeft'  : this.getTableScrollLeft(),
            'tableLeftOffset'           : this.getTableLeftOffset()
        };
    }

    resetWidths(){

        // 1. Reset state.widths to be [0,0,0,0, ...newColumnDefinitionsLength], forcing them to widthMap sizes.
        const resetWidthStateChangeFxn = function({ mounted }, { columnDefinitions, windowWidth }){
            return { "widths" : DimensioningContainer.resetHeaderColumnWidths(columnDefinitions, mounted, windowWidth) };
        };

        // 2. Upon render into DOM, decrease col sizes.
        const resetWidthStateChangeFxnCallback = () => {
            raf(()=>{
                var { columnDefinitions, windowWidth } = this.props;
                // 2. Upon render into DOM, decrease col sizes.
                this.setState(_.extend(
                    this.getTableDims(),
                    { 'widths' : DimensioningContainer.findAndDecreaseColumnWidths(columnDefinitions, 30, windowWidth) }
                ));
            });
        };

        this.setState(resetWidthStateChangeFxn, resetWidthStateChangeFxnCallback);
    }

    setHeaderWidths(widths){
        if (!Array.isArray(widths)) throw new Error('widths is not an array');
        this.setState({ 'widths' : widths });
    }

    setResults(results, cb){
        this.setState({
            'results' : _.uniq(results, false, itemUtil.atId)
        }, cb);
    }

    canLoadMore(){
        return LoadMoreAsYouScroll.canLoadMore(this.props.totalExpected, this.state.results);
    }

    stickyHeaderTopOffset(){
        const { windowWidth, stickyHeaderTopOffset } = this.props;
        const rgs = responsiveGridState(windowWidth);
        switch (rgs){
            case 'xs':
            case 'sm':
                return 0;
            case 'md':
            case 'lg':
            case 'xl':
                return stickyHeaderTopOffset || 0;
        }
    }

    renderHeadersRow({ style, isSticky, wasSticky, distanceFromTop, distanceFromBottom, calculatedHeight }){
        const { tableContainerWidth, tableLeftOffset, widths } = this.state;
        return (
            <HeadersRow
                {..._.pick(this.props, 'columnDefinitions', 'sortBy', 'sortColumn', 'sortReverse',
                    'defaultMinColumnWidth', 'rowHeight', 'renderDetailPane', 'windowWidth')}
                {..._.pick(this.state, 'mounted', 'results')}
                stickyHeaderTopOffset={this.stickyHeaderTopOffset()}
                headerColumnWidths={widths} setHeaderWidths={this.setHeaderWidths}
                tableLeftOffset={tableLeftOffset} tableContainerWidth={tableContainerWidth}
                stickyStyle={style} isSticky={isSticky} />
        );
    }

    renderResults(){
        const { columnDefinitions, windowWidth } = this.props;
        const { results, tableContainerWidth, tableContainerScrollLeft, mounted, widths, openDetailPanes } = this.state;
        const fullRowWidth = HeadersRow.fullRowWidth(columnDefinitions, mounted, widths, windowWidth);
        // selectedFiles passed to trigger re-render on PureComponent further down tree (DetailPane).
        const commonPropsToPass = _.extend(
            _.pick(this.props, 'columnDefinitions', 'renderDetailPane', 'href', 'currentAction', 'selectedFiles', 'windowWidth', 'schemas'),
            { openDetailPanes, tableContainerWidth, tableContainerScrollLeft,
                'mounted' : mounted || false, 'headerColumnWidths' : widths, 'rowWidth' : fullRowWidth, 'toggleDetailPaneOpen' : this.toggleDetailPaneOpen,
                'setDetailHeight' : this.setDetailHeight }
        );

        return _.map(results, (r, idx)=>{
            const id = itemUtil.atId(r);
            return <ResultRow {...commonPropsToPass} result={r} rowNumber={idx} id={id} key={id} />;
        });
    }

    render(){
        const { columnDefinitions, windowWidth } = this.props;
        const { tableContainerWidth, tableContainerScrollLeft, mounted, widths, isWindowPastTableTop } = this.state;
        const fullRowWidth = HeadersRow.fullRowWidth(columnDefinitions, mounted, widths, windowWidth);
        const canLoadMore = this.canLoadMore();
        const innerContainerElem = this.innerContainerRef.current;

        return (
            <div className="search-results-outer-container">
                <StickyContainer>
                    <div className={"search-results-container" + (canLoadMore === false ? ' fully-loaded' : '')}>
                        <div className="inner-container" ref={this.innerContainerRef}>
                            <div className="scrollable-container" style={{ minWidth : fullRowWidth + 6 }}>
                                <Sticky windowWidth={windowWidth} topOffset={this.stickyHeaderTopOffset()}>
                                    { this.renderHeadersRow /* Sticky calls children as if is function */ }
                                </Sticky>
                                <LoadMoreAsYouScroll
                                    {..._.pick(this.props, 'href', 'limit', 'rowHeight', 'totalExpected',
                                        'onDuplicateResultsFoundCallback', 'windowWidth', 'schemas')}
                                    {..._.pick(this.state, 'results', 'mounted', 'openDetailPanes')}
                                    {...{ tableContainerWidth, tableContainerScrollLeft, innerContainerElem }}
                                    setResults={this.setResults} ref={this.loadMoreAsYouScrollRef}
                                    //onVerticalScroll={this.onVerticalScroll}
                                >
                                    { this.renderResults() }
                                </LoadMoreAsYouScroll>
                            </div>
                        </div>
                        <ShadowBorderLayer {...{ tableContainerScrollLeft, tableContainerWidth, fullRowWidth, isWindowPastTableTop, innerContainerElem }}
                            setContainerScrollLeft={this.setContainerScrollLeft} />
                    </div>
                </StickyContainer>
                { canLoadMore === false ?
                    <div key="can-load-more" className="fin search-result-row">
                        <div className="inner">- <span>fin</span> -</div>
                    </div>
                    : <div key="can-load-more" className="search-result-row empty-block"/>
                }
            </div>
        );
    }

}

/**
 * Reusable table for displaying search results according to column definitions.
 *
 * @export
 * @class SearchResultTable
 * @prop {Object[]}         results             Results as returned from back-end, e.g. props.context['@graph'].
 * @prop {Object[]}         columns             List of column definitions.
 * @prop {Object}           [defaultWidthMap]   Default column widths per responsive grid state. Applied to all non-constant columns.
 * @prop {string[]}         [hiddenColumns]     Keys of columns to remove from final columnDefinitions before rendering.
 * @prop {function}         [renderDetailPane]  An instance of a React component which will receive prop 'result'.
 * @prop {string}           sortColumn          Current sort column, as fed by SortController.
 * @prop {boolean}          sortReverse         Whether current sort column is reversed, as fed by SortController.
 * @prop {function}         sortBy              Callback function for performing a sort, acceping 'sortColumn' and 'sortReverse' as params. As fed by SortController.
 */
export class SearchResultTable extends React.PureComponent {

    static isDesktopClientside(windowWidth){
        return !isServerSide() && responsiveGridState(windowWidth) !== 'xs';
    }

    /**
     * Returns the finalized list of columns and their properties in response to
     * {Object} `hiddenColumns`.
     *
     * @param {{ columnDefinitions: Object[], hiddenColumns: Object.<boolean> }} props Component props.
     */
    static filterOutHiddenCols = memoize(function(columnDefinitions, hiddenColumns){
        if (hiddenColumns){
            return _.filter(columnDefinitions, function(colDef){
                if (hiddenColumns[colDef.field] === true) return false;
                return true;
            });
        }
        return columnDefinitions;
    });

    static propTypes = {
        'results'           : PropTypes.arrayOf(ResultRow.propTypes.result).isRequired,
        'href'              : PropTypes.string.isRequired,
        'limit'             : PropTypes.number,
        'columnDefinitions' : PropTypes.arrayOf(PropTypes.object),
        'defaultWidthMap'   : PropTypes.shape({ 'lg' : PropTypes.number.isRequired, 'md' : PropTypes.number.isRequired, 'sm' : PropTypes.number.isRequired }).isRequired,
        'hiddenColumns'     : PropTypes.objectOf(PropTypes.bool),
        'renderDetailPane'  : PropTypes.func,
        'totalExpected'     : PropTypes.number.isRequired,
        'windowWidth'       : PropTypes.number.isRequired,
        'registerWindowOnScrollHandler' : PropTypes.func.isRequired,
        'columnExtensionMap' : PropTypes.objectOf(PropTypes.shape({
            "title" : PropTypes.string.isRequired,
            "widthMap" : PropTypes.shape({ 'lg' : PropTypes.number, 'md' : PropTypes.number, 'sm' : PropTypes.number }),
            "minColumnWidth" : PropTypes.number,
            "order" : PropTypes.number,
            "render" : PropTypes.func,
            "noSort" : PropTypes.bool
        }))
    };

    static defaultProps = {
        'columnExtensionMap' : {},
        'renderDetailPane' : function(result, rowNumber, width){ return <DefaultDetailPane {...{ result, rowNumber, width }} />; },
        'defaultWidthMap' : DEFAULT_WIDTH_MAP,
        'defaultMinColumnWidth' : 55,
        'hiddenColumns' : null,
        'limit' : 25,
        'rowHeight' : 47,
        'stickyHeaderTopOffset' : -40,
        'fullWidthInitOffset' : 60,
        'fullWidthContainerSelectorString' : '.browse-page-container',
        'currentAction' : null
    };

    constructor(props){
        super(props);
        this.getDimensionContainer = this.getDimensionContainer.bind(this);
        this.dimensionContainerRef = React.createRef();
    }

    getDimensionContainer(){
        return this.dimensionContainerRef.current;
    }

    render(){
        const { hiddenColumns, columnExtensionMap, columnDefinitions } = this.props;
        const colDefs = columnDefinitions || columnsToColumnDefinitions({ 'display_title' : { 'title' : 'Title' } }, columnExtensionMap);
        return (
            <DimensioningContainer
                {..._.omit(this.props, 'hiddenColumns', 'columnDefinitionOverrideMap', 'defaultWidthMap')}
                columnDefinitions={SearchResultTable.filterOutHiddenCols(colDefs, hiddenColumns)}
                ref={this.dimensionContainerRef} />
        );
    }
}