const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server);
const port = 8110;



const crypto = require("crypto");
const util = require("util");
const fs = require("fs");

const WebSocketServer = require("ws").Server;
const Splitter = require("stream-split");
const NALseparator = new Buffer([0, 0, 0, 1]); //NAL break

const session = require("express-session");
const passport = require("passport");
const OAuth2Strategy = require("passport-oauth").OAuth2Strategy;
const request = require("request");
const handlebars = require("handlebars");

const config = require("./config.js");

const TWITCH_CLIENT_ID = "mxpjdvl0ymc6nrm4ogna0rgpuplkeo";
const TWITCH_SECRET = config.TWITCH_SECRET;
const SESSION_SECRET = config.SESSION_SECRET;
const CALLBACK_URL = "https://twitchplaysnintendoswitch.com/8110/auth/twitch/callback"; // You can run locally with - http://localhost:3000/auth/twitch/callback

let streamSettings = {
	x1: 319 - 1920,
	y1: 61 + 360,
	x2: 319 + 1280 - 1920,
	y2: 61 + 720 + 360,
	fps: 14,
	quality: 60,
	scale: 30,
};

let lastImage = "";
let usernameDB;
let localStorage;
let clients = [];
let channels = {};
let restartAvailable = true;
let controlQueue1 = [];
let controlQueue2 = [];
let controlQueue3 = [];
let controlQueue4 = [];
let banlist = [];
let twitch_subscribers = ["beanjr_yt", "fosseisanerd", "mrruidiazisthebestinsmo", "twitchplaysconsoles"];

let lagless1Clients = [];
let lagless2Clients = [];
let lagless3Clients = [];


let turnDuration1 = 30000;
let timeTillForfeit1 = 15000;

let turnDuration2 = 30000;
let timeTillForfeit2 = 15000;

// player1:
let turnStartTime1 = Date.now();
let forfeitStartTime1 = Date.now();
let forfeitTimer1 = null;
let moveLineTimer1 = null;
let currentTurnUsername1 = null;

// player 2:
let turnStartTime2 = Date.now();
let forfeitStartTime2 = Date.now();
let forfeitTimer2 = null;
let moveLineTimer2 = null;
let currentTurnUsername2 = null;

app.use(session({
	secret: SESSION_SECRET,
	resave: false,
	saveUninitialized: false
}));
app.use(express.static("public"));
app.use(passport.initialize());
app.use(passport.session());

// Override passport profile function to get user profile from Twitch API
OAuth2Strategy.prototype.userProfile = function(accessToken, done) {
	let options = {
		url: "https://api.twitch.tv/kraken/user",
		method: "GET",
		headers: {
			"Client-ID": TWITCH_CLIENT_ID,
			"Accept": "application/vnd.twitchtv.v5+json",
			"Authorization": "OAuth " + accessToken
		}
	};

	request(options, function(error, response, body) {
		if (response && response.statusCode == 200) {
			done(null, JSON.parse(body));
		} else {
			done(JSON.parse(body));
		}
	});
}

passport.serializeUser(function(user, done) {
	done(null, user);
});

passport.deserializeUser(function(user, done) {
	done(null, user);
});

passport.use("twitch", new OAuth2Strategy({
		authorizationURL: "https://api.twitch.tv/kraken/oauth2/authorize",
		tokenURL: "https://api.twitch.tv/kraken/oauth2/token",
		clientID: TWITCH_CLIENT_ID,
		clientSecret: TWITCH_SECRET,
		callbackURL: CALLBACK_URL,
		state: true
	},
	function(accessToken, refreshToken, profile, done) {
		profile.accessToken = accessToken;
		profile.refreshToken = refreshToken;
		done(null, profile);
	}
));

// Set route to start OAuth link, this is where you define scopes to request
app.get("/auth/twitch", passport.authenticate("twitch", {
	scope: "user_read"
}));

// Set route for OAuth redirect
app.get("/auth/twitch/callback", passport.authenticate("twitch", {
	successRedirect: "/8110/",
	failureRedirect: "/"
}));

