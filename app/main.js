const net = require("net");

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const replicaIndex = args.indexOf("--replicaof");
const serverType = replicaIndex != -1 ? "slave" : "master";
const serverPort = portIndex != -1 ? args[portIndex + 1] : 6379;

// Constants for replication
const REPLICATION_ID = "8371b4fb1155b71f4a04d3e1bc3e18c4a990aeeb";
const REPLICATION_OFFSET = 0;

// Parse master details if in replica mode
let masterHost, masterPort;
if (serverType === "slave" && args[replicaIndex + 1]) {
    [masterHost, masterPort] = args[replicaIndex + 1].split(" ");
    masterPort = parseInt(masterPort);
}

const server = net.createServer((connection) => {
    const keyValuePairs = {};
    const expValuePairs = {};

    connection.on('data', (data) => {
        const input = Buffer.from(data).toString().split("\r\n");
        let streamLength = input.length;

        if (input.includes("PING")) {
            connection.write("+PONG\r\n");
        } else if (input.includes("REPLCONF")) {
            connection.write("+OK\r\n");
        } else if (input.includes("PSYNC")) {
            const response = `+FULLRESYNC ${REPLICATION_ID} 0\r\n`;
            connection.write(response);
        } else if (input.includes("ECHO")) {
            connection.write(`${input[3]}\r\n${input[4]}\r\n`);
        } else if (input.includes("SET")) {
            if (!input.includes("PX") && !input.includes("px") && !input.includes("pX") && !input.includes("Px")) {
                keyValuePairs[input[streamLength - 4]] = input[streamLength - 2];
            } else {
                const time = input[streamLength - 2];
                expValuePairs[input[streamLength - 8]] = Date.now() + parseInt(time);
                keyValuePairs[input[streamLength - 8]] = input[streamLength - 6];
            }
            connection.write("+OK\r\n");
        } else if (input.includes("GET")) {
            const key = input[streamLength - 2];

            if (!(key in keyValuePairs)) {
                connection.write("$-1\r\n");
                return;
            }

            if (key in expValuePairs) {
                if (Date.now() > expValuePairs[key]) {
                    delete keyValuePairs[key];
                    delete expValuePairs[key];
                    connection.write("$-1\r\n");
                    return;
                }
            }

            const value = keyValuePairs[key];
            connection.write(`$${value.length}\r\n${value}\r\n`);
        } else if (input.includes("INFO")) {
            if (input[4] && input[4].toLowerCase() === "replication") {
                const infoLines = [
                    `role:${serverType}`,
                    `master_replid:${REPLICATION_ID}`,
                    `master_repl_offset:${REPLICATION_OFFSET}`
                ];
                const infoString = infoLines.join("\r\n");
                connection.write(`$${infoString.length}\r\n${infoString}\r\n`);
            } else {
                connection.write("-ERR unknown INFO section\r\n");
            }
        }
    });
});

// Function to handle the complete handshake process
function handleHandshake(masterConnection) {
    let handshakeState = 0;  // Track handshake progress

    masterConnection.on('data', (data) => {
        const response = data.toString();

        switch (handshakeState) {
            case 0:
                if (response === "+PONG\r\n") {
                    // After PING response, send first REPLCONF
                    const replconfPort = `*3\r\n$8\r\nREPLCONF\r\n$14\r\nlistening-port\r\n$${serverPort.toString().length}\r\n${serverPort}\r\n`;
                    masterConnection.write(replconfPort);
                    handshakeState = 1;
                }
                break;

            case 1:
                if (response === "+OK\r\n") {
                    // After first REPLCONF response, send second REPLCONF
                    masterConnection.write("*3\r\n$8\r\nREPLCONF\r\n$4\r\ncapa\r\n$6\r\npsync2\r\n");
                    handshakeState = 2;
                }
                break;

            case 2:
                if (response === "+OK\r\n") {
                    // After second REPLCONF response, send PSYNC
                    masterConnection.write("*3\r\n$5\r\nPSYNC\r\n$1\r\n?\r\n$2\r\n-1\r\n");
                    handshakeState = 3;
                }
                break;

            case 3:
                if (response.startsWith("+FULLRESYNC")) {
                    console.log("Handshake completed successfully");
                    handshakeState = 4;
                }
                break;
        }
    });
}

// Function to connect to master if we're a replica
function connectToMaster() {
    if (serverType === "slave" && masterHost && masterPort) {
        const masterConnection = new net.Socket();

        masterConnection.connect(masterPort, masterHost, () => {
            console.log(`Connected to master at ${masterHost}:${masterPort}`);

            // Start handshake with PING
            masterConnection.write("*1\r\n$4\r\nPING\r\n");
            handleHandshake(masterConnection);
        });

        masterConnection.on('error', (err) => {
            console.error(`Error connecting to master: ${err}`);
        });
    }
}

server.listen(serverPort, '127.0.0.1', () => {
    console.log(`Server is listening on port ${serverPort} as ${serverType}`);
    connectToMaster();
});