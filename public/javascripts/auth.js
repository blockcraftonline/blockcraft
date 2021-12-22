/*

    Authenticates the player and provides server details from each running server.
    Handles menu progression logic.

*/

// Setup
let state = 0; // State of where the player is in the authentication process (0: Start Menu, 1: Server Select, 2: Connecting to Server, 3: Loading Game, 4: Loading Chunks, 5: In Game, 6: Disconnecting)
let states = {
    "start": 0,
    "serverSelect": 1,
    "connecting": 2,
    "loading": 3,
    "loadingChunks": 4,
    "inGame": 5,
    "disconnecting": 6,
};
function isState(check) {return state == states[check];}

let socket = io({
	autoConnect: false,
	forceNew: true,
    reconnectionAttempts: 2
});

let loaded = 0;
let loadedAnimate = new Ola(0);
let maxLoaded = 5;
let maxChunks = 10; // Chunks need to be loaded before pointerlock can be enabled

let serverList = ["https://na-east.victorwei.com", "https://na-west.victorwei.com"] // Request this from the auth server
let servers = {};
let currentServer = undefined;
let joined = false;
let disconnected = 0; // Disconnection progress
let disconnectedAnimate = new Ola(0); // Disconnection progress
let maxDisconnected = 5;

function refreshServers() {
    // Disconnect servers
    for (let link in servers) {
        let server = servers[link];
        server.socket.disconnect();
    }
    
    // Connect to servers
    servers = {};
    currentServer = undefined;

    $("#server-container").empty();
    for (let i = 0; i < serverList.length; i++) {
        let serverLink = serverList[i];
        servers[serverLink] = {
            socket: io(serverLink, {
                forceNew: true,
                reconnection: false,
            }),
            link: serverLink,
            info: {},
        };

        let server = servers[serverLink];

        // Connected to server
        server.socket.on('connect', function () {
            setTimeout(function () {
                server.socket.emit('serverInfoRequest', Date.now())
            }, 500);
        });

        // Error connecting to server
        server.socket.on('connect_error', function (error) {
            //console.error(error);
        });

        // Disconnected from server
        server.socket.on('disconnect', function (reason) {
            if (reason == "transport close") {  
                console.log("Server down!");
                server.socket.disconnect();
            }
        })

        // Received server info
        server.socket.on('serverInfoResponse', function (data) {
            // Update server info
            servers[data.link].info = data;

            // Update server list
            let latency = Date.now()-data.ping;
            let serverHTML = $(`
                <div class='server' data-link='${data.link}' onClick='clickServer(event)'  ondblclick='clickServer(event, true)'>
                    <p>Region: ${data.region}</p>
                    <p>Players: ${data.numPlayers}/20</p>
                    <p>Latency: ${latency}ms</p>
                    <p style="margin-bottom: 0;">Uptime: ${msToTime(data.uptime)} </p>
                </div>
            `)

            // Check if it's the first server
            if (!currentServer && !$("#direct-connect-input").val().length) {
                currentServer = data;

                setJoinButton(data);

                serverHTML.css({
                    "background-color": "rgba(0,0,0,0.7)",
                    "outline": "2px solid white",
                });
            }
            
            $("#server-container").append(serverHTML);
        })
    }
}

// Set join button
function setJoinButton(server) {
    if (isState("serverSelect") && !$("#direct-connect-input").val().length) {
        $("#continue-bar").text(`Join server (${server.region})`);
        $("#continue-bar").css({"background-color": "green"});
    }
}

// Clicked on a server
function clickServer(event, doubleClick) {
    let server = $(event.target).closest(".server");
    let url = server.data("link");
    if (url in servers) {
        currentServer = servers[url];
    }

    // Outline selected server
    $("#server-container").children().css({
        "background-color": "rgba(0,0,0,0.5)",
        "outline": "none",
    });
    server.css({
        "background-color": "rgba(0,0,0,0.7)",
        "outline": "2px solid white",
    });

    // Remove direct connect cookie
    $("#direct-connect-input").val('');
    deleteCookie('directConnect');
    
    // Set join button
    setJoinButton(currentServer.info);

    // Auto join server
    if (doubleClick) {
        $("#start-button").click();
    }
}