// If user has an authenticated session, display it, otherwise display link to authenticate
app.get("/", function(req, res) {
	if (req.session && req.session.passport && req.session.passport.user) {
		console.log(req.session.passport.user);
		console.log(req.user);
		let time = 7 * 60 * 24 * 60 * 1000; // 7 days
		//let time = 15*60*1000;// 15 minutes
		let username = req.session.passport.user.display_name;
		let secret = config.HASH_SECRET;
		let hashedUsername = crypto.createHmac("sha256", secret).update(username).digest("hex");

		usernameDB[hashedUsername] = username;
		localStorage.setItem("db", JSON.stringify(usernameDB));

		res.cookie("TwitchPlaysNintendoSwitch", hashedUsername, {
			maxAge: time
		});
		res.send(`<script>window.location.href = "https://twitchplaysnintendoswitch.com";</script>`);
	} else {
		res.send(`<html><head><title>Twitch Auth Sample</title></head><a href="/8110/auth/twitch"><img src="http://ttv-api.s3.amazonaws.com/assets/connect_dark.png"></a></html>`);
	}
});


app.get("/stats/", function(req, res) {});

app.get("/img/", function(req, res) {
	let imgSrc = "data:image/jpeg;base64," + lastImage;
	let html = '<img id="screenshot" src="' + imgSrc + '">';
	res.send(html);
});

let currentPlayerSite = `
<html>
	<head>
		<style>
			.custom {
				font-family: comic sans ms;
				font-size: 30px;
				color: white;
				text-align: center;
				vertical-align: middle;
				background-color: rgba(0, 0, 0, 0);
				margin: 0px auto;
				overflow: hidden;
				/*text-shadow: 2px 2px #000000;*/
				text-shadow: -1px 0 1px black, 0 1px 1px black, 1px 0 1px black, 0 -1px 1px black;
			}
		</style>
		<script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/2.1.0/socket.io.js"></script>
		<script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.1.0/jquery.min.js"></script>
	</head>
	<body>
	<div id="currentPlayer" class="custom">Current Player: </div>
	</body>
	<script>
		let socket = io("https://twitchplaysnintendoswitch.com", {
			path: "/8110/socket.io",
			transports: ["websocket"],
		});
		socket.on("currentPlayer", function(data) {
			$("#currentPlayer").text("Current Player: " + data);
		});
		socket.on("turnTimeLeft", function(data) {
			if (data.username == null) {
				$("#currentPlayer").text("No one is playing right now.");
			} else {
				$("#currentPlayer").text("Current Player: " + data.username);
			}
		});
	</script>
</html>`;

app.get("/currentplayer/", function(req, res) {
	res.send(currentPlayerSite);
});

let helpSite = `
<html>
	<head>
		<style>
			.custom {
				font-family: comic sans ms;
				color: white;
				font-size: 50px;
				text-align: center;
				vertical-align: middle;
				/*text-shadow: 2px 2px #000000;*/
				text-shadow: -1px 0 1px black, 0 1px 1px black, 1px 0 1px black, 0 -1px 1px black;
			}
		</style>
	</head>
	<body>
		<!--   <marquee scrolldelay="0" scrollamount="10"> -->
		<div class="custom">
			Type !help for help
		</div>
		<!--   </marquee> -->
	</body>
	<script>
	</script>
</html>`;
app.get("/help/", function(req, res) {
	res.send(helpSite);
});

server.listen(port, function() {
	console.log("Server listening at port %d", port);
});

let LocalStorage = require("node-localstorage").LocalStorage;
localStorage = new LocalStorage("./myDatabase");

usernameDB = JSON.parse(localStorage.getItem("db"));

if (typeof usernameDB == "undefined" || usernameDB === null) {
	usernameDB = {};
}

console.log(util.inspect(usernameDB, false, null));

function Client(socket) {

	this.socket = socket;
	this.id = socket.id;
	this.name = "none";
	this.username = null;

	this.getImage = function(q) {
		let obj = {};
		obj.q = q;
		io.to(this.id).emit("ss", obj);
	};

	this.getImage2 = function(x1, y1, x2, y2, q) {
		let obj = {};
		obj.x1 = x1;
		obj.y1 = y1;
		obj.x2 = x2;
		obj.y2 = y2;
		obj.q = q;
		io.to(this.id).emit("ss2", obj);
	};

	this.getImage3 = function(x1, y1, x2, y2, q, s) {
		let obj = {};
		obj.x1 = x1;
		obj.y1 = y1;
		obj.x2 = x2;
		obj.y2 = y2;
		obj.q = q;
		obj.s = s;
		io.to(this.id).emit("ss3", obj);
	};

	this.quit = function() {
		io.to(this.id).emit("quit");
	}

}

