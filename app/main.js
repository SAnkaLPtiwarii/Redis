const net = require("net");
const { argv } = require("process");

console.log("Logs from your program will appear here!");

// Store key-value pairs
// Parse command-line arguments
const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const replicaIndex = args.indexOf("--replicaof");

const port = portIndex !== -1 && args[portIndex + 1] ? parseInt(args[portIndex + 1], 10) : 6379;
const isReplica = replicaIndex !== -1 && args[replicaIndex + 1] && args[replicaIndex + 2];
const serverType = isReplica ? "slave" : "master";

// In-memory store for key-value pairs and expiry times
const store = new Map();

// Function to handle incoming data
const handleData = (data, connection) => {
    const commands = Buffer.from(data).toString().split("\r\n");

    if (commands.length < 2) {
        connection.write("-ERR Malformed command\r\n");
        return;
    }

    const command = commands[2].toUpperCase(); // ECHO, SET, GET commands are expected in uppercase

    if (command === "ECHO") {
        if (commands.length < 5) {
            connection.write("-ERR Malformed command\r\n");
            return;
        }
        const str = commands[4];
        connection.write(`$${str.length}\r\n${str}\r\n`);
    } else if (command === "SET") {
        if (commands.length < 7) {
            connection.write("-ERR Malformed command\r\n");
            return;
        }
        const key = commands[4];
        const value = commands[6];
        store.set(key, value);

        // Check for PX (expiry in milliseconds) argument
        if (commands.length >= 11 && commands[8].toUpperCase() === "PX") {
            const expiryTime = parseInt(commands[10], 10);
            const expiryDate = Date.now() + expiryTime;
            expiries.set(key, expiryDate);

            setTimeout(() => {
                store.delete(key);
                expiries.delete(key);
            }, expiryTime);
        }

        connection.write("+OK\r\n");
    } else if (command === "GET") {
        if (commands.length < 5) {
            connection.write("-ERR Malformed command\r\n");
            return;
        }
        const key = commands[4];
        if (store.has(key)) {
            const value = store.get(key);

            // Check if the key has expired
            if (expiries.has(key) && expiries.get(key) < Date.now()) {
                store.delete(key);
                expiries.delete(key);
                connection.write("$-1\r\n");
                return;
            }

            connection.write(`$${value.length}\r\n${value}\r\n`);
        } else {
            connection.write("$-1\r\n");
        }
    } else if (command === "PING") {
        connection.write("+PONG\r\n");
    }
    else if (command === "INFO") {
        connection.write("$11\r\nrole:master\r\n")
        const serverKeyValuePair = `role:${serverType}`
        connection.write(`$${serverKeyValuePair.length}\r\n${serverKeyValuePair}\r\n`)
    }

    else {
        connection.write("-ERR unknown command\r\n");
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
    console.log(`Redis server is listening on port ${port}`);
});

// Ensure the server does not terminate

