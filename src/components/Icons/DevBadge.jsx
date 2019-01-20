// react:
import React, { PureComponent } from "react";

// material ui:
import { withStyles } from "@material-ui/core/styles";

// redux:
import { connect } from "react-redux";

// recompose:
import { compose } from "recompose";


// jss:
const styles = (theme) => ({
	root: {
		width: "18px",
		marginLeft: "2px",
		marginRight: "2px",
	},
});

class ModBadge extends PureComponent {

	constructor(props) {
		super(props);
	}

	render() {

		const { classes } = this.props;

		return (
			<img className={classes.root} src="https://twitchplaysnintendoswitch.com/images/ModBadge.png"/>
		);
	}

}

export default compose(
	withStyles(styles),
)(ModBadge);
