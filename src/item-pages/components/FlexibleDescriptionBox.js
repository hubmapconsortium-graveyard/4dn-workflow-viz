'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import {Fade} from 'react-bootstrap';
import {console, layout, isServerSide} from './../../util';
import * as vizUtil from './../../viz/utilities';


export class FlexibleCharacterCountBox extends React.Component {

	static propTypes = {
		'characters': PropTypes.number.isRequired,
		'string': PropTypes.string.isRequired,
		'icon': PropTypes.element
	}

	constructor(props) {
		super(props);
		this.render = this.render.bind(this);
		this.onClick = _.debounce(this.onClick.bind(this), 300, true);
		this.state = {
			'expanded': props.defaultExpanded || false
		};
	}

	onClick() {
		this.setState({'expanded': !this.state.expanded});
	}

	render() {
		var expandable = this.props.string.length > (this.props.characters || this.props.expandCharacters);
		if (!expandable) {
			return <span>{this.props.string}</span>;
		}
		var expanded = this.state.expanded;
		var icon = (
			this.props.icon && React.cloneElement(this.props.icon, {
				'onClick': this.onClick,
				'expanded': this.state.expanded,
				'data-expanded': this.state.expanded
			}) || <i className={"icon icon-" + (expanded ? 'minus' : 'plus')} onClick={this.onClick}/>
		);

		return (
			<span>
                <FlexibleCharacterCountString
					string={this.props.string}
					expanded={expanded}
					expandCharacters={this.props.characters || this.props.expandCharacters}
				/> &nbsp; {icon}
            </span>
		);
	}

}


class FlexibleCharacterCountString extends React.Component {

	static propTypes = {
		'string': PropTypes.string,
		'expanded': PropTypes.oneOfType([
			PropTypes.bool,
			PropTypes.func
		]),
		'expandCharacters': PropTypes.oneOfType([
			PropTypes.number,
			PropTypes.func
		]),
	}

	static defaultProps = {
		'expanded': false
	}

	isExpanded(props = this.props) {
		if (typeof props.expanded === 'boolean') return props.expanded;
		if (typeof props.expanded === 'function') return props.expanded(props);
	}

	render() {
		var expanded = this.isExpanded(this.props);
		if (expanded) return this.props.string;
		else {
			if (typeof this.props.expandCharacters === 'number' && typeof this.props.string === 'string') {
				return this.props.string.slice(0, this.props.expandCharacters);
			} else {
				throw new Error('props.string must be a string and props.expandCharacters must be a number.');
			}
		}
	}

}

/**
 * Works by calculating height of text content using a temporary off-screen container element.
 * Not related to FlexibleCharacterCount.. classes above.
 */
export class FlexibleDescriptionBox extends React.Component {

	static defaultDimensions = {
		'paddingWidth': 0,
		'paddingHeight': 0,
		'buttonWidth': 30,
		'initialHeight': 19
	}