function findClientByID(id) {
	let index = -1;
	for (let i = 0; i < clients.length; i++) {
		if (clients[i].id == id) {
			index = i;
			return index;
		}
	}
	return index;
}

function findClientByName(name) {
	let index = -1;
	for (let i = 0; i < clients.length; i++) {
		if (clients[i].name == name) {
			index = i;
			return index;
		}
	}
	return index;
}

function findClientByUsername(username) {
	let index = -1;
	for (let i = 0; i < clients.length; i++) {
		if (clients[i].username == username) {
			index = i;
			return index;
		}
	}
	return index;
}

function getImageFromUser(user, quality) {
	let index = findClientByName(user);
	if (index == -1) {
		return;
	}
	let client = clients[index];
	client.getImage(quality);
}

function getImageFromUser2(user, x1, y1, x2, y2, quality) {
	let index = findClientByName(user);
	if (index == -1) {
		return;
	}
	let client = clients[index];
	client.getImage2(x1, y1, x2, y2, quality);
}

function getImageFromUser3(user, x1, y1, x2, y2, quality, scale) {
	let index = findClientByName(user);
	if (index == -1) {
		return;
	}
	let client = clients[index];

	client.getImage3(x1, y1, x2, y2, quality, scale);
}

function intersect(a, b) {
	var t;
	if (b.length > a.length) t = b, b = a, a = t; // indexOf to loop over shorter
	return a.filter(function (e) {
		return b.indexOf(e) > -1;
	});
}

io.set("transports", [
	"polling",
	"websocket",
	"xhr-polling",
	"jsonp-polling"
]);

