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

// Function to connect to master if we're a replica
function connectToMaster() {
    if (serverType === "slave" && masterHost && masterPort) {
        const masterConnection = new net.Socket();

        masterConnection.connect(masterPort, masterHost, () => {
            console.log(`Connected to master at ${masterHost}:${masterPort}`);

            // Send PING as first part of handshake
            masterConnection.write("*1\r\n$4\r\nPING\r\n");
        });

        masterConnection.on('data', (data) => {
            // Handle master's response
            const response = data.toString();
            console.log(`Received from master: ${response}`);
        });

        masterConnection.on('error', (err) => {
            console.error(`Error connecting to master: ${err}`);
        });
    }
}

server.listen(serverPort, '127.0.0.1', () => {
    console.log(`Server is listening on port ${serverPort} as ${serverType}`);
    // Connect to master after server is listening
    connectToMaster();
});