	static propTypes = {
		'description': PropTypes.any.isRequired,
		'dimensions': PropTypes.shape({
			'paddingWidth': PropTypes.number,
			'paddingHeight': PropTypes.number,
			'buttonWidth': PropTypes.number,
			'initialHeight': PropTypes.number
		}),
		'fitTo': PropTypes.oneOf(['grid', 'parent', 'self']),
		'includeButton': PropTypes.bool,   // If false, must use refs and call this.toggleDescriptionExpand manually
		'className': PropTypes.string,
		'textClassName': PropTypes.string,
		'textElement': PropTypes.oneOf(['p', 'span', 'div', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
		'textStyle': PropTypes.object,
		'expanded': PropTypes.bool,
		'windowWidth': PropTypes.number.isRequired
	}

	static defaultProps = {
		'dimensions': null,
		'fitTo': 'self',
		'includeButton': true,
		'className': null,
		'textClassName': null,
		'textElement': 'p',
		'textStyle': null,
		'debug': false,
		'linesOfText': 1,
		'lineHeight': 19,
		'defaultExpanded': false,
		'collapsedHeight': null
	}

	constructor(props) {
		super(props);
		this.dimensions = this.dimensions.bind(this);
		this.checkWillDescriptionFitOneLineAndUpdateHeight = this.checkWillDescriptionFitOneLineAndUpdateHeight.bind(this);
		this.toggleDescriptionExpand = this.toggleDescriptionExpand.bind(this);
		this.makeShortContent = this.makeShortContent.bind(this);
		this.descriptionHeight = null;
		this.state = {
			'descriptionExpanded': props.defaultExpanded,
			'descriptionWillFitOneLine': true,
			'descriptionWhiteSpace': this.props.linesOfText > 1 ? 'normal' : 'nowrap',
			'shortContent': null,
			'mounted': false
		};
	}

	componentDidUpdate(pastProps, pastState) {
		// Handle window resize
		if (pastProps.windowWidth !== this.props.windowWidth) { // Recalculate some layouting stuff

			vizUtil.requestAnimationFrame(() => {

				this.setState((currState, currProps) => {

					var oldHeight = this.descriptionHeight,
						willDescriptionFitAtNewWindowSize = this.checkWillDescriptionFitOneLineAndUpdateHeight();

					return {
						'descriptionWillFitOneLine': willDescriptionFitAtNewWindowSize,
						'shortContent': this.props.linesOfText > 1 ? this.makeShortContent() : null
					};
				});

			});

		}
	}

	componentDidMount() {
		if (this.props.debug) console.info("Mounted FlexibleDescriptionBox");
		if (!isServerSide()) {

			// Create throttled version of toggleDescriptionExpand for button.
			this.throttledToggleDescriptionExpand = _.throttle(this.toggleDescriptionExpand, 350);

			vizUtil.requestAnimationFrame(() => {
				var willDescriptionFitAtCurrentSize = this.checkWillDescriptionFitOneLineAndUpdateHeight();
				this.setState({
					'descriptionWillFitOneLine': willDescriptionFitAtCurrentSize,
					'mounted': true,
					'shortContent': this.props.linesOfText > 1 ? this.makeShortContent() : null
				});
			});
		}

	}

	componentWillUnmount() {
		if (typeof window != 'undefined') {
			delete this.throttledToggleDescriptionExpand;
		}
	}

	makeShortContent() {
		var charsToKeep = 0.133 * (this.props.linesOfText * (this.descriptionWidth || 20));
		return this.props.description.slice(0, charsToKeep) + (!this.props.description.charAt(charsToKeep) ? '' : '...');
	}

	dimensions() {
		if (this.props.dimensions) return _.extend({}, FlexibleDescriptionBox.defaultDimensions, this.props.dimensions);
		else return _.clone(FlexibleDescriptionBox.defaultDimensions);
	}

	checkWillDescriptionFitOneLineAndUpdateHeight() {
		var {description, textElement, textClassName, textStyle, windowWidth, linesOfText, lineHeight, fitTo} = this.props;

		if (isServerSide()) return true;

		var dims = this.dimensions(),
			containerWidth;

		if (fitTo === 'grid') {
			containerWidth = layout.gridContainerWidth(windowWidth || null);
		} else if (fitTo === 'parent') {
			containerWidth = this.boxRef.current.parentElement.offsetWidth;
		} else if (fitTo === 'self') {
			containerWidth = this.boxRef.current.offsetWidth || 1000;
		}

		containerWidth -= dims.paddingWidth; // Account for inner padding & border.

		var tcw = layout.textContentWidth(
			description, textElement, textClassName,
			containerWidth - dims.buttonWidth, // Account for expand button.
			textStyle
		);

		if (!tcw) return true;


		this.descriptionHeight = tcw.containerHeight + dims.paddingHeight; // Account for padding, border.
		this.descriptionWidth = containerWidth;

		// If we want more than 1 line, calculate if descriptionheight / lineheight > linesWanted.
		if (typeof linesOfText === 'number' && linesOfText > 1 && typeof lineHeight === 'number') {
			var divRes = Math.ceil(this.descriptionHeight / lineHeight);
			if (divRes > linesOfText) {
				return false;
			}
			return true;
		}

		if (tcw.textWidth < containerWidth) {
			return true;
		}
		return false;
	}

	toggleDescriptionExpand() {
		this.setState({
			descriptionWhiteSpace: 'normal',
			descriptionExpanded: !this.state.descriptionExpanded
		}, () => {
			if (!this.state.descriptionExpanded && this.props.linesOfText === 1) {
				// Delay whiteSpace style since can't transition it w/ CSS3
				setTimeout(() => {
					this.setState({
						descriptionWhiteSpace: 'nowrap'
					});
				}, 350);
			} else if (!this.state.descriptionExpanded) {

			}
		});
	}

	render() {
		var {debug, showOnMount, lineHeight, linesOfText, collapsedHeight, className, textElement, textClassName, textStyle, description, fitTo} = this.props,
			{descriptionWillFitOneLine, descriptionExpanded, mounted, shortContent, descriptionWhiteSpace} = this.state;
		if (debug) console.log('render FlexibleDescriptionBox');
		var expandButton;
		var expanded = descriptionExpanded || this.props.expanded;

		if (!descriptionWillFitOneLine && typeof this.props.expanded !== 'boolean') {
			expandButton = (
				<button type="button" className="description-expand-button right"
						onClick={this.throttledToggleDescriptionExpand}>
					<i className={"icon icon-" + (expanded ? 'minus' : 'plus')}/>
				</button>
			);
		}

		var containerHeightSet = (expanded ?
				this.descriptionHeight
				:
				!this.state.mounted && showOnMount ? (
					0
				) : collapsedHeight || Math.min(
					Math.max(
						this.dimensions().initialHeight,
						lineHeight * (linesOfText || 1)
					),
					(mounted && this.descriptionHeight) || 1000
				)
		);

		// Add boxRef to our instance only if we need to.
		// Moved from componentWillReceiveProps as this lifecycle method is being deprecated.
		if (!this.boxRef && (fitTo === 'self' || fitTo === 'parent')) {
			this.boxRef = React.createRef();
		}

		return (
			<div ref={this.boxRef || null}
				 className={"flexible-description-box " + (className ? className : '') + (expandButton ? (expanded ? ' expanded' : ' collapsed') : ' not-expandable')}
				 style={{
					 'height': containerHeightSet,
					 'whiteSpace': expanded ? 'normal' : descriptionWhiteSpace,
					 'visibility': !mounted && showOnMount ? 'hidden' : null
				 }}>
				{expandButton}
				{React.createElement(textElement, {
					'className': textClassName,
					'style': textStyle
				}, expanded ? description : shortContent || description)}
			</div>
		);
	}

}