// Initialize server connection
function connect(url) {
    console.log("Connecting to server with url: " + url);
    if (url in servers) {
        currentServer = servers[url];
    }

    socket.io.uri = url;
    socket.connect();
}

// Error connecting to server
function connectError() {
	console.error("Error connecting to server!");
    $("#direct-connect-input").val('');
    deleteCookie('directConnect');
    
    $("#continue-bar").text("Connection failed");
    $("#continue-bar").css({"background-color": "red"});

    setTimeout(function () {
        $("#continue-bar").text(`Join server (${currentServer.region})`);
        $("#continue-bar").css({"background-color": "green"});

        state -= 1;
    }, 1000);
}

// Join server
function joinServer() {
	if (!initialized) {
		let name = $("#name-input").val() || "";

		let joinInfo = {
			name: name,
		}
		socket.emit('join', joinInfo)
		loaded += 1;
		console.log("Joining server...")
	}
}

// Disconnect server
function disconnectServer() {
    if (!isState("inGame")) return;

    joined = false;
    currentServer = undefined;
    maxDisconnected = Object.keys(chunkManager.currChunks).length;
    disconnectedAnimate = new Ola(0);
    socket.disconnect();
    
    console.log("Disconnecting from server... (Cells to unload: " + maxDisconnected + ")");

    // Remove all chunks
    world.cells = {};

    // Remove all players
    for (let id in players) {
        scene.remove(players[id].entity);
	    delete players[id];
    }

    // Remove all entities
    for (let id in world.entities) {
        world.entities[id].mesh.geometry.dispose();
		world.entities[id].mesh.material.dispose();
		scene.remove(world.entities[id].mesh);
		delete world.entities[id];
    }

    // Reset chat
	chat = JSON.parse(chatInit);

    //prevState(); // Go back to server select
}


// Menu progression logic
$(document).ready(function () {
    // Initialize game
    init();

    // Refresh servers
    $("#refresh-servers").click(function () {
        refreshServers()
    })

    // Menu progression (0: Start Menu, 1: Server Select, 2: Loading Game, 3: In Game)
    $("#start-button").click(function (event) {
        nextState(event);
    })

    // Enter username input
    $("#name-input").keyup(function (event) {
        if (event.keyCode == 13) nextState();
    })

    // Enter direct connect input
    $("#direct-connect-input").keyup(function (event) {
        if (event.keyCode == 13) {
            nextState();
            return;
        }

        let val = $("#direct-connect-input").val();
        setCookie("directConnect", val, 365);
        if (val) {
            $("#continue-bar").text(`Direct Connect`);
            $("#continue-bar").css({"background-color": "green"});
        } else if (currentServer) {
            $("#continue-bar").text(`Join server (${currentServer.region})`);
            $("#continue-bar").css({"background-color": "green"});
        }
        
    })
})

// Menu progression states
function nextState(e) {
    if (isState("start")) { // Start Menu -> Server Select
        showServerSelect();

        state += 1;
    } else if (isState("serverSelect") && (currentServer || $("#direct-connect-input").val())) { // Server Select -> Connecting to Server
        // Direct connection
        let directConnect = $("#direct-connect-input").val();
        if (directConnect) {  
            connect(directConnect);
        } else {
            connect(currentServer.link);
        }

        $("#continue-bar").text(`Connecting to server...`);
        $("#continue-bar").css({"background-color": "orange"});

        // Wait for connection to server
        state += 1;
    } else if (isState("loading") && loaded > maxLoaded) { // Loading Game -> Loading Chunks
        console.log("Loading chunks...")
        loadedAnimate = new Ola(Object.keys(chunkManager.currChunks).length);
        state += 1;
    } else if (isState("loadingChunks") && Object.keys(chunkManager.currChunks).length >= maxChunks) { // Loading Chunks -> In Game
        console.log("Requesting pointer lock");
        requestPointerLock();

        $(".menu-button").hide();
        $("#ingame-bar").show();
        state += 1;
    } else if (isState("inGame")) { // In Game
        
        if (e) {
            let x = e.pageX;
            let y = e.pageY;
            let disconnectButton = x > $("#disconnect-bar").offset().left && x < $("#disconnect-bar").offset().left + $("#disconnect-bar").width() && y > $("#disconnect-bar").offset().top && y < $("#disconnect-bar").offset().top + $("#disconnect-bar").height();

            if (disconnectButton) { // Disconnect from server
                disconnectServer();
                $(".menu-button").hide();
                $("#disconnecting-bar").show();

                state += 1;
            } else { // Return to game
                requestPointerLock();
            }
        }
    } else if (isState("disconnecting")) { // Disconnecting from server
        console.log("Bruh");
    }
    
}