io.on("connection", function(socket) {

	console.log("USER CONNECTED");

	let client = new Client(socket);
	clients.push(client);

	console.log("number of clients connected: " + clients.length);

	io.emit("registerNames");

	socket.on("registerName", function(data) {
		let index = findClientByID(socket.id);
		clients[index].name = data;
	});

	socket.on("registerUsername", function(data) {
		let index = findClientByID(socket.id);

		if (typeof usernameDB[data] == "undefined") {
			clients[index].username = null;
			return;
		}

		//clients[index].username = data;
		clients[index].username = usernameDB[data];
		socket.emit("twitchUsername", clients[index].username);
	});

	/* 2ND AUTH METHOD @@@@@@@@@@@@@@@@@@@@@*/
	// CLIENT SIDE:
	// 	socket.emit("twitchToken", someTwitchToken);
	// 	socket.on("hashedUsername", function(data) {
	// 		let hashedUsername = data;
	// 		socket.emit("registerUsername", hashedUsername);
	// 	});
	socket.on("twitchToken", function(data) {
		request({
			url: "https://id.twitch.tv/oauth2/validate",
			headers: {
				Authorization: "OAuth " + data,
			}
		}, function(error, response, body) {

			let body2 = JSON.parse(body);

			if (body2.message == "invalid access token") {
				return;
			} else {
				let username = body2.login;
				let secret = config.HASH_SECRET;
				let hashedUsername = crypto.createHmac("sha256", secret).update(username).digest("hex");
				usernameDB[hashedUsername] = username;
				localStorage.setItem("db", JSON.stringify(usernameDB));
				socket.emit("hashedUsername", hashedUsername);
			}
		});
	});

	socket.on("listAll", function() {
		io.emit("registerNames");
		let names = [];
		for (let i = 0; i < clients.length; i++) {
			let client = clients[i];
			if (client.name != "none") {
				names.push(client.name);
			}
		}
		console.log(names);
		io.emit("names", names);
	});

	// after recieving the image, broadcast it to viewers
	socket.on("screenshot", function(data) {

		let obj = {};
		obj.src = data;
		lastImage = data;

		if (lastImage === "") {
			io.emit("restart");
		}
		let index = findClientByID(socket.id);
		if (index != -1) {
			let client = clients[index];
			obj.name = client.name;
		}
		io.to("viewers").emit("viewImage", obj);
	});


	// directed:

	socket.on("directedGetImage", function(data) {
		let index = findClientByName(data.user);
		if (index == -1) {
			return;
		}
		let client = clients[index];

		let quality = parseInt(data.quality);
		quality = (isNaN(quality)) ? 0 : quality;
		//client.getImageOld(socket, quality);
		client.getImage(quality);
	});

	socket.on("sendControllerState", function(data) {

		let index = findClientByID(socket.id);
		if (index == -1) {
			return;
		}
		let client = clients[index];
		if (client.username == null) {
			return;
		}
		
		if (controlQueue1.length === 0) {
			return;
		}
		currentTurnUsername1 = controlQueue1[0];
		if (client.username != currentTurnUsername1) {
			return;
		}
		
		// 		if(twitch_subscribers.indexOf(currentTurnUsername1) > -1) {
		// 			turnDuration1 = 60000;
		// 		} else {
		// 			turnDuration1 = 30000;
		// 		}

		// forfeit timer:
		clearTimeout(forfeitTimer1);
		forfeitTimer1 = setTimeout(forfeitTurn1, timeTillForfeit1, client.username);
		forfeitStartTime1 = Date.now();

		io.emit("controllerState", data);
		io.emit("currentPlayer", client.username);
	});
	
	socket.on("sendControllerState2", function(data) {

		let index = findClientByID(socket.id);
		if (index == -1) {
			return;
		}
		let client = clients[index];
		if (client.username == null) {
			return;
		}
		
		if (controlQueue2.length === 0) {
			return;
		}
		currentTurnUsername2 = controlQueue2[0];
		if (client.username != currentTurnUsername2) {
			return;
		}

		// forfeit timer:
		clearTimeout(forfeitTimer2);
		forfeitTimer2 = setTimeout(forfeitTurn2, timeTillForfeit2, client.username);
		forfeitStartTime2 = Date.now();
		
		io.emit("controllerState2", data);
		io.emit("currentPlayer2", client.username);
	});
	
	
	socket.on("sendControllerStateWiiU3Ds", function(data) {

// 		let index = findClientByID(socket.id);
// 		if (index == -1) {
// 			return;
// 		}
// 		let client = clients[index];
// 		if (client.username == null) {
// 			return;
// 		}
		
// 		if (controlQueue2.length === 0) {
// 			return;
// 		}
// 		currentTurnUsername2 = controlQueue2[0];
// 		if (client.username != currentTurnUsername2) {
// 			return;
// 		}

		// forfeit timer:
		clearTimeout(forfeitTimer2);
		forfeitTimer2 = setTimeout(forfeitTurn2, timeTillForfeit2, client.username);
		forfeitStartTime2 = Date.now();

		io.to("wiiu3dscontroller").emit("controllerState", data);
// 		io.emit("currentPlayer2", client.username);
	});

	socket.on("directedGetImage", function(data) {
		let index = findClientByName(data.user);
		if (index == -1) {
			return;
		}
		let client = clients[index];

		let quality = parseInt(data.quality);
		quality = (isNaN(quality)) ? 0 : quality;
		client.getImage(quality);
	});

	/* QUEUE @@@@@@@@@@@@@@@@@@@@@@@@@@@@@*/

	socket.on("requestTurn", function() {
		let index = findClientByID(socket.id);
		if (index == -1) {
			return;
		}
		client = clients[index];
		if (client.username == null) {
			return;
		}
		// return if banned:
		if (banlist.indexOf(client.username) > -1) {
			return;
		}
		
		// check if the username is in any of the other lists:
		if (controlQueue2.indexOf(client.username) > -1) {
			return;
		}
		
		if (controlQueue1.indexOf(client.username) == -1) {
			controlQueue1.push(client.username);
			currentTurnUsername1 = controlQueue1[0];
			io.emit("controlQueue", {
				queue: controlQueue1
			});
		}

		if (controlQueue1.length == 1) {
			// turn timer:
			turnStartTime1 = Date.now();
			clearTimeout(moveLineTimer1);
			moveLineTimer1 = setTimeout(moveLine1, turnDuration1);
			
			// forfeit timer:
			forfeitStartTime1 = Date.now();
			clearTimeout(forfeitTimer1);
			forfeitTimer1 = setTimeout(forfeitTurn1, timeTillForfeit1, client.username);
		}
	});

	socket.on("cancelTurn", function() {
		let index = findClientByID(socket.id);
		if (index == -1) {
			return;
		}
		client = clients[index];
		if (client.username == null) {
			return;
		}

		index = controlQueue1.indexOf(client.username);
		if (index > -1) {
			controlQueue1.splice(index, 1);
			io.emit("controlQueue", {
				queue: controlQueue1
			});

			if (controlQueue1.length >= 1) {
				currentTurnUsername1 = controlQueue1[0];
				if (index === 0) {
					// restart turn timer:
					turnStartTime1 = Date.now();
					clearTimeout(moveLineTimer1);
					moveLineTimer1 = setTimeout(moveLine1, turnDuration1);
					// restart forfeit timer:
					clearTimeout(forfeitTimer1);
					forfeitTimer1 = setTimeout(forfeitTurn1, timeTillForfeit1, currentTurnUsername1);
					forfeitStartTime1 = Date.now();
				}
			} else if (controlQueue1.length === 0) {
				currentTurnUsername1 = null;
			}

			let currentTime = Date.now();
			let elapsedTime = currentTime - turnStartTime1;
			let timeLeft = turnDuration1 - elapsedTime;
			let elapsedTimeSinceLastMove = currentTime - forfeitStartTime1;
			let timeLeftForfeit = timeTillForfeit1 - elapsedTimeSinceLastMove;
			io.emit("turnTimeLeft", {
				timeLeft: timeLeft,
				username: currentTurnUsername1,
				turnLength: turnDuration1,
				timeLeftForfeit: timeLeftForfeit,
				viewerCounts: [lagless1Clients.length, lagless2Clients.length, lagless3Clients.length],
			});
		}
	});
	
	
	socket.on("requestTurn2", function() {
		let index = findClientByID(socket.id);
		if (index == -1) {
			return;
		}
		client = clients[index];
		if (client.username == null) {
			return;
		}
		// return if banned:
		if (banlist.indexOf(client.username) > -1) {
			return;
		}
		
		// check if the username is in any of the other lists:
		if (controlQueue1.indexOf(client.username) > -1) {
			return;
		}
		
		if (controlQueue2.indexOf(client.username) == -1) {
			controlQueue2.push(client.username);
			currentTurnUsername2 = controlQueue2[0];
			io.emit("controlQueue2", {
				queue: controlQueue2
			});
		}

		if (controlQueue2.length == 1) {
			// turn timer:
			turnStartTime2 = Date.now();
			clearTimeout(moveLineTimer2);
			moveLineTimer2 = setTimeout(moveLine2, turnDuration2);
			
			// forfeit timer:
			forfeitStartTime2 = Date.now();
			clearTimeout(forfeitTimer2);
			forfeitTimer2 = setTimeout(forfeitTurn2, timeTillForfeit2, client.username);
		}
	});

	socket.on("cancelTurn2", function() {
		let index = findClientByID(socket.id);
		if (index == -1) {
			return;
		}
		client = clients[index];
		if (client.username == null) {
			return;
		}

		index = controlQueue2.indexOf(client.username);
		if (index > -1) {
			controlQueue2.splice(index, 1);
			io.emit("controlQueue2", {
				queue: controlQueue2
			});

			if (controlQueue2.length >= 1) {
				currentTurnUsername2 = controlQueue2[0];
				if (index === 0) {
					// restart turn timer:
					turnStartTime2 = Date.now();
					clearTimeout(moveLineTimer2);
					moveLineTimer2 = setTimeout(moveLine2, turnDuration2);
					// restart forfeit timer:
					clearTimeout(forfeitTimer2);
					forfeitTimer2 = setTimeout(forfeitTurn2, timeTillForfeit2, currentTurnUsername2);
					forfeitStartTime2 = Date.now();
				}
			} else if (controlQueue2.length === 0) {
				currentTurnUsername2 = null;
			}

			let currentTime = Date.now();
			let elapsedTime = currentTime - turnStartTime2;
			let timeLeft = turnDuration2 - elapsedTime;
			let elapsedTimeSinceLastMove = currentTime - forfeitStartTime2;
			let timeLeftForfeit = timeTillForfeit2 - elapsedTimeSinceLastMove;
			io.emit("turnTimeLeft2", {
				timeLeft: timeLeft,
				username: currentTurnUsername2,
				turnLength: turnDuration2,
				timeLeftForfeit: timeLeftForfeit,
			});
		}
	});



	/* STREAM COMMANDS @@@@@@@@@@@@@@@@@@@@@@@@@@@@@*/
	socket.on("restart", function() {
		if (restartAvailable) {
			restartAvailable = false;
			console.log("restarting");
			io.emit("quit");
		}
	});

	socket.on("restart server", function() {
		restartAvailable = false;
		console.log("server restarting");
		io.emit("quit");
		process.exit();
	});

	socket.on("restart lagless2", function() {
		restartAvailable = false;
		console.log("restarting lagless2");
		io.to("relay").emit("restart lagless2");
	});

	socket.on("restart lagless3", function() {
		restartAvailable = false;
		console.log("restarting lagless3");
		io.to("relay").emit("restart lagless3");
	});
	
	socket.on("banlist", function(data) {
		banlist = data;
	});

	socket.on("disconnect", function() {
		console.log("disconnected")
		let i = findClientByID(socket.id)
		clients.splice(i, 1);
	});

	/* STREAM SETTINGS @@@@@@@@@@@@@@@@@@@@@@@@@@@@@*/
	socket.on("setQuality", function(data) {

		if (controlQueue1.length === 0) {
			io.emit("setQuality", streamSettings.quality);
			return;
		}
		currentTurnUsername1 = controlQueue1[0];
		if (client.username != currentTurnUsername1) {
			io.emit("setQuality", streamSettings.quality);
			return;
		}

		streamSettings.quality = parseInt(data);
		io.emit("setQuality", data);
	});

	socket.on("setScale", function(data) {

		if (controlQueue1.length === 0) {
			io.emit("setScale", streamSettings.scale);
			return;
		}
		currentTurnUsername1 = controlQueue1[0];
		if (client.username != currentTurnUsername1) {
			io.emit("setScale", streamSettings.scale);
			return;
		}

		streamSettings.scale = parseInt(data);
		io.emit("setScale", data);
	});

	socket.on("setFPS", function(data) {

		streamSettings.fps = parseInt(data);
		//io.emit("setFPS", data);
	});

	// 	socket.on("setCoords", function(data) {
	// 		streamSettings.x1 = data.x1 || streamSettings.x1;
	// 		streamSettings.x2 = data.x2 || streamSettings.x2;
	// 		streamSettings.y1 = data.y1 || streamSettings.y1;
	// 		streamSettings.y2 = data.y2 || streamSettings.y2;
	// 	});



	/* WebRTC @@@@@@@@@@@@@@@@@@@@@@@@ */

	socket.on("message", function(data) {
		socket.broadcast.emit("message", data);
	});

	let initiatorChannel = "";
	if (!io.isConnected) {
		io.isConnected = true;
	}

	socket.on("new-channel", function(data) {
		if (!channels[data.channel]) {
			initiatorChannel = data.channel;
		}

		channels[data.channel] = data.channel;
		onNewNamespace(data.channel, data.sender);
	});

	socket.on("presence", function(channel) {
		let isChannelPresent = !!channels[channel];
		socket.emit("presence", isChannelPresent);
	});

	socket.on("disconnect", function(channel) {
		if (initiatorChannel) {
			delete channels[initiatorChannel];
		}
	});

	/* LATENCY @@@@@@@@@@@@@@@@@@@@@@@@ */
	socket.on("ping2", function() {
		socket.emit("pong2");
	});

	/* ROOMS @@@@@@@@@@@@@@@@@@@@@@@@ */
	socket.on("join", function(room) {
		socket.join(room);
	});
	socket.on("leave", function(room) {
		socket.leave(room);
	});
	
	
	/* COUNT IMPLEMENTATIONS @@@@@@@@@@@@@@@@@@@@@@@@ */
	socket.on("joinLagless1", function() {
		let id = socket.id;
		// if the id isn't in the list, add it:
		if (lagless1Clients.indexOf(id) == -1) {
			lagless1Clients.push(id);
		}
		// remove from other lists:
		let index;
		index = lagless2Clients.indexOf(id);
		if (index > -1) {
			lagless2Clients.splice(index, 1);
		}
		index = lagless3Clients.indexOf(id);
		if (index > -1) {
			lagless3Clients.splice(index, 1);
		}
	});
	socket.on("joinLagless2", function() {
		let id = socket.id;
		// if the id isn't in the list, add it:
		if (lagless2Clients.indexOf(id) == -1) {
			lagless2Clients.push(id);
		}
		// remove from other lists:
		let index;
		index = lagless1Clients.indexOf(id);
		if (index > -1) {
			lagless1Clients.splice(index, 1);
		}
		index = lagless3Clients.indexOf(id);
		if (index > -1) {
			lagless3Clients.splice(index, 1);
		}
	});
	socket.on("joinLagless3", function() {
		let id = socket.id;
		// if the id isn't in the list, add it:
		if (lagless3Clients.indexOf(id) == -1) {
			lagless3Clients.push(id);
		}
		// remove from other lists:
		let index;
		index = lagless1Clients.indexOf(id);
		if (index > -1) {
			lagless1Clients.splice(index, 1);
		}
		index = lagless2Clients.indexOf(id);
		if (index > -1) {
			lagless2Clients.splice(index, 1);
		}
	});
	
	socket.on("leaveLagless", function() {
		let id = socket.id;
		// remove from lists:
		let index;
		index = lagless1Clients.indexOf(id);
		if (index > -1) {
			lagless1Clients.splice(index, 1);
		}
		index = lagless2Clients.indexOf(id);
		if (index > -1) {
			lagless2Clients.splice(index, 1);
		}
		index = lagless3Clients.indexOf(id);
		if (index > -1) {
			lagless3Clients.splice(index, 1);
		}
	});

});

