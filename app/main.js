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

function parseRESPArray(input) {
    const lines = input.split("\r\n");
    const command = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('$') && i + 1 < lines.length) {
            command.push(lines[i + 1]);
            i++;
        }
    }
    return command;
}

const server = net.createServer((connection) => {
    const keyValuePairs = {};
    const expValuePairs = {};

    connection.on('data', (data) => {
        const input = Buffer.from(data).toString();
        const command = parseRESPArray(input);

        if (!command || command.length === 0) {
            return;
        }

        const mainCommand = command[0].toUpperCase();

        switch (mainCommand) {
            case "PING":
                connection.write("+PONG\r\n");
                break;

            case "REPLCONF":
                connection.write("+OK\r\n");
                break;

            case "ECHO":
                if (command.length >= 2) {
                    const message = command[1];
                    connection.write(`$${message.length}\r\n${message}\r\n`);
                }
                break;

            case "SET":
                if (command.length >= 3) {
                    const key = command[1];
                    const value = command[2];

                    keyValuePairs[key] = value;

                    if (command.includes("PX")) {
                        const pxIndex = command.indexOf("PX");
                        if (pxIndex !== -1 && command[pxIndex + 1]) {
                            const expiry = parseInt(command[pxIndex + 1]);
                            expValuePairs[key] = Date.now() + expiry;
                        }
                    }
                    connection.write("+OK\r\n");
                }
                break;

            case "GET":
                if (command.length >= 2) {
                    const key = command[1];

                    if (key in expValuePairs) {
                        if (Date.now() > expValuePairs[key]) {
                            delete keyValuePairs[key];
                            delete expValuePairs[key];
                            connection.write("$-1\r\n");
                            break;
                        }
                    }

                    if (key in keyValuePairs) {
                        const value = keyValuePairs[key];
                        connection.write(`$${value.length}\r\n${value}\r\n`);
                    } else {
                        connection.write("$-1\r\n");
                    }
                }
                break;

            case "INFO":
                if (command.length >= 2 && command[1].toLowerCase() === "replication") {
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

// Function to handle the handshake process
function handleHandshake(masterConnection) {
    let handshakeState = 0;

    masterConnection.on('data', (data) => {
        const response = data.toString();

        switch (handshakeState) {
            case 0:
                if (response === "+PONG\r\n") {
                    const replconfPort = `*3\r\n$8\r\nREPLCONF\r\n$14\r\nlistening-port\r\n$${serverPort.toString().length}\r\n${serverPort}\r\n`;
                    masterConnection.write(replconfPort);
                    handshakeState = 1;
                }
                break;

            case 1:
                if (response === "+OK\r\n") {
                    masterConnection.write("*3\r\n$8\r\nREPLCONF\r\n$4\r\ncapa\r\n$6\r\npsync2\r\n");
                    handshakeState = 2;
                }
                break;

            case 2:
                if (response === "+OK\r\n") {
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