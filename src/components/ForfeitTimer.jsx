

import React, { Component } from "react";


class ViewerList extends Component {

	constructor(props) {
		super(props);
	}


	state = {
	};

	getViewerList() {

		let viewerNames = [];

		for (let i = 0; i < this.props.viewerIDs.length; i++) {
			viewerNames.push([]);
			for (let j = 0; j < this.props.viewerIDs[i].length; j++) {
				let name = this.props.usernameMap[this.props.viewerIDs[i][j]];
				viewerNames[i].push(name);
			}
		}

		let viewers = [];

		for (let i = 0; i < viewerNames.length; i++) {
			if (viewerNames[i].length > 0) {
				viewers.push(<div key={i} className="dropdown-divider">Lagless {i+1}</div>);
// 				lists.push(this.state.viewerNames.map(name => <li key={name}>{name}</li>));
			}
			for (let j = 0; j < viewerNames[i].length; j++) {
				let html = <button key={i + ":" + j} className="viewerElement dropdown-item" data-toggle="popover" tabIndex="0">{viewerNames[i][j]}</button>;
				viewers.push(html);
			}
		}
		//this.state.viewerNames.map(name => <li key={name}>{name}</li>)
		return viewers;
	}

	render () {

		return (
			<React.Fragment>
				<a className="btn btn-secondary dropdown-toggle" href="#" role="button" id="dropdownMenuLink" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
					Viewers
				</a>
				<div id="laglessViewerDropdownDiv" className="dropdown-menu" aria-labelledby="dropdownMenuLink">
					{this.getViewerList()}
				</div>
			</React.Fragment>
		);
// 		return <h1>test</h1>;
	}

}

// module.exports =  ViewerList;
export default ViewerList;
