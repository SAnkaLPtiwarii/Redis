const net = require("net");

// Parse command-line arguments
const getPortNumber = () => {
    const args = process.argv.slice(2);
    const portIdx = args.indexOf("--port");
    if (portIdx !== -1 && args[portIdx + 1]) {
        const port = parseInt(args[portIdx + 1], 10);
        if (!isNaN(port)) {
            return port;
        }
    }
    return 6379;
};

const args = process.argv.slice(2);
const replicaIdx = args.indexOf("--replicaof");
const replicaDetails = replicaIdx === -1 ? '' : args.slice(replicaIdx + 1).join(' ');
const [masterHost, masterPort] = replicaDetails ? replicaDetails.split(' ') : [null, null];
const serverType = masterHost && masterPort ? "slave" : "master";

// In-memory store for key-value pairs and expiry timestamps
const store = new Map();
const expiryTimes = new Map();

const isExpired = (key) => {
    if (!expiryTimes.has(key)) return false;
    return Date.now() > expiryTimes.get(key);
};

const cleanupExpiredKey = (key) => {
    store.delete(key);
    expiryTimes.delete(key);
};

// Function to handle incoming data
const handleData = (data, connection) => {
    const commands = Buffer.from(data).toString().split("\r\n");
    const command = commands[2]?.toUpperCase();

    if (!command) {
        return connection.write("-ERR Malformed command\r\n");
    }

    if (command === "ECHO") {
        if (commands.length < 5) {
            return connection.write("-ERR Malformed command\r\n");
        }
        const str = commands[4];
        const l = str.length;
        return connection.write(`$${l}\r\n${str}\r\n`);
    } else if (command === "SET") {
        if (commands.length < 7) {
            return connection.write("-ERR Malformed command\r\n");
        }
        const key = commands[4];
        const value = commands[6];

        store.set(key, value);

        // Handle PX argument for expiry
        const pxIndex = commands.indexOf("PX");
        if (pxIndex !== -1 && commands[pxIndex + 1]) {
            const milliseconds = parseInt(commands[pxIndex + 1], 10);
            const expiryTime = Date.now() + milliseconds;
            expiryTimes.set(key, expiryTime);

            // Schedule cleanup
            setTimeout(() => {
                cleanupExpiredKey(key);
            }, milliseconds);
        } else {
            // If no expiry is set, remove any existing expiry
            expiryTimes.delete(key);
        }

        return connection.write("+OK\r\n");
    } else if (command === "GET") {
        if (commands.length < 5) {
            return connection.write("-ERR Malformed command\r\n");
        }
        const key = commands[4];

        // Check if key exists and hasn't expired
        if (store.has(key)) {
            if (isExpired(key)) {
                cleanupExpiredKey(key);
                return connection.write("$-1\r\n");
            }
            const value = store.get(key);
            return connection.write(`$${value.length}\r\n${value}\r\n`);
        } else {
            return connection.write("$-1\r\n");
        }
    } else if (command === "INFO") {
        if (commands[4] && commands[4].toLowerCase() === "replication") {
            const infoLines = [];
            if (masterPort && masterPort !== getPortNumber()) {
                infoLines.push("role:slave");
            } else {
                infoLines.push("role:master");
            }
            const infoString = infoLines.join("\r\n");
            const infoResponse = `$${infoString.length}\r\n${infoString}\r\n`;
            return connection.write(infoResponse);
        } else {
            return connection.write("-ERR unknown INFO section\r\n");
        }
    } else {
        return connection.write("-ERR unknown command\r\n");
    }
};

const portNumber = getPortNumber();

// Create and start the server
const server = net.createServer((connection) => {
    connection.on("data", (data) => handleData(data, connection));
    connection.on("end", () => {
        console.log("Client disconnected");
    });
    connection.on("error", (err) => {
        console.error("Connection error: ", err);
    });
});

server.listen(portNumber, "127.0.0.1", () => {
    console.log(`Redis server is listening on port ${portNumber} as ${serverType}`);
});