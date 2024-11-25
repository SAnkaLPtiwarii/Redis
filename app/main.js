const net = require("net");

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const replicaIndex = args.indexOf("--replicaof");
const serverType = replicaIndex != -1 ? "slave" : "master";
const serverPort = portIndex != -1 ? args[portIndex + 1] : 6379;

// Parse master details if in replica mode
let masterHost, masterPort;
if (serverType === "slave" && args[replicaIndex + 1]) {
    [masterHost, masterPort] = args[replicaIndex + 1].split(" ");
    masterPort = parseInt(masterPort);
}

// Function to handle master's response during handshake
function handleMasterResponse(masterConnection, response) {
    if (response === "+PONG\r\n") {
        // After PONG, send first REPLCONF
        const replconfPort = `*3\r\n$8\r\nREPLCONF\r\n$14\r\nlistening-port\r\n$${serverPort.toString().length}\r\n${serverPort}\r\n`;
        masterConnection.write(replconfPort);
    } else if (response === "+OK\r\n") {
        // After first OK, send second REPLCONF
        const replconfCapa = "*3\r\n$8\r\nREPLCONF\r\n$4\r\ncapa\r\n$6\r\npsync2\r\n";
        masterConnection.write(replconfCapa);
    }
}

// Function to connect to master if we're a replica
function connectToMaster() {
    if (serverType === "slave" && masterHost && masterPort) {
        const masterConnection = new net.Socket();

        masterConnection.connect(masterPort, masterHost, () => {
            // Send PING as first part of handshake
            masterConnection.write("*1\r\n$4\r\nPING\r\n");
        });

        masterConnection.on('data', (data) => {
            handleMasterResponse(masterConnection, data.toString());
        });

        masterConnection.on('error', (err) => {
            console.error(`Error connecting to master: ${err}`);
        });
    }
}

// Regular server implementation for handling client connections
const server = net.createServer((connection) => {
    connection.on('data', (data) => {
        const input = Buffer.from(data).toString().split("\r\n");
        const command = input[2]?.toUpperCase();

        if (command === "PING") {
            connection.write("+PONG\r\n");
        } else if (command === "REPLCONF") {
            connection.write("+OK\r\n");
        } else if (command === "INFO" && input[4]?.toLowerCase() === "replication") {
            const info = `role:${serverType}\r\nmaster_replid:8371b4fb1155b71f4a04d3e1bc3e18c4a990aeeb\r\nmaster_repl_offset:0`;
            connection.write(`$${info.length}\r\n${info}\r\n`);
        }
    });
});

server.listen(serverPort, '127.0.0.1', () => {
    console.log(`Server is listening on port ${serverPort} as ${serverType}`);
    connectToMaster();
});