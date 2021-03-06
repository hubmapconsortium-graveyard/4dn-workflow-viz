'use strict';

import React from 'react';
import _ from 'underscore';
import {object, console} from './../../util';

/**
 * Wraps a checkbox input to turn it into a toggle switch using CSS.
 * Use just like a checkbox input element.
 *
 * @type {Component}
 * @prop {string} id - A unique id. If not supplied, one is autogenerated.
 * @prop {function} onChange - Change event handler.
 * @prop {boolean} checked - Whether is checked or not.
 */
export class Toggle extends React.Component {

	static defaultProps = {
		'name': 'onoffswitch',
		'onChange': function (e) {
			console.log("Toggled ", this);
		},
		'id': null,
		'checked': false,
		'className': ''
	}

	render() {
		const {className, id, disabled} = this.props;
		const useID = id || object.randomId();
		return (
			<div className={"onoffswitch " + className + (disabled ? ' disabled' : '')}>
				<input type="checkbox" id={useID} {..._.omit(this.props, 'id', 'className')}
					   className="onoffswitch-checkbox"/>
				<label className="onoffswitch-label" htmlFor={id}>
					<span className="onoffswitch-inner"></span>
					<span className="onoffswitch-switch"></span>
				</label>
			</div>
		);
	}

}
