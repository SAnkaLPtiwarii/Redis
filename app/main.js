const net = require("net");

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const replicaIndex = args.indexOf("--replicaof");
const serverType = replicaIndex != -1 ? "slave" : "master";
const serverPort = portIndex != -1 ? args[portIndex + 1] : 6379;

// Constants for replication
const REPLICATION_ID = "8371b4fb1155b71f4a04d3e1bc3e18c4a990aeeb";
const REPLICATION_OFFSET = 0;

function handleCommand(input) {
    const command = input[2]?.toUpperCase();

    switch (command) {
        case "PING":
            return "+PONG\r\n";

        case "REPLCONF":
            return "+OK\r\n";

        case "PSYNC":
            return `+FULLRESYNC ${REPLICATION_ID} 0\r\n`;

        case "ECHO":
            const message = input[4];
            return `$${message.length}\r\n${message}\r\n`;

        case "INFO":
            if (input[4]?.toLowerCase() === "replication") {
                const infoLines = [
                    `role:${serverType}`,
                    `master_replid:${REPLICATION_ID}`,
                    `master_repl_offset:${REPLICATION_OFFSET}`
                ];
                const infoString = infoLines.join("\r\n");
                return `$${infoString.length}\r\n${infoString}\r\n`;
            }
            return "-ERR unknown INFO section\r\n";

        case "SET": {
            const key = input[4];
            const value = input[6];
            const pxIndex = input.indexOf("PX");

            if (pxIndex !== -1) {
                const expiry = parseInt(input[pxIndex + 1]);
                const expiryTime = Date.now() + expiry;
                keyExpiries[key] = expiryTime;
            }

            keyValues[key] = value;
            return "+OK\r\n";
        }

        case "GET": {
            const key = input[4];
            if (key in keyExpiries && Date.now() > keyExpiries[key]) {
                delete keyValues[key];
                delete keyExpiries[key];
                return "$-1\r\n";
            }

            const value = keyValues[key];
            if (value === undefined) {
                return "$-1\r\n";
            }
            return `$${value.length}\r\n${value}\r\n`;
        }

        default:
            return "-ERR unknown command\r\n";
    }
}

// Store for key-values and expiries
const keyValues = {};
const keyExpiries = {};

// Create server
const server = net.createServer((connection) => {
    connection.on('data', (data) => {
        const input = Buffer.from(data).toString().split("\r\n");
        const response = handleCommand(input);
        connection.write(response);
    });
});

server.listen(serverPort, '127.0.0.1', () => {
    console.log(`Server is listening on port ${serverPort} as ${serverType}`);

    // If we're a replica, connect to master
    if (serverType === "slave" && args[replicaIndex + 1]) {
        const [masterHost, masterPort] = args[replicaIndex + 1].split(" ");
        const masterConnection = new net.Socket();

        masterConnection.connect(parseInt(masterPort), masterHost, () => {
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
                        const replconfPort = `*3\r\n$8\r\nREPLCONF\r\n$14\r\nlistening-port\r\n$${serverPort.toString().length}\r\n${serverPort}\r\n`;
                        masterConnection.write(replconfPort);
                        handshakeState = 1;
                    }
                    break;

                case 1:
                    if (response === "+OK\r\n") {
                        const replconfCapa = "*3\r\n$8\r\nREPLCONF\r\n$4\r\ncapa\r\n$6\r\npsync2\r\n";
                        masterConnection.write(replconfCapa);
                        handshakeState = 2;
                    }
                    break;

                case 2:
                    if (response === "+OK\r\n") {
                        masterConnection.write("*3\r\n$5\r\nPSYNC\r\n$1\r\n?\r\n$2\r\n-1\r\n");
                        handshakeState = 3;
                    }
                    break;
            }
        });

        masterConnection.on('error', (err) => {
            console.error(`Error connecting to master: ${err}`);
        });
    }
});