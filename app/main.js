const net = require("net");

// Parse command-line arguments
const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const replicaIndex = args.indexOf("--replicaof");

const port = portIndex !== -1 && args[portIndex + 1] ? parseInt(args[portIndex + 1], 10) : 6379;
const serverType = replicaIndex !== -1 && args[replicaIndex + 1] && args[replicaIndex + 2] ? "slave" : "master";

// In-memory store for key-value pairs and expiry times
const store = new Map();
const expiries = new Map();

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
        const pxIndex = commands.indexOf("PX");
        if (pxIndex !== -1 && commands[pxIndex + 1]) {
            const expiry = parseInt(commands[pxIndex + 1], 10);
            const timeout = setTimeout(() => {
                store.delete(key);
            }, expiry);
            expiries.set(key, timeout);
        }
        return connection.write("+OK\r\n");
    } else if (command === "GET") {
        if (commands.length < 5) {
            return connection.write("-ERR Malformed command\r\n");
        }
        const key = commands[4];
        if (store.has(key)) {
            const value = store.get(key);
            const l = value.length;
            return connection.write(`$${l}\r\n${value}\r\n`);
        } else {
            return connection.write("$-1\r\n");
        }
    } else if (command === "INFO") {
        if (commands[4] === "replication") {
            const infoLines = [`role:${serverType}`];
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

server.listen(port, "127.0.0.1", () => {
    console.log(`Redis server is listening on port ${port} as ${serverType}`);
});
