'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import url from 'url';
import {Collapse, Table} from 'react-bootstrap';
import {console, object, ajax, JWT, isServerSide} from './../util';
import StaticPage from './StaticPage';
import {BasicStaticSectionBody} from './components';


export default class ReleaseUpdates extends React.Component {

	constructor(props) {
		super(props);
		this.state = {
			'mounted': false,
			'sectionData': null,
			'updateData': null,
			'updateTag': null,
			'updateParam': null
		};
		this.loadSection = this.loadSection.bind(this);
		this.loadUpdates = this.loadUpdates.bind(this);
		this.viewUpdates = this.viewUpdates.bind(this);
	}

	componentDidMount() {
		var thisUrl = url.parse(this.props.href, true);
		var updateTag = thisUrl.query['update_tag'] || null;
		var updateParam = thisUrl.query['parameters'] || null;
		var isAdmin = JWT.isLoggedInAsAdmin();
		this.setState({
			'mounted': true,
			'updateTag': updateTag,
			'updateParam': updateParam,
			'isAdmin': isAdmin
		});
		this.loadSection(updateTag);
		this.loadUpdates(updateTag, updateParam);
	}


	loadSection(updateTag = null) {
		// sectionData is an object with 'content' and 'id'
		var useTag = updateTag || this.state.updateTag || '*';
		if (useTag) {
			var section_url = '/static-sections/release-updates.' + useTag;
			ajax.promise(section_url).then(response => {
				if (response['name'] && response['content']) {
					var section_data = {
						'content': response['content'],
						'@id': response['@id']
					};
					this.setState({'sectionData': section_data});
				} else {
					this.setState({'sectionData': null});
				}
			});
		}
	}


	loadUpdates(updateTag = null, updateParam = null) {
		var useTag = updateTag || this.state.updateTag;
		var useParam = updateParam || this.state.updateParam;
		// enforce date ranges and required update tag
		var update_url = '/search/?type=DataReleaseUpdate&limit=all&sort=-date_created';
		if (useTag) {
			update_url += '&update_tag=' + encodeURIComponent(useTag);
		}
		if (useParam) {
			update_url += '&parameters=' + encodeURIComponent(useParam);
		}

		this.setState({'updateData': null});
		ajax.promise(update_url).then(response => {
			if (response['@graph'] && response['@graph'].length > 0) {
				this.setState({'updateData': response['@graph']});
			} else {
				this.setState({'updateData': []});
			}
		});
	}

	viewUpdates() {
		if (this.state.updateData === null) {
			return (
				<div className="text-center mt-5 mb-5" style={{fontSize: '2rem', opacity: 0.5}}>
					<i className="mt-3 icon icon-spin icon-circle-o-notch"/>
				</div>
			);
		} else if (this.state.updateData.length == 0) {
			return (
				<div style={{'textAlign': 'center'}}>
					<h5>No results.</h5>
				</div>
			);
		} else {
			return (
				<div className="item-page-container">
					{this.state.updateData.map((update) =>
						<SingleUpdate
							{...this.props}
							id={update.uuid}
							key={update.uuid}
							isAdmin={this.state.isAdmin}
							updateData={update}
						/>
					)}
				</div>
			);
		}
	}

	render() {
		var {sectionData, isAdmin} = this.state,
			subtitle = null,
			editLink = null;

		if (sectionData) {
			if (isAdmin) {
				editLink = <a href={object.itemUtil.atId(sectionData) + '?currentAction=edit'}>Edit</a>;
			}
			subtitle = (
				<div className="row release-update-static-section">
					<BasicStaticSectionBody className="col-sm-11" content={sectionData.content}
											filetype={sectionData.options && sectionData.options.filetype}/>
					<div className="col-sm-1 text-right">{editLink}</div>
				</div>
			);
		}
		return (
			<StaticPage.Wrapper>
				{subtitle}
				<hr className="mt-0"/>
				{this.viewUpdates()}
			</StaticPage.Wrapper>
		);
	}

}


class SingleUpdate extends React.Component {
	static propTypes = {
		'onFinishOpen': PropTypes.func,
		'onStartOpen': PropTypes.func,
		'onFinishClose': PropTypes.func,
		'onStartClose': PropTypes.func
	}

	constructor(props) {
		super(props);
		this.state = {
			'comments': this.props.updateData.comments || '',
			'open': false
		};
		this.toggle = _.throttle(this.toggle.bind(this), 500);
		this.buildItem = this.buildItem.bind(this);
		this.buildSecondary = this.buildSecondary.bind(this);
	}