function prevState() {
    if (isState("loading")) { // Go back to server select menu
        showServerSelect();

        state -= 1; 
    } else if (isState("disconnecting")) { // Go back to server select menu
        showServerSelect();
        
        loaded -= 1;
        state -= 5; 
        initialized = false;
    }
}

// Show server select page
function showServerSelect() {
    refreshServers();
        
    $(".input").hide(); // Hide input fields
    $(".menu-button").hide(); // Hide menu buttons
    $(".tab-container").hide(); // Hide tab containers
    
    let directConnect = getCookie("directConnect");
    if (directConnect) {
        $("#direct-connect-input").val(directConnect).focus();
        $("#continue-bar").text(`Direct Connect`);
        $("#continue-bar").css({"background-color": "green"});
    } else {
        $("#continue-bar").text("Finding Servers...");
        $("#continue-bar").css({"background-color": "orange"});
    }

    $("#direct-connect-input").show();
    $("#continue-bar").show();

    $("#server-select").show();
    $("#server-button")[0].click();

    $("#background-image").show();
}

// Show settings page
function showSettings() {
    $(".menu-button").hide();
    $("#loading-bar").show();

    $(".input").hide();
    $("#name-input").show();

    $(".tab-container").hide();
    $("#settings").show();
    $("#video-button")[0].click();
}


// Update menu state
function updateMenu() {
    
    // Animate menu
    if (isState("serverSelect")) { // Server select

    } else if (isState("loading")) { // Loading game

        // Update loading progress
        if (loadedAnimate.value >= maxLoaded) {
            $("#loading-bar").text("Spawn")

            if (!joined) {
                joined = true;
                joinServer();
            }
        } else if (loadedAnimate.value < maxLoaded && !$("#loading-bar").text().includes("Spawn")) {
            let text = Math.min(100, round(loadedAnimate.value/maxLoaded*100, 0));
            $("#loading-bar").text("Loading " + text + "%")
        }

        // Set loading progress
		loadedAnimate.value = loaded;
		$("#loading-bar").width(100*(Math.min(loadedAnimate.value, maxLoaded)/maxLoaded)+"%")

    } else if (isState("loadingChunks")) { // Loading chunks

		let chunksLoaded = Object.keys(chunkManager.currChunks).length;
		loadedAnimate.value = chunksLoaded;
		$("#loading-bar").width(100*(Math.min(loadedAnimate.value, maxChunks)/maxChunks)+"%");
		$("#loading-bar").text("Chunks Loaded (" + chunksLoaded + "/" + maxChunks + ")");

		if (chunksLoaded >= maxChunks) {
			nextState();
		}
	} else if (initialized && isState("inGame")) { // In game

		$("#loading-bar").text("Return to game");
		$("#loading-bar").width(100+"%");

	} else if (isState("disconnecting")) { // Disconnecting

        disconnectedAnimate.value = maxDisconnected - chunkManager.chunksToUnload.length;
        let text = Math.min(100, round(disconnectedAnimate.value/maxDisconnected*100, 0));
        $("#disconnecting-bar").text("Disconnecting " + text + "%");
        $("#disconnecting-bar").width(100*(Math.min(disconnectedAnimate.value, maxDisconnected)/maxDisconnected)+"%");
        
        if (disconnectedAnimate.value >= maxDisconnected) {
            prevState();
        }
    }
}