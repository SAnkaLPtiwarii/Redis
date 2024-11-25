const net = require("net");

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const serverType = args.indexOf("--replicaof") != -1 ? "slave" : "master";
const serverPort = portIndex != -1 ? args[portIndex + 1] : 6379;

const server = net.createServer((connection) => {
    const keyValuePairs = {};
    const keyExpiries = {};

    connection.on('data', (data) => {
        const input = Buffer.from(data).toString().split("\r\n");
        let command = input[2]?.toUpperCase();

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
                const expiryTime = parseInt(input[pxIndex + 1]);
                if (!isNaN(expiryTime)) {
                    setTimeout(() => {
                        if (keyValuePairs[key] !== undefined) {
                            delete keyValuePairs[key];
                        }
                    }, expiryTime);
                }
            }
            connection.write("+OK\r\n");

        } else if (input.includes("GET")) {
            const key = input[4];
            const value = keyValuePairs[key];

            if (value === undefined) {
                connection.write("$-1\r\n");  // Null bulk string
            } else {
                connection.write(`$${value.length}\r\n${value}\r\n`);
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