function onNewNamespace(channel, sender) {
	io.of("/" + channel).on("connection", function(socket) {
		let username;
		if (io.isConnected) {
			io.isConnected = false;
			socket.emit("connect", true);
		}

		socket.on("message", function(data) {
			if (data.sender == sender) {
				if (!username) username = data.data.sender;
				socket.broadcast.emit("message", data.data);
			}
		});

		socket.on("disconnect", function() {
			if (username) {
				socket.broadcast.emit("user-left", username);
				username = null;
			}
		});
	});
}

setInterval(function() {
	restartAvailable = true;
}, 4000);

function forfeitTurn1(username) {
	let index = controlQueue1.indexOf(username);
	if (index > -1) {
		controlQueue1.splice(index, 1);
		io.emit("controlQueue", {queue: controlQueue1});
		// stop the controller
		io.to("controller").emit("controllerState", "800000000000000 127 127 127 127");
	
		if (controlQueue1.length >= 1) {
			currentTurnUsername1 = controlQueue1[0];
			// restart turn timer:
			turnStartTime1 = Date.now();
			clearTimeout(moveLineTimer1);
			moveLineTimer1 = setTimeout(moveLine1, turnDuration1);
			// restart forfeit timer:
			clearTimeout(forfeitTimer1);
			forfeitTimer1 = setTimeout(forfeitTurn1, timeTillForfeit1, currentTurnUsername1);
			forfeitStartTime1 = Date.now();
		} else {
			currentTurnUsername1 = null;
		}

		let currentTime = Date.now();
		let elapsedTime = currentTime - turnStartTime1;
		let timeLeft = turnDuration1 - elapsedTime;
		let elapsedTimeSinceLastMove = currentTime - forfeitStartTime1;
		let timeLeftForfeit = timeTillForfeit1 - elapsedTimeSinceLastMove;
		io.emit("turnTimeLeft", {
			timeLeft: timeLeft,
			username: currentTurnUsername1,
			turnLength: turnDuration1,
			timeLeftForfeit: timeLeftForfeit,
			viewerCounts: [lagless1Clients.length, lagless2Clients.length, lagless3Clients.length],
		});
	}
}

