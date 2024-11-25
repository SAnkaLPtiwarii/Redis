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
        const command = input[2]?.toUpperCase();

        // Parse command and handle each case
        switch (command) {
            case "PING":
                connection.write("+PONG\r\n");
                break;

            case "REPLCONF":
                // Always respond with OK for REPLCONF commands
                connection.write("+OK\r\n");
                break;

            case "ECHO":
                connection.write(`${input[3]}\r\n${input[4]}\r\n`);
                break;

            case "SET":
                const setKey = input[4];
                const setValue = input[6];
                if (!input.includes("PX") && !input.includes("px") && !input.includes("pX") && !input.includes("Px")) {
                    keyValuePairs[setKey] = setValue;
                } else {
                    const pxIndex = input.indexOf("PX");
                    const time = input[pxIndex + 1];
                    expValuePairs[setKey] = Date.now() + parseInt(time);
                    keyValuePairs[setKey] = setValue;
                }
                connection.write("+OK\r\n");
                break;

            case "GET":
                const getKey = input[4];

                if (!(getKey in keyValuePairs)) {
                    connection.write("$-1\r\n");
                    return;
                }

                if (getKey in expValuePairs) {
                    if (Date.now() > expValuePairs[getKey]) {
                        delete keyValuePairs[getKey];
                        delete expValuePairs[getKey];
                        connection.write("$-1\r\n");
                        return;
                    }
                }

                const value = keyValuePairs[getKey];
                connection.write(`$${value.length}\r\n${value}\r\n`);
                break;

            case "INFO":
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
                break;

            default:
                connection.write("-ERR unknown command\r\n");
        }
    });
});

// Only connect to master if we're a replica
if (serverType === "slave") {
    const masterConnection = new net.Socket();

    masterConnection.connect(masterPort, masterHost, () => {
        console.log(`Connected to master at ${masterHost}:${masterPort}`);

        // Send PING
        masterConnection.write("*1\r\n$4\r\nPING\r\n");
    });

    let handshakeState = 0;
    masterConnection.on('data', (data) => {
        const response = data.toString();

        switch (handshakeState) {
            case 0:
                if (response === "+PONG\r\n") {
                    // Send first REPLCONF
                    const replconfPort = `*3\r\n$8\r\nREPLCONF\r\n$14\r\nlistening-port\r\n$${serverPort.toString().length}\r\n${serverPort}\r\n`;
                    masterConnection.write(replconfPort);
                    handshakeState = 1;
                }
                break;

            case 1:
                if (response === "+OK\r\n") {
                    // Send second REPLCONF
                    masterConnection.write("*3\r\n$8\r\nREPLCONF\r\n$4\r\ncapa\r\n$6\r\npsync2\r\n");
                    handshakeState = 2;
                }
                break;

            case 2:
                if (response === "+OK\r\n") {
                    // Ready for next stage
                    handshakeState = 3;
                }
                break;
        }
    });

    masterConnection.on('error', (err) => {
        console.error(`Error connecting to master: ${err}`);
    });
}

server.listen(serverPort, '127.0.0.1', () => {
    console.log(`Server is listening on port ${serverPort} as ${serverType}`);
});