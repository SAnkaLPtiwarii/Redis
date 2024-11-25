const net = require("net");

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const serverType = args.indexOf("--replicaof") != -1 ? "slave" : "master";
const serverPort = portIndex != -1 ? args[portIndex + 1] : 6379;

const server = net.createServer((connection) => {
    // Store both values and expiry times
    const store = new Map();
    const expiry = new Map();

    // Helper function to check if a key is expired
    const isExpired = (key) => {
        if (!expiry.has(key)) return false;
        return Date.now() > expiry.get(key);
    };

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

            store.set(key, value);

            const pxIndex = input.indexOf("PX");
            if (pxIndex !== -1 && input[pxIndex + 1]) {
                const milliseconds = parseInt(input[pxIndex + 1]);
                expiry.set(key, Date.now() + milliseconds);
            }

            connection.write("+OK\r\n");

        } else if (input.includes("GET")) {
            const key = input[4];

            // Check if key exists and is not expired
            if (store.has(key)) {
                if (isExpired(key)) {
                    store.delete(key);
                    expiry.delete(key);
                    connection.write("$-1\r\n");
                } else {
                    const value = store.get(key);
                    connection.write(`$${value.length}\r\n${value}\r\n`);
                }
            } else {
                connection.write("$-1\r\n");
            }

        } else if (input.includes("INFO")) {
            const serverKeyValuePair = `role:${serverType}`;
            connection.write(`$${serverKeyValuePair.length}\r\n${serverKeyValuePair}\r\n`);
        }
    });

    // Cleanup expired keys periodically
    const cleanup = setInterval(() => {
        for (const [key, expiryTime] of expiry) {
            if (Date.now() > expiryTime) {
                store.delete(key);
                expiry.delete(key);
            }
        }
    }, 1); // Run very frequently to ensure precise timing

    connection.on('end', () => {
        clearInterval(cleanup);
    });
});

server.listen(serverPort, '127.0.0.1', () => {
    console.log(`Server is listening on port ${serverPort} as ${serverType}`);
});