function forfeitTurn2(username) {
	let index = controlQueue2.indexOf(username);
	if (index > -1) {
		controlQueue2.splice(index, 1);
		io.emit("controlQueue2", {queue: controlQueue2});
		// stop the controller
		io.to("controller").emit("controllerState2", "800000000000000 127 127 127 127");
	
		if (controlQueue2.length >= 1) {
			currentTurnUsername2 = controlQueue2[0];
			// restart turn timer:
			turnStartTime2 = Date.now();
			clearTimeout(moveLineTimer2);
			moveLineTimer2 = setTimeout(moveLine2, turnDuration2);
			// restart forfeit timer:
			clearTimeout(forfeitTimer2);
			forfeitTimer2 = setTimeout(forfeitTurn2, timeTillForfeit2, currentTurnUsername2);
			forfeitStartTime2 = Date.now();
		} else {
			currentTurnUsername2 = null;
		}

		let currentTime = Date.now();
		let elapsedTime = currentTime - turnStartTime2;
		let timeLeft = turnDuration2 - elapsedTime;
		let elapsedTimeSinceLastMove = currentTime - forfeitStartTime2;
		let timeLeftForfeit = timeTillForfeit2 - elapsedTimeSinceLastMove;
		io.emit("turnTimeLeft2", {
			timeLeft: timeLeft,
			username: currentTurnUsername2,
			turnLength: turnDuration2,
			timeLeftForfeit: timeLeftForfeit,
		});
	}
}

