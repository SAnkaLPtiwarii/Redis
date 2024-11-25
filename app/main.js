const net = require("net");

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const serverType = args.indexOf("--replicaof") != -1 ? "slave" : "master";
const serverPort = portIndex != -1 ? args[portIndex + 1] : 6379;

const server = net.createServer((connection) => {
    const keyValuePairs = {};
    const expiries = {};

    connection.on('data', (data) => {
        const input = Buffer.from(data).toString().split("\r\n");

        if (input.includes("PING")) {
            connection.write("+PONG\r\n");
        } else if (input.includes("ECHO")) {
            const messageIndex = input.indexOf("ECHO") + 2;
            if (messageIndex < input.length) {
                const message = input[messageIndex];
                connection.write(`$${message.length}\r\n${message}\r\n`);
            }
        } else if (input.includes("SET")) {
            const key = input[4];
            const value = input[6];

            keyValuePairs[key] = value;

            const pxIndex = input.indexOf("PX");
            if (pxIndex !== -1 && input[pxIndex + 1]) {
                const ttl = parseInt(input[pxIndex + 1]);
                expiries[key] = Date.now() + ttl;
            }
            connection.write("+OK\r\n");

        } else if (input.includes("GET")) {
            const key = input[4];
            const expiry = expiries[key];

            // If key has an expiry and it's passed, delete it
            if (expiry && Date.now() >= expiry) {
                delete keyValuePairs[key];
                delete expiries[key];
            }

            // Now check if key exists (after potential deletion)
            if (key in keyValuePairs) {
                const value = keyValuePairs[key];
                connection.write(`$${value.length}\r\n${value}\r\n`);
            } else {
                connection.write("$-1\r\n");
            }

        } else if (input.includes("INFO")) {
            const serverKeyValuePair = `role:${serverType}`;
            connection.write(`$${serverKeyValuePair.length}\r\n${serverKeyValuePair}\r\n`);
        }
    });
});

server.listen(serverPort, '127.0.0.1', () => {
    console.log(`Server is listening on port ${serverPort} as ${serverType}`);
});