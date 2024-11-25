const net = require("net");

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const serverType = args.indexOf("--replicaof") != -1 ? "slave" : "master";
const serverPort = portIndex != -1 ? args[portIndex + 1] : 6379;

const server = net.createServer((connection) => {
    const keyValuePairs = {};
    const expiryTimes = {};

    function isExpired(key) {
        return expiryTimes[key] && Date.now() > expiryTimes[key];
    }

    function deleteKey(key) {
        delete keyValuePairs[key];
        delete expiryTimes[key];
    }

    connection.on('data', (data) => {
        const input = Buffer.from(data).toString().split("\r\n");
        let streamLength = input.length;

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

            const pxIndex = input.indexOf("PX");
            if (pxIndex !== -1 && input[pxIndex + 1]) {
                const expiry = parseInt(input[pxIndex + 1]);
                const expiryTime = Date.now() + expiry;
                expiryTimes[key] = expiryTime;
            } else {
                delete expiryTimes[key];  // Remove any existing expiry
            }

            keyValuePairs[key] = value;
            connection.write("+OK\r\n");

        } else if (input.includes("GET")) {
            const key = input[4];

            // Check if the key exists and hasn't expired
            if (key in keyValuePairs) {
                if (isExpired(key)) {
                    deleteKey(key);
                    connection.write("$-1\r\n");
                } else {
                    const value = keyValuePairs[key];
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
    const cleanupInterval = setInterval(() => {
        for (const key in expiryTimes) {
            if (isExpired(key)) {
                deleteKey(key);
            }
        }
    }, 100); // Run cleanup every 100ms

    connection.on('end', () => {
        clearInterval(cleanupInterval);
    });
});

server.listen(serverPort, '127.0.0.1', () => {
    console.log(`Server is listening on port ${serverPort} as ${serverType}`);
});