function moveLine1() {
	if (controlQueue1.length > 1) {
		controlQueue1.shift();
		currentTurnUsername1 = controlQueue1[0];
		// stop the controller
		io.to("controller").emit("controllerState", "800000000000000 127 127 127 127");
	}
	io.emit("controlQueue", {queue: controlQueue1});

	turnStartTime1 = Date.now();
	clearTimeout(moveLineTimer1);
	moveLineTimer1 = setTimeout(moveLine1, turnDuration1);

	if (controlQueue1.length > 1) {
		// forfeit timer:
		clearTimeout(forfeitTimer1);
		forfeitTimer1 = setTimeout(forfeitTurn1, timeTillForfeit1, controlQueue1[0]);
		forfeitStartTime1 = Date.now();
	}
}
moveLine1();

function moveLine2() {
	if (controlQueue2.length > 1) {
		controlQueue2.shift();
		currentTurnUsername2 = controlQueue2[0];
		// stop the controller
		io.to("controller").emit("controllerState2", "800000000000000 127 127 127 127");
	}
	io.emit("controlQueue2", {queue: controlQueue2});

	turnStartTime2 = Date.now();
	clearTimeout(moveLineTimer2);
	moveLineTimer2 = setTimeout(moveLine2, turnDuration2);

	if (controlQueue2.length > 1) {
		// forfeit timer:
		clearTimeout(forfeitTimer2);
		forfeitTimer2 = setTimeout(forfeitTurn2, timeTillForfeit2, controlQueue2[0]);
		forfeitStartTime2 = Date.now();
	}
}
moveLine2();