	toggle() {
		this.setState(function ({open}) {
			return {"open": !open};
		});
	}

	buildItem(item) {
		// catch errors where there are no experiments in a set
		// this should not happen, but can occur with test data...
		if (!item || !item.primary_id || !Array.isArray(item.primary_id.experiments_in_set) || item.primary_id.experiments_in_set.length === 0) {
			console.error('No experiments in set (?)');
			return null;
		}

		var firstExp = item.primary_id.experiments_in_set[0],
			atId = object.itemUtil.atId(item.primary_id),
			categorizer = (
				(
					firstExp.experiment_categorizer && firstExp.experiment_categorizer.field && firstExp.experiment_categorizer.value &&
					firstExp.experiment_categorizer.field + ': ' + firstExp.experiment_categorizer.value
				) || null
			);

		return (
			<tr key={item.primary_id.uuid}>
				<td><a href={atId}>{item.primary_id.display_title}</a></td>
				<td>{firstExp.experiment_type && firstExp.experiment_type.display_title}</td>
				<td>{firstExp.biosample.biosource_summary}</td>
				<td>{categorizer}</td>
				<td>{this.buildSecondary(atId, item.secondary_ids)}</td>
			</tr>
		);
	}

	/**
	 * Create a div that contains a list of additional_info + secondary @ids or
	 * nothing if the only secondary id == set_id (primary).
	 *
	 * @param {string} set_id - @id of Exp Set
	 * @param {Object} secondary_list - ??
	 */
	buildSecondary(set_id, secondary_list) {
		if (secondary_list.length === 1 && set_id === object.itemUtil.atId(secondary_list[0].secondary_id)) {
			return null;
		} else {
			return _.map(secondary_list, (item) =>
				<div key={object.itemUtil.atId(item.secondary_id)}>
					{item.additional_info ? <span>{item.additional_info + ' '}</span> : null}
					<a href={object.itemUtil.atId(item.secondary_id)}>{item.secondary_id.display_title}</a>
				</div>
			);
		}
	}

	render() {
		var {isAdmin, updateData, onStartOpen, onStartClose, onFinishOpen, onFinishClose} = this.props,
			{open} = this.state,
			editLink = isAdmin ? <a href={object.itemUtil.atId(updateData) + '?currentAction=edit'}>Edit</a> : null,
			styleObj = {
				'borderColor': 'transparent'
			};

		switch (updateData.severity) {
			case 1:
				styleObj.backgroundColor = '#fcf8e3'; // Yellow-ish
				break;
			case 2:
				styleObj.backgroundColor = '#f2dede'; // Pink-ish
				break;
			case 3:
				styleObj.backgroundColor = '#f5a894'; // Orange/red-ish
				break;
			default:
				styleObj.backgroundColor = "#dff0d8"; // Green-ish
		}

		return (
			<div className={"overview-blocks-header with-background mb-1" + (open ? ' is-open' : ' is-closed')}
				 style={styleObj}>
				<h5 className="release-section-title clickable with-accent" onClick={this.toggle}>
					<span><i className={"expand-icon icon icon-" + (open ? 'minus' : 'plus')}
							 data-tip={open ? 'Collapse' : 'Expand'}/>{updateData.summary} <i
						className={"icon icon-angle-right" + (this.state.open ? ' icon-rotate-90' : '')}/></span>
				</h5>
				<Collapse in={open} onEnter={onStartOpen} onEntered={onFinishOpen} onExit={onStartClose}
						  onExited={onFinishClose}>
					<div className="inner">
						<hr className="tab-section-title-horiz-divider" style={{borderColor: 'rgba(0,0,0,0.25)'}}/>
						<div>
							<div className="row mt-07 mb-07">
								<div className="col-sm-11">{updateData.comments || "No comments."}</div>
								<div className="col-sm-1 text-right">{editLink}</div>
							</div>
							<Table className="mb-1" striped bordered condensed>
								<thead>
								<tr>
									<th>Replicate set</th>
									<th>Experiment type</th>
									<th>Biosource</th>
									<th>Assay details</th>
									<th>Notes</th>
								</tr>
								</thead>
								<tbody children={_.map(updateData.update_items, this.buildItem)}/>
							</Table>
						</div>
					</div>
				</Collapse>
			</div>
		);
	}
}