setInterval(function() {
	// get all connected id's
	let ids = Object.keys(io.sockets.sockets);
	
	// remove any clients not still connected:
	lagless1Clients = lagless1Clients.filter(value => -1 !== ids.indexOf(value));
	lagless2Clients = lagless2Clients.filter(value => -1 !== ids.indexOf(value));
	lagless3Clients = lagless3Clients.filter(value => -1 !== ids.indexOf(value));
	
	
	let currentTime = Date.now();
	let elapsedTime = currentTime - turnStartTime1;
	let timeLeft = turnDuration1 - elapsedTime;
	let elapsedTimeSinceLastMove = currentTime - forfeitStartTime1;
	let timeLeftForfeit = timeTillForfeit1 - elapsedTimeSinceLastMove;
	io.emit("turnTimeLeft", {
		timeLeft: timeLeft,
		username: currentTurnUsername1,
		turnLength: turnDuration1,
		timeLeftForfeit: timeLeftForfeit,
		viewerCounts: [lagless1Clients.length, lagless2Clients.length, lagless3Clients.length],
	});
	io.emit("controlQueue", {queue: controlQueue1});
}, 500);

setInterval(function() {
	let currentTime = Date.now();
	let elapsedTime = currentTime - turnStartTime2;
	let timeLeft = turnDuration2 - elapsedTime;
	let elapsedTimeSinceLastMove = currentTime - forfeitStartTime2;
	let timeLeftForfeit = timeTillForfeit2 - elapsedTimeSinceLastMove;
	io.emit("turnTimeLeft2", {
		timeLeft: timeLeft,
		username: currentTurnUsername2,
		turnLength: turnDuration2,
		timeLeftForfeit: timeLeftForfeit,
	});
	io.emit("controlQueue2", {queue: controlQueue2});
}, 500);

function stream() {
	let user = "Matt";
	let x1 = streamSettings.x1;
	let x2 = streamSettings.x2;
	let y1 = streamSettings.y1;
	let y2 = streamSettings.y2;
	let quality = streamSettings.quality;
	let scale = streamSettings.scale;
	getImageFromUser3(user, x1, y1, x2, y2, quality, scale);
	setTimeout(stream, 1000 / streamSettings.fps);
}